// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {SshSigVerifier, IEd25519Verifier} from "../src/SshSigVerifier.sol";
import {KeyOracle} from "../src/KeyOracle.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {BountyBoard} from "../src/BountyBoard.sol";
import {MockERC20} from "./utils/MockERC20.sol";

/// A token that can be pulled in but whose transfers out always fail (a griefer's token).
contract BrokenToken {
    function mint(address, uint256) external {}

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
}

contract BountyBoardTest is Test {
    KeyOracle oracle;
    AccountFactory factory;
    BountyBoard board;
    MockERC20 usdc;
    address forwarder = makeAddr("forwarder");
    address funder = makeAddr("funder");
    address funder2 = makeAddr("funder2");
    address griefer = makeAddr("griefer");

    string constant REPO = "LetsBeCool9792/Sereno";
    uint256 constant ISSUE = 7;
    uint256 constant AUTHOR = 172588240;
    bytes32 repoHash;
    address account;

    function setUp() public {
        vm.warp(1_800_000_000);
        oracle = new KeyOracle(address(this));
        oracle.setForwarder(forwarder);
        factory = new AccountFactory(oracle, new SshSigVerifier(IEd25519Verifier(address(0))));
        board = new BountyBoard(oracle, factory);
        usdc = new MockERC20();
        repoHash = keccak256("letsbecool9792/sereno");
        account = factory.addressOf(AUTHOR);
        _mintAndApprove(usdc, funder);
        _mintAndApprove(usdc, funder2);
    }

    function _mintAndApprove(MockERC20 token, address who) internal {
        token.mint(who, 100e6);
        vm.prank(who);
        token.approve(address(board), type(uint256).max);
    }

    function _fund(address f, MockERC20 token, uint256 amount, uint64 deadline) internal {
        vm.prank(f);
        board.fund(REPO, ISSUE, address(token), amount, deadline);
    }

    function _settle(uint256 author) internal {
        vm.prank(forwarder);
        board.onReport("", abi.encode(repoHash, ISSUE, author));
    }

    function _in(uint256 secs) internal view returns (uint64) {
        return uint64(block.timestamp + secs);
    }

    function test_repo_hash_is_lowercase() public view {
        assertEq(board.repoHashOf(REPO), repoHash);
    }

    function test_fund_settle_payout_to_account_before_it_exists() public {
        _fund(funder, usdc, 10e6, _in(7 days));
        _fund(funder2, usdc, 5e6, _in(1 days));
        assertEq(account.code.length, 0);
        _settle(AUTHOR);
        assertEq(board.winnerOf(board.issueKey(repoHash, ISSUE)), AUTHOR);
        vm.prank(makeAddr("anyone"));
        board.payout(repoHash, ISSUE, address(usdc));
        assertEq(usdc.balanceOf(account), 15e6);
        assertEq(usdc.balanceOf(address(board)), 0);
        vm.expectRevert(BountyBoard.NothingToPay.selector);
        board.payout(repoHash, ISSUE, address(usdc));
    }

    /// The griefing case: a junk token funded first must not block the real USDC bounty.
    function test_junk_token_first_does_not_block_usdc() public {
        BrokenToken junk = new BrokenToken();
        vm.prank(griefer);
        board.fund(REPO, ISSUE, address(junk), 1, _in(365 days));
        _fund(funder, usdc, 10e6, _in(7 days));
        _settle(AUTHOR);
        board.payout(repoHash, ISSUE, address(usdc));
        assertEq(usdc.balanceOf(account), 10e6);
        // the junk pot fails on its own, without touching USDC
        vm.expectRevert();
        board.payout(repoHash, ISSUE, address(junk));
    }

    function test_each_token_pays_out_separately() public {
        MockERC20 dai = new MockERC20();
        _mintAndApprove(dai, funder2);
        _fund(funder, usdc, 10e6, _in(1 days));
        _fund(funder2, dai, 3e6, _in(1 days));
        _settle(AUTHOR);
        board.payout(repoHash, ISSUE, address(dai));
        assertEq(dai.balanceOf(account), 3e6);
        assertEq(usdc.balanceOf(account), 0);
        board.payout(repoHash, ISSUE, address(usdc));
        assertEq(usdc.balanceOf(account), 10e6);
    }

    function test_payout_before_settle_reverts() public {
        _fund(funder, usdc, 10e6, _in(1 days));
        vm.expectRevert(BountyBoard.NotSettled.selector);
        board.payout(repoHash, ISSUE, address(usdc));
    }

    function test_only_forwarder_settles() public {
        vm.expectRevert(BountyBoard.NotForwarder.selector);
        board.onReport("", abi.encode(repoHash, ISSUE, AUTHOR));
    }

    function test_unset_forwarder_cannot_settle() public {
        oracle.setForwarder(address(0));
        vm.prank(address(0));
        vm.expectRevert(BountyBoard.NotForwarder.selector);
        board.onReport("", abi.encode(repoHash, ISSUE, AUTHOR));
    }

    function test_zero_author_rejected() public {
        vm.prank(forwarder);
        vm.expectRevert(BountyBoard.BadAuthor.selector);
        board.onReport("", abi.encode(repoHash, ISSUE, 0));
    }

    function test_double_settle_and_funding_after_settle_revert() public {
        _fund(funder, usdc, 10e6, _in(1 days));
        _settle(AUTHOR);
        vm.prank(forwarder);
        vm.expectRevert(BountyBoard.AlreadySettled.selector);
        board.onReport("", abi.encode(repoHash, ISSUE, 1));
        vm.prank(funder);
        vm.expectRevert(BountyBoard.AlreadySettled.selector);
        board.fund(REPO, ISSUE, address(usdc), 1e6, _in(1 days));
    }

    function test_settle_before_funding_still_records_winner() public {
        _settle(AUTHOR);
        vm.expectRevert(BountyBoard.NothingToPay.selector);
        board.payout(repoHash, ISSUE, address(usdc));
    }

    function test_refund_only_after_own_deadline() public {
        uint64 deadline = _in(1 days);
        _fund(funder, usdc, 10e6, deadline);
        vm.prank(funder);
        vm.expectRevert(BountyBoard.TooEarly.selector);
        board.refund(repoHash, ISSUE, address(usdc));
        vm.warp(deadline);
        vm.prank(funder);
        board.refund(repoHash, ISSUE, address(usdc));
        assertEq(usdc.balanceOf(funder), 100e6);
        vm.prank(funder);
        vm.expectRevert(BountyBoard.NothingToRefund.selector);
        board.refund(repoHash, ISSUE, address(usdc));
    }

    function test_refund_by_non_funder_reverts_and_leaves_others_pot() public {
        _fund(funder, usdc, 10e6, _in(1 days));
        _fund(funder2, usdc, 5e6, _in(30 days));
        vm.warp(block.timestamp + 2 days);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BountyBoard.NothingToRefund.selector);
        board.refund(repoHash, ISSUE, address(usdc));
        vm.prank(funder);
        board.refund(repoHash, ISSUE, address(usdc));
        _settle(AUTHOR);
        board.payout(repoHash, ISSUE, address(usdc));
        assertEq(usdc.balanceOf(account), 5e6);
    }

    function test_no_refund_after_settle() public {
        _fund(funder, usdc, 10e6, _in(1 days));
        _settle(AUTHOR);
        vm.warp(block.timestamp + 2 days);
        vm.prank(funder);
        vm.expectRevert(BountyBoard.AlreadySettled.selector);
        board.refund(repoHash, ISSUE, address(usdc));
    }

    function test_bad_inputs_revert() public {
        vm.startPrank(funder);
        vm.expectRevert(BountyBoard.BadAmount.selector);
        board.fund(REPO, ISSUE, address(usdc), 0, _in(1 days));
        vm.expectRevert(BountyBoard.BadDeadline.selector);
        board.fund(REPO, ISSUE, address(usdc), 1e6, uint64(block.timestamp));
        vm.stopPrank();
    }
}
