// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {INTENT_HEADER, SIGNING_NAMESPACE} from "../Constants.sol";
import {IKeyOracle} from "../interfaces/IKeyOracle.sol";
import {ISshSigVerifier} from "../SshSigVerifier.sol";
import {AccountFactory} from "../AccountFactory.sol";
import {Text} from "../libraries/Text.sol";
import {
    Grant,
    IVerifiableFactory,
    IENSv2Registry,
    IPermissionedResolver,
    RegistryRoles,
    ResolverRoles
} from "./IENSv2.sol";

/// "Claim your name": turns `<login>.<parent>` from a wildcard answer into a real ENSv2 subname, owned by the user's
/// SshAccount, with its own PermissionedResolver whose records only that account can change. Permissionless: anyone
/// can submit a claim signed (`ssh-keygen -Y sign`, or a phone) by a key listed for the GitHub ID. The login-to-ID
/// mapping comes from the key oracle, so nobody can claim someone else's username.
///
/// A claimed name doesn't follow a GitHub rename by itself. It is *stale* once the oracle no longer maps its login to
/// the holder's GitHub ID (the holder renamed, or someone else now has the login). Anyone can then `release` it. A
/// released name is quarantined for 15 days: it resolves to nobody (the gateway refuses it too), so a payer who still
/// uses the old name gets an error instead of paying a stranger. Afterwards the login's current owner can claim it.
///
/// Holds the REGISTRAR and UNREGISTER roles on our UserRegistry (the subregistry of the parent name). Lives on
/// Ethereum Sepolia with ENSv2; the account address it records is the same on every chain.
contract NameRegistrar {
    IENSv2Registry public immutable registry;
    IVerifiableFactory public immutable proxyFactory;
    address public immutable resolverImplementation;
    AccountFactory public immutable accounts;
    IKeyOracle public immutable oracle;
    ISshSigVerifier public immutable verifier;
    uint64 public immutable expiry;
    string public parentName;
    uint256[] internal _coinTypes;
    /// Claims made per GitHub ID; part of each resolver proxy's salt, so a renamed user can claim their new login.
    mapping(uint256 githubId => uint256) public claimCount;
    /// The GitHub ID behind each claimed name (0 for names claimed through an earlier registrar).
    mapping(bytes32 labelHash => uint256) public claimedBy;
    /// The last release of each name: who held it, when, and their GitHub ID (0 if unknown).
    mapping(bytes32 labelHash => Release) public released;

    struct Release {
        address holder;
        uint64 releasedAt;
        uint256 githubId;
    }

    /// How long a released name resolves to nobody before someone else can claim it.
    uint256 public constant QUARANTINE = 15 days;

    /// The roles a claimed name's owner (the account) gets on it.
    uint256 internal constant OWNER_ROLES = RegistryRoles.SET_SUBREGISTRY | RegistryRoles.SET_RESOLVER
        | (RegistryRoles.SET_SUBREGISTRY << RegistryRoles.ADMIN_SHIFT)
        | (RegistryRoles.SET_RESOLVER << RegistryRoles.ADMIN_SHIFT) | RegistryRoles.CAN_TRANSFER_ADMIN;

    event Claimed(string label, uint256 indexed githubId, address account, address resolver);
    event Released(string label, address previousHolder, uint256 quarantinedUntil);

    error NotYourLogin();
    error BadSignature();
    error KeyNotOnProfile();
    error AlreadyClaimed();
    error NotClaimed();
    error NotStale();
    error StaleNotReleased();
    error Quarantined(uint256 until);

    constructor(
        IENSv2Registry registry_,
        IVerifiableFactory proxyFactory_,
        address resolverImplementation_,
        AccountFactory accounts_,
        IKeyOracle oracle_,
        ISshSigVerifier verifier_,
        string memory parentName_,
        uint64 expiry_,
        uint256[] memory coinTypes_
    ) {
        registry = registry_;
        proxyFactory = proxyFactory_;
        resolverImplementation = resolverImplementation_;
        accounts = accounts_;
        oracle = oracle_;
        verifier = verifier_;
        parentName = parentName_;
        expiry = expiry_;
        _coinTypes = coinTypes_;
    }

    function coinTypes() external view returns (uint256[] memory) {
        return _coinTypes;
    }

    /// The exact text a claim signs.
    function claimText(string calldata label, uint256 githubId) public view returns (bytes memory) {
        return abi.encodePacked(
            INTENT_HEADER,
            "\nchain: ",
            Text.dec(block.chainid),
            "\nclaim-name: ",
            label,
            ".",
            parentName,
            "\ngithub-id: ",
            Text.dec(githubId),
            "\naccount: ",
            Text.hexAddress(accounts.addressOf(githubId)),
            "\n"
        );
    }

    /// `label` is the lowercase GitHub login.
    function claim(string calldata label, uint256 githubId, bytes calldata sshsig) external returns (address resolver) {
        if (githubId == 0 || oracle.idOfLoginHash(keccak256(bytes(label))) != githubId) revert NotYourLogin();
        (bool ok, bytes memory publicKey) = verifier.verify(sshsig, claimText(label, githubId), bytes(SIGNING_NAMESPACE));
        if (!ok) revert BadSignature();
        if (oracle.firstSeen(githubId, keccak256(publicKey)) == 0) revert KeyNotOnProfile();
        resolver = _register(label, githubId);
    }

    /// Who holds `label` now, and whether that is stale: held by anyone other than the account of the GitHub ID the
    /// oracle currently maps the login to (or held while the login maps to nobody, because its owner renamed).
    function holderOf(string calldata label) public view returns (address holder, bool stale) {
        bytes32 labelHash = keccak256(bytes(label));
        holder = registry.getOwner(uint256(labelHash));
        uint256 current = oracle.idOfLoginHash(labelHash);
        stale = holder != address(0) && (current == 0 || holder != accounts.addressOf(current));
    }

    /// Frees a stale name. Anyone may call it: the proof is the oracle's current login-to-ID mapping, the same one
    /// `claim` trusts. The name is then quarantined for `QUARANTINE`, and afterwards follows GitHub live again.
    function release(string calldata label) external {
        (address holder, bool stale) = holderOf(label);
        if (holder == address(0)) revert NotClaimed();
        if (!stale) revert NotStale();
        bytes32 labelHash = keccak256(bytes(label));
        registry.unregister(uint256(labelHash));
        released[labelHash] = Release(holder, uint64(block.timestamp), claimedBy[labelHash]);
        delete claimedBy[labelHash];
        emit Released(label, holder, block.timestamp + QUARANTINE);
    }

    /// While `label` is quarantined: until when, who held it, and their GitHub ID (0 if unknown). Zeros otherwise.
    function quarantineOf(string calldata label)
        external
        view
        returns (uint256 until, address previousHolder, uint256 previousGithubId)
    {
        Release memory r = released[keccak256(bytes(label))];
        uint256 end = r.releasedAt + QUARANTINE;
        if (r.releasedAt != 0 && block.timestamp < end) return (end, r.holder, r.githubId);
    }

    /// Registers `label` to the account of `githubId` (whose login the oracle has confirmed), with a new resolver.
    function _register(string calldata label, uint256 githubId) internal returns (address resolver) {
        address account = accounts.addressOf(githubId);
        _checkAvailable(label, account);
        claimedBy[keccak256(bytes(label))] = githubId;
        uint256 salt = uint256(keccak256(abi.encode(githubId, claimCount[githubId]++)));
        resolver = proxyFactory.deployProxy(resolverImplementation, salt, _resolverInit(account, label));
        registry.register(label, account, address(0), resolver, OWNER_ROLES, expiry);
        emit Claimed(label, githubId, account, resolver);
    }

    /// Reverts unless `account` may take `label` now. Its previous holder may take it back at once (they renamed back).
    function _checkAvailable(string calldata label, address account) internal view {
        (address holder, bool stale) = holderOf(label);
        if (holder == account) revert AlreadyClaimed();
        if (stale) revert StaleNotReleased(); // `release` it first (anyone can); that starts the quarantine
        Release memory r = released[keccak256(bytes(label))];
        uint256 end = r.releasedAt + QUARANTINE;
        if (r.releasedAt != 0 && r.holder != account && block.timestamp < end) revert Quarantined(end);
    }

    /// Grants every record role (and its admin) to the account only, and sets the default record's address for each
    /// chain plus the `url`, `avatar` and `com.github` text records in the same transaction (PermissionedResolver
    /// skips role checks during initialize). The text records match what the gateway answers for unclaimed names.
    function _resolverInit(address account, string calldata login) internal view returns (bytes memory) {
        Grant[] memory grants = new Grant[](1);
        grants[0] = Grant(account, ResolverRoles.ALL_SETTERS | (ResolverRoles.ALL_SETTERS << ResolverRoles.ADMIN_SHIFT));
        uint256 n = _coinTypes.length;
        bytes[] memory calls = new bytes[](n + 3);
        for (uint256 i = 0; i < n; i++) {
            calls[i] = abi.encodeCall(IPermissionedResolver.setAddress, (hex"00", _coinTypes[i], abi.encodePacked(account)));
        }
        string memory profile = string.concat("https://github.com/", login);
        calls[n] = abi.encodeCall(IPermissionedResolver.setText, (hex"00", "url", profile));
        calls[n + 1] = abi.encodeCall(IPermissionedResolver.setText, (hex"00", "avatar", string.concat(profile, ".png")));
        calls[n + 2] = abi.encodeCall(IPermissionedResolver.setText, (hex"00", "com.github", login));
        return abi.encodeCall(IPermissionedResolver.initialize, (grants, calls));
    }
}
