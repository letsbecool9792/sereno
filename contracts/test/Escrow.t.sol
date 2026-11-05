// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test, console2} from "forge-std/Test.sol";
import {SshSigVerifier, IEd25519Verifier} from "../src/SshSigVerifier.sol";
import {KeyOracle} from "../src/KeyOracle.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {Escrow} from "../src/Escrow.sol";
import {SshSigBuilder} from "./utils/SshSigBuilder.sol";
import {MockERC20} from "./utils/MockERC20.sol";

contract EscrowTest is Test {
    KeyOracle oracle;
    AccountFactory factory;
    Escrow escrow;
    MockERC20 usdc;
    address forwarder = makeAddr("forwarder");
    address sender = makeAddr("sender");

    uint256 constant ID = 172588240;
    uint256 constant KEY = 0xB0B;
    uint256 constant OTHER_KEY = 0xE7E;

    function setUp() public {
        vm.warp(1_800_000_000);
        SshSigVerifier verifier = new SshSigVerifier(IEd25519Verifier(address(0)));
        oracle = new KeyOracle(address(this));
        oracle.setForwarder(forwarder);
        factory = new AccountFactory(oracle, verifier);
        escrow = new Escrow(oracle, verifier, factory);
        usdc = new MockERC20();
        usdc.mint(sender, 100e6);
        vm.prank(sender);
        usdc.approve(address(escrow), type(uint256).max);

        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = keccak256(SshSigBuilder.p256PublicKey(KEY));
        vm.prank(forwarder);
        oracle.onReport("", abi.encode(ID, "psycocodes", hashes));
    }

    function _deposit(uint256 amount) internal returns (uint256 id) {
        vm.prank(sender);
        id = escrow.deposit(ID, address(usdc), amount, uint64(block.timestamp + 7 days));
    }

    function _sig(uint256 key, uint256 id) internal view returns (bytes memory) {
        return SshSigBuilder.signP256(key, escrow.claimText(id), "sereno@v1");
    }

    function test_claim_text_is_exact() public {
        uint256 id = _deposit(1e6);
        string memory expected = string.concat(
            "sereno v1\nchain: 31337\nescrow: ",
            vm.toLowercase(vm.toString(address(escrow))),
            "\nclaim: 0\ngithub-id: 172588240\naccount: ",
            vm.toLowercase(vm.toString(factory.addressOf(ID))),
            "\n"
        );
        assertEq(string(escrow.claimText(id)), expected);
    }

    function test_claim_pays_the_account() public {
        uint256 id = _deposit(10e6);
        bytes memory sig = _sig(KEY, id);
        vm.prank(makeAddr("anyRelayer"));
        uint256 g = gasleft();
        escrow.claim(id, sig);
        console2.log("escrow claim (P-256) gas", g - gasleft());
        assertEq(usdc.balanceOf(factory.addressOf(ID)), 10e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_unlisted_key_rejected() public {
        uint256 id = _deposit(10e6);
        bytes memory sig = _sig(OTHER_KEY, id);
        vm.expectRevert(Escrow.KeyNotOnProfile.selector);
        escrow.claim(id, sig);
    }

    function test_signature_for_another_deposit_rejected() public {
        uint256 a = _deposit(1e6);
        uint256 b = _deposit(2e6);
        bytes memory sigA = _sig(KEY, a);
        vm.expectRevert(Escrow.BadSignature.selector);
        escrow.claim(b, sigA);
    }

    function test_double_claim_rejected() public {
        uint256 id = _deposit(10e6);
        bytes memory sig = _sig(KEY, id);
        escrow.claim(id, sig);
        vm.expectRevert(Escrow.AlreadyDone.selector);
        escrow.claim(id, sig);
    }

    function test_early_reclaim_rejected() public {
        uint256 id = _deposit(10e6);
        vm.prank(sender);
        vm.expectRevert(Escrow.TooEarly.selector);
        escrow.reclaim(id);
    }

    function test_reclaim_by_others_rejected() public {
        uint256 id = _deposit(10e6);
        vm.warp(block.timestamp + 8 days);
        vm.prank(makeAddr("thief"));
        vm.expectRevert(Escrow.NotSender.selector);
        escrow.reclaim(id);
    }

    function test_reclaim_after_deadline_then_claim_rejected() public {
        uint256 id = _deposit(10e6);
        bytes memory sig = _sig(KEY, id);
        vm.warp(block.timestamp + 7 days);
        vm.prank(sender);
        escrow.reclaim(id);
        assertEq(usdc.balanceOf(sender), 100e6);
        vm.expectRevert(Escrow.AlreadyDone.selector);
        escrow.claim(id, sig);
        vm.prank(sender);
        vm.expectRevert(Escrow.AlreadyDone.selector);
        escrow.reclaim(id);
    }

    function test_reclaim_after_claim_rejected() public {
        uint256 id = _deposit(10e6);
        escrow.claim(id, _sig(KEY, id));
        vm.warp(block.timestamp + 8 days);
        vm.prank(sender);
        vm.expectRevert(Escrow.AlreadyDone.selector);
        escrow.reclaim(id);
    }

    function test_bad_inputs_rejected() public {
        vm.startPrank(sender);
        vm.expectRevert(Escrow.BadAmount.selector);
        escrow.deposit(ID, address(usdc), 0, uint64(block.timestamp + 1));
        vm.expectRevert(Escrow.BadDeadline.selector);
        escrow.deposit(ID, address(usdc), 1e6, uint64(block.timestamp));
        vm.stopPrank();
    }
}
