// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {KeyOracle} from "./KeyOracle.sol";
import {AccountFactory} from "./AccountFactory.sol";
import {SafeToken} from "./libraries/SafeToken.sol";

/// Issue bounties paid by GitHub ID. Anyone funds `owner/repo#issue` in any token; each token has its own pot, so a
/// junk token can't block real ones. When a Chainlink CRE workflow confirms a merged PR that closes the issue, the
/// report records the PR author as the winner, and anyone can then pay each token's pot to the author's SshAccount
/// (which may not exist yet). Until then, each funder can take their own contribution back after their deadline.
///
/// Reports come through the KeyOracle's forwarder (the ReportGate), so this contract has no owner and identical
/// constructor arguments on every chain (same CREATE2 address everywhere).
contract BountyBoard {
    using SafeToken for address;

    struct Contribution {
        uint192 amount;
        uint64 deadline;
    }

    KeyOracle public immutable oracle;
    AccountFactory public immutable accounts;

    /// The PR author who closed the issue; 0 = unsettled. Keyed by issueKey(repoHash, issue).
    mapping(bytes32 issueKey => uint256 githubId) public winnerOf;
    /// Unpaid balance of each token's pot. Keyed by potKey(repoHash, issue, token).
    mapping(bytes32 potKey => uint256) public potOf;
    mapping(bytes32 potKey => mapping(address funder => Contribution)) public contributions;

    event Funded(
        bytes32 indexed repoHash, uint256 indexed issue, address indexed token, address funder, uint256 amount, uint64 deadline
    );
    event Settled(bytes32 indexed repoHash, uint256 indexed issue, uint256 indexed authorGithubId);
    event Paid(bytes32 indexed repoHash, uint256 indexed issue, address indexed token, address account, uint256 amount);
    event Refunded(bytes32 indexed repoHash, uint256 indexed issue, address indexed token, address funder, uint256 amount);

    error NotForwarder();
    error BadAmount();
    error BadDeadline();
    error BadAuthor();
    error AlreadySettled();
    error NotSettled();
    error NothingToPay();
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

    function issueKey(bytes32 repoHash, uint256 issue) public pure returns (bytes32) {
        return keccak256(abi.encode(repoHash, issue));
    }

    function potKey(bytes32 repoHash, uint256 issue, address token) public pure returns (bytes32) {
        return keccak256(abi.encode(repoHash, issue, token));
    }

    /// Escrow `amount` of `token` (approve it first) on `repo` ("owner/repo", any case) issue `issue`. Funding again
    /// adds to your contribution in that token and can only extend your deadline.
    function fund(string calldata repo, uint256 issue, address token, uint256 amount, uint64 deadline) external {
        if (amount == 0 || amount > type(uint192).max) revert BadAmount();
        if (deadline <= block.timestamp) revert BadDeadline();
        bytes32 repoHash = repoHashOf(repo);
        if (winnerOf[issueKey(repoHash, issue)] != 0) revert AlreadySettled();
        bytes32 pot = potKey(repoHash, issue, token);
        token.pull(msg.sender, amount);
        potOf[pot] += amount;
        Contribution storage c = contributions[pot][msg.sender];
        c.amount += uint192(amount);
        if (deadline > c.deadline) c.deadline = deadline;
        emit Funded(repoHash, issue, token, msg.sender, amount, c.deadline);
    }

    /// CRE receiver entry point. `report` = abi.encode(bytes32 repoHash, uint256 issue, uint256 authorGithubId), sent
    /// only for a merged PR that closes `issue`. Records the winner once; `payout` then moves each token's pot.
    function onReport(bytes calldata, bytes calldata report) external {
        address forwarder = oracle.forwarder();
        if (msg.sender != forwarder || forwarder == address(0)) revert NotForwarder();
        (bytes32 repoHash, uint256 issue, uint256 authorGithubId) = abi.decode(report, (bytes32, uint256, uint256));
        if (authorGithubId == 0) revert BadAuthor();
        bytes32 key = issueKey(repoHash, issue);
        if (winnerOf[key] != 0) revert AlreadySettled();
        winnerOf[key] = authorGithubId;
        emit Settled(repoHash, issue, authorGithubId);
    }

    /// After settlement, anyone sends `token`'s pot to the winner's account.
    function payout(bytes32 repoHash, uint256 issue, address token) external {
        uint256 author = winnerOf[issueKey(repoHash, issue)];
        if (author == 0) revert NotSettled();
        bytes32 pot = potKey(repoHash, issue, token);
        uint256 amount = potOf[pot];
        if (amount == 0) revert NothingToPay();
        potOf[pot] = 0;
        address account = accounts.addressOf(author);
        token.send(account, amount);
        emit Paid(repoHash, issue, token, account, amount);
    }

    /// After your deadline, take back your contribution in `token` to a bounty nobody has earned yet.
    function refund(bytes32 repoHash, uint256 issue, address token) external {
        if (winnerOf[issueKey(repoHash, issue)] != 0) revert AlreadySettled();
        bytes32 pot = potKey(repoHash, issue, token);
        Contribution memory c = contributions[pot][msg.sender];
        if (c.amount == 0) revert NothingToRefund();
        if (block.timestamp < c.deadline) revert TooEarly();
        delete contributions[pot][msg.sender];
        potOf[pot] -= c.amount;
        token.send(msg.sender, c.amount);
        emit Refunded(repoHash, issue, token, msg.sender, c.amount);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == this.onReport.selector || interfaceId == 0x01ffc9a7; // IReceiver, ERC-165
    }
}
