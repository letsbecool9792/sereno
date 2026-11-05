// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {SshSigVerifier, IEd25519Verifier} from "../src/SshSigVerifier.sol";
import {KeyOracle} from "../src/KeyOracle.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {BountyBoard} from "../src/BountyBoard.sol";
import {MockERC20} from "./utils/MockERC20.sol";

contract BountyBoardTest is Test {
    KeyOracle oracle;
    AccountFactory factory;
    BountyBoard board;
    MockERC20 usdc;
    address forwarder = makeAddr("forwarder");
    address funder = makeAddr("funder");
    address funder2 = makeAddr("funder2");

    string constant REPO = "LetsBeCool9792/Sereno";
    uint256 constant ISSUE = 7;
    uint256 constant AUTHOR = 172588240;
    bytes32 repoHash;

    function setUp() public {
        vm.warp(1_800_000_000);
        oracle = new KeyOracle(address(this));
        oracle.setForwarder(forwarder);
        factory = new AccountFactory(oracle, new SshSigVerifier(IEd25519Verifier(address(0))));
        board = new BountyBoard(oracle, factory);
        usdc = new MockERC20();
        repoHash = keccak256("letsbecool9792/sereno");
        for (uint256 i = 0; i < 2; i++) {
            address f = i == 0 ? funder : funder2;
            usdc.mint(f, 100e6);
            vm.prank(f);
            usdc.approve(address(board), type(uint256).max);
        }
    }

    function _fund(address f, uint256 amount, uint64 deadline) internal {
        vm.prank(f);
        board.fund(REPO, ISSUE, address(usdc), amount, deadline);
    }

    function _settle(uint256 author) internal {
        vm.prank(forwarder);
        board.onReport("", abi.encode(repoHash, ISSUE, author));
    }

    function test_repo_hash_is_lowercase() public view {
        assertEq(board.repoHashOf(REPO), repoHash);
    }

    function test_fund_then_settle_pays_author_account_before_it_exists() public {
        _fund(funder, 10e6, uint64(block.timestamp + 7 days));
        _fund(funder2, 5e6, uint64(block.timestamp + 1 days));
        address account = factory.addressOf(AUTHOR);
        assertEq(account.code.length, 0);
        _settle(AUTHOR);
        assertEq(usdc.balanceOf(account), 15e6);
        assertEq(usdc.balanceOf(address(board)), 0);
    }

    function test_only_forwarder_settles() public {
        _fund(funder, 10e6, uint64(block.timestamp + 1 days));
        vm.expectRevert(BountyBoard.NotForwarder.selector);
        board.onReport("", abi.encode(repoHash, ISSUE, AUTHOR));
    }

    function test_unset_forwarder_cannot_settle() public {
        oracle.setForwarder(address(0));
        _fund(funder, 10e6, uint64(block.timestamp + 1 days));
        vm.prank(address(0));
        vm.expectRevert(BountyBoard.NotForwarder.selector);
        board.onReport("", abi.encode(repoHash, ISSUE, AUTHOR));
    }

    function test_double_settle_and_funding_after_settle_revert() public {
        _fund(funder, 10e6, uint64(block.timestamp + 1 days));
        _settle(AUTHOR);
        vm.prank(forwarder);
        vm.expectRevert(BountyBoard.AlreadySettled.selector);
        board.onReport("", abi.encode(repoHash, ISSUE, 1));
        vm.prank(funder);
        vm.expectRevert(BountyBoard.AlreadySettled.selector);
        board.fund(REPO, ISSUE, address(usdc), 1e6, uint64(block.timestamp + 1 days));
    }

    function test_settle_unfunded_reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(BountyBoard.NoBounty.selector);
        board.onReport("", abi.encode(repoHash, ISSUE, AUTHOR));
    }

    function test_refund_only_after_own_deadline() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        _fund(funder, 10e6, deadline);
        vm.prank(funder);
        vm.expectRevert(BountyBoard.TooEarly.selector);
        board.refund(repoHash, ISSUE);
        vm.warp(deadline);
        vm.prank(funder);
        board.refund(repoHash, ISSUE);
        assertEq(usdc.balanceOf(funder), 100e6);
        vm.prank(funder);
        vm.expectRevert(BountyBoard.NothingToRefund.selector);
        board.refund(repoHash, ISSUE);
    }

    function test_refund_by_non_funder_reverts_and_leaves_others_pot() public {
        _fund(funder, 10e6, uint64(block.timestamp + 1 days));
        _fund(funder2, 5e6, uint64(block.timestamp + 30 days));
        vm.warp(block.timestamp + 2 days);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BountyBoard.NothingToRefund.selector);
        board.refund(repoHash, ISSUE);
        // funder1 leaves; funder2 is still in, so the author gets only funder2's part
        vm.prank(funder);
        board.refund(repoHash, ISSUE);
        _settle(AUTHOR);
        assertEq(usdc.balanceOf(factory.addressOf(AUTHOR)), 5e6);
    }

    function test_no_refund_after_settle() public {
        _fund(funder, 10e6, uint64(block.timestamp + 1 days));
        _settle(AUTHOR);
        vm.warp(block.timestamp + 2 days);
        vm.prank(funder);
        vm.expectRevert(BountyBoard.AlreadySettled.selector);
        board.refund(repoHash, ISSUE);
    }

    function test_second_funder_must_use_same_token_and_bad_inputs_revert() public {
        _fund(funder, 10e6, uint64(block.timestamp + 1 days));
        MockERC20 other = new MockERC20();
        vm.startPrank(funder2);
        vm.expectRevert(BountyBoard.WrongToken.selector);
        board.fund(REPO, ISSUE, address(other), 1e6, uint64(block.timestamp + 1 days));
        vm.expectRevert(BountyBoard.BadAmount.selector);
        board.fund(REPO, ISSUE, address(usdc), 0, uint64(block.timestamp + 1 days));
        vm.expectRevert(BountyBoard.BadDeadline.selector);
        board.fund(REPO, ISSUE, address(usdc), 1e6, uint64(block.timestamp));
        vm.stopPrank();
    }

    function test_fund_again_after_full_refund() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        _fund(funder, 10e6, deadline);
        vm.warp(deadline);
        vm.prank(funder);
        board.refund(repoHash, ISSUE);
        // token stays fixed for the bounty; funding again with the same token works
        _fund(funder, 3e6, uint64(block.timestamp + 1 days));
        _settle(AUTHOR);
        assertEq(usdc.balanceOf(factory.addressOf(AUTHOR)), 3e6);
    }
}
