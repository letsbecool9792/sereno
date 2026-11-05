// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {KeyOracle} from "../src/KeyOracle.sol";

contract KeyOracleTest is Test {
    KeyOracle oracle;
    address forwarder = makeAddr("forwarder");
    uint256 constant ID = 1024025;
    bytes32 constant K1 = keccak256("key one");
    bytes32 constant K2 = keccak256("key two");

    function setUp() public {
        oracle = new KeyOracle(address(this));
        oracle.setForwarder(forwarder);
    }

    function _report(uint256 id, string memory login, bytes32[] memory keys) internal {
        vm.prank(forwarder);
        oracle.onReport("", abi.encode(id, login, keys));
    }

    function _list(bytes32 a) internal pure returns (bytes32[] memory l) {
        l = new bytes32[](1);
        l[0] = a;
    }

    function _list(bytes32 a, bytes32 b) internal pure returns (bytes32[] memory l) {
        l = new bytes32[](2);
        (l[0], l[1]) = (a, b);
    }

    function test_report_lists_keys_and_login() public {
        vm.warp(1000);
        _report(ID, "torvalds", _list(K1, K2));
        assertEq(oracle.firstSeen(ID, K1), 1000);
        assertEq(oracle.firstSeen(ID, K2), 1000);
        assertEq(oracle.keysOf(ID).length, 2);
        assertEq(oracle.loginOf(ID), "torvalds");
        assertEq(oracle.idOfLoginHash(keccak256("torvalds")), ID);
        assertEq(oracle.lastUpdated(ID), 1000);
    }

    function test_removed_key_is_revoked_and_kept_key_keeps_its_age() public {
        vm.warp(1000);
        _report(ID, "torvalds", _list(K1, K2));
        vm.warp(5000);
        _report(ID, "torvalds", _list(K2));
        assertEq(oracle.firstSeen(ID, K1), 0, "removed key still listed");
        assertEq(oracle.firstSeen(ID, K2), 1000, "kept key lost its first-seen time");
    }

    function test_readded_key_starts_a_new_clock() public {
        vm.warp(1000);
        _report(ID, "torvalds", _list(K1));
        _report(ID, "torvalds", new bytes32[](0));
        vm.warp(9000);
        _report(ID, "torvalds", _list(K1));
        assertEq(oracle.firstSeen(ID, K1), 9000);
    }

    function test_rename_moves_the_login() public {
        _report(ID, "oldname", _list(K1));
        _report(ID, "newname", _list(K1));
        assertEq(oracle.idOfLoginHash(keccak256("oldname")), 0);
        assertEq(oracle.idOfLoginHash(keccak256("newname")), ID);
        // someone else takes the old name later
        _report(7, "oldname", _list(K2));
        assertEq(oracle.idOfLoginHash(keccak256("oldname")), 7);
        assertEq(oracle.idOfLoginHash(keccak256("newname")), ID);
    }

    function test_only_forwarder_reports() public {
        vm.expectRevert(KeyOracle.NotForwarder.selector);
        oracle.onReport("", abi.encode(ID, "x", _list(K1)));
    }

    function test_only_owner_sets_forwarder() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(KeyOracle.NotOwner.selector);
        oracle.setForwarder(address(1));
    }

    function test_supports_receiver_interface() public view {
        assertTrue(oracle.supportsInterface(KeyOracle.onReport.selector));
        assertTrue(oracle.supportsInterface(0x01ffc9a7));
        assertFalse(oracle.supportsInterface(0xdeadbeef));
    }
}
