// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {KeyOracle} from "./KeyOracle.sol";
import {AccountFactory} from "./AccountFactory.sol";
import {SafeToken} from "./libraries/SafeToken.sol";

/// Issue bounties paid by GitHub ID. Anyone funds `owner/repo#issue`; when a Chainlink CRE workflow confirms a merged
/// PR that closes the issue, the whole pot goes to the PR author's SshAccount (which may not exist yet). Each funder
/// can take their own contribution back after their deadline if the bounty is still unsettled.
///
/// Reports come through the same CRE forwarder the KeyOracle trusts, so this contract has no owner and identical
/// constructor arguments on every chain (same CREATE2 address everywhere).
contract BountyBoard {
    using SafeToken for address;

    struct Bounty {
        address token;
        bool settled;
        uint256 total;
    }

    struct Contribution {
        uint192 amount;
        uint64 deadline;
    }

    KeyOracle public immutable oracle;
    AccountFactory public immutable accounts;

    /// Keyed by bountyId(repoHash, issue).
    mapping(bytes32 id => Bounty) public bounties;
    mapping(bytes32 id => mapping(address funder => Contribution)) public contributions;

    event Funded(bytes32 indexed id, bytes32 indexed repoHash, uint256 issue, address funder, uint256 amount, uint64 deadline);
    event Settled(bytes32 indexed id, uint256 indexed authorGithubId, address account, uint256 amount);
    event Refunded(bytes32 indexed id, address funder, uint256 amount);

    error NotForwarder();
    error WrongToken();
    error BadAmount();
    error BadDeadline();
    error NoBounty();
    error AlreadySettled();
    error TooEarly();
    error NothingToRefund();

    constructor(KeyOracle oracle_, AccountFactory accounts_) {
        oracle = oracle_;
        accounts = accounts_;
    }

    /// keccak256 of the lowercase "owner/repo", the repoHash in CRE reports.
    function repoHashOf(string calldata repo) public pure returns (bytes32) {
        bytes memory b = bytes(repo);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= "A" && b[i] <= "Z") b[i] = bytes1(uint8(b[i]) + 32);
        }
        return keccak256(b);
    }

    function bountyId(bytes32 repoHash, uint256 issue) public pure returns (bytes32) {
        return keccak256(abi.encode(repoHash, issue));
    }

    /// Escrow `amount` of `token` (approve it first) on `repo` ("owner/repo", any case) issue `issue`. The first
    /// funder picks the token. Funding again adds to your contribution and can only extend your deadline.
    function fund(string calldata repo, uint256 issue, address token, uint256 amount, uint64 deadline)
        external
        returns (bytes32 id)
    {
        if (amount == 0 || amount > type(uint192).max) revert BadAmount();
        if (deadline <= block.timestamp) revert BadDeadline();
        bytes32 repoHash = repoHashOf(repo);
        id = bountyId(repoHash, issue);
        Bounty storage b = bounties[id];
        if (b.settled) revert AlreadySettled();
        if (b.token == address(0)) b.token = token;
        else if (b.token != token) revert WrongToken();

        token.pull(msg.sender, amount);
        b.total += amount;
        Contribution storage c = contributions[id][msg.sender];
        c.amount += uint192(amount);
        if (deadline > c.deadline) c.deadline = deadline;
        emit Funded(id, repoHash, issue, msg.sender, amount, c.deadline);
    }

    /// CRE receiver entry point. `report` = abi.encode(bytes32 repoHash, uint256 issue, uint256 authorGithubId),
    /// sent only for a merged PR that closes `issue`.
    function onReport(bytes calldata, bytes calldata report) external {
        address forwarder = oracle.forwarder();
        if (msg.sender != forwarder || forwarder == address(0)) revert NotForwarder();
        (bytes32 repoHash, uint256 issue, uint256 authorGithubId) = abi.decode(report, (bytes32, uint256, uint256));
        bytes32 id = bountyId(repoHash, issue);
        Bounty storage b = bounties[id];
        if (b.settled) revert AlreadySettled();
        if (b.total == 0) revert NoBounty();
        b.settled = true;
        uint256 amount = b.total;
        address account = accounts.addressOf(authorGithubId);
        b.token.send(account, amount);
        emit Settled(id, authorGithubId, account, amount);
    }

    /// After your deadline, take back your contribution to a bounty nobody has earned yet.
    function refund(bytes32 repoHash, uint256 issue) external {
        bytes32 id = bountyId(repoHash, issue);
        Bounty storage b = bounties[id];
        if (b.settled) revert AlreadySettled();
        Contribution memory c = contributions[id][msg.sender];
        if (c.amount == 0) revert NothingToRefund();
        if (block.timestamp < c.deadline) revert TooEarly();
        delete contributions[id][msg.sender];
        b.total -= c.amount;
        b.token.send(msg.sender, c.amount);
        emit Refunded(id, msg.sender, c.amount);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == this.onReport.selector || interfaceId == 0x01ffc9a7; // IReceiver, ERC-165
    }
}
