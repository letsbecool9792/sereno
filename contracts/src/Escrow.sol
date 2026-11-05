// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {INTENT_HEADER, SIGNING_NAMESPACE} from "./Constants.sol";
import {IKeyOracle} from "./interfaces/IKeyOracle.sol";
import {ISshSigVerifier} from "./SshSigVerifier.sol";
import {AccountFactory} from "./AccountFactory.sol";
import {Text} from "./libraries/Text.sol";
import {SafeToken} from "./libraries/SafeToken.sol";

/// Pay a GitHub ID with a deadline. The developer accepts by signing `claimText(id)` with any SSH key currently on
/// their GitHub profile; the money goes to their SshAccount. If nobody claims by the deadline, the sender can take it
/// back. No owner, so the CREATE2 address is the same on every chain.
contract Escrow {
    using SafeToken for address;

    struct Deposit {
        address sender;
        uint64 deadline;
        bool done;
        address token;
        uint256 githubId;
        uint256 amount;
    }

    IKeyOracle public immutable oracle;
    ISshSigVerifier public immutable verifier;
    AccountFactory public immutable accounts;

    Deposit[] public deposits;

    event Deposited(uint256 indexed id, uint256 indexed githubId, address sender, address token, uint256 amount, uint64 deadline);
    event Claimed(uint256 indexed id, uint256 indexed githubId, address account, bytes32 keyHash);
    event Reclaimed(uint256 indexed id, address sender);

    error BadAmount();
    error BadDeadline();
    error AlreadyDone();
    error BadSignature();
    error KeyNotOnProfile();
    error NotSender();
    error TooEarly();

    constructor(IKeyOracle oracle_, ISshSigVerifier verifier_, AccountFactory accounts_) {
        oracle = oracle_;
        verifier = verifier_;
        accounts = accounts_;
    }

    /// Escrow `amount` of `token` (approve it first) for `githubId` until `deadline`.
    function deposit(uint256 githubId, address token, uint256 amount, uint64 deadline) external returns (uint256 id) {
        if (amount == 0) revert BadAmount();
        if (deadline <= block.timestamp) revert BadDeadline();
        token.pull(msg.sender, amount);
        id = deposits.length;
        deposits.push(Deposit(msg.sender, deadline, false, token, githubId, amount));
        emit Deposited(id, githubId, msg.sender, token, amount, deadline);
    }

    /// The exact text a claim signs (ssh-keygen -Y sign in namespace SIGNING_NAMESPACE, -O hashalg=sha256).
    function claimText(uint256 id) public view returns (bytes memory) {
        Deposit storage d = deposits[id];
        return abi.encodePacked(
            INTENT_HEADER,
            "\nchain: ",
            Text.dec(block.chainid),
            "\nescrow: ",
            Text.hexAddress(address(this)),
            "\nclaim: ",
            Text.dec(id),
            "\ngithub-id: ",
            Text.dec(d.githubId),
            "\naccount: ",
            Text.hexAddress(accounts.addressOf(d.githubId)),
            "\n"
        );
    }

    /// Anyone may submit; the money always goes to the GitHub ID's account.
    function claim(uint256 id, bytes calldata sshsig) external {
        Deposit storage d = deposits[id];
        if (d.done) revert AlreadyDone();
        (bool ok, bytes memory publicKey) = verifier.verify(sshsig, claimText(id), bytes(SIGNING_NAMESPACE));
        if (!ok) revert BadSignature();
        bytes32 keyHash = keccak256(publicKey);
        if (oracle.firstSeen(d.githubId, keyHash) == 0) revert KeyNotOnProfile();
        d.done = true;
        address account = accounts.addressOf(d.githubId);
        d.token.send(account, d.amount);
        emit Claimed(id, d.githubId, account, keyHash);
    }

    /// After the deadline, the sender takes back an unclaimed deposit.
    function reclaim(uint256 id) external {
        Deposit storage d = deposits[id];
        if (msg.sender != d.sender) revert NotSender();
        if (d.done) revert AlreadyDone();
        if (block.timestamp < d.deadline) revert TooEarly();
        d.done = true;
        d.token.send(d.sender, d.amount);
        emit Reclaimed(id, d.sender);
    }

    function depositCount() external view returns (uint256) {
        return deposits.length;
    }
}
