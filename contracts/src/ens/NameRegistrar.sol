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
/// Holds the registrar role on our UserRegistry (the subregistry of the parent name). Lives on Ethereum Sepolia with
/// ENSv2; the account address it records is the same on every chain.
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

    event Claimed(string label, uint256 indexed githubId, address account, address resolver);

    error NotYourLogin();
    error BadSignature();
    error KeyNotOnProfile();

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

        address account = accounts.addressOf(githubId);
        resolver = proxyFactory.deployProxy(resolverImplementation, githubId, _resolverInit(account));
        uint256 ownerRoles = RegistryRoles.SET_SUBREGISTRY | RegistryRoles.SET_RESOLVER
            | (RegistryRoles.SET_SUBREGISTRY << RegistryRoles.ADMIN_SHIFT)
            | (RegistryRoles.SET_RESOLVER << RegistryRoles.ADMIN_SHIFT) | RegistryRoles.CAN_TRANSFER_ADMIN;
        registry.register(label, account, address(0), resolver, ownerRoles, expiry);
        emit Claimed(label, githubId, account, resolver);
    }

    /// Grants every record role (and its admin) to the account only, and sets the default record's address for each
    /// chain in the same transaction (PermissionedResolver skips role checks during initialize).
    function _resolverInit(address account) internal view returns (bytes memory) {
        Grant[] memory grants = new Grant[](1);
        grants[0] = Grant(account, ResolverRoles.ALL_SETTERS | (ResolverRoles.ALL_SETTERS << ResolverRoles.ADMIN_SHIFT));
        bytes[] memory calls = new bytes[](_coinTypes.length);
        for (uint256 i = 0; i < _coinTypes.length; i++) {
            calls[i] = abi.encodeCall(IPermissionedResolver.setAddress, (hex"00", _coinTypes[i], abi.encodePacked(account)));
        }
        return abi.encodeCall(IPermissionedResolver.initialize, (grants, calls));
    }
}
