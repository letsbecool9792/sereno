// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {KeyOracle} from "../src/KeyOracle.sol";
import {ReportGate} from "../src/ReportGate.sol";

contract ReportGateTest is Test {
    ReportGate gate;
    KeyOracle oracle;
    address forwarder = makeAddr("forwarder");
    address broadcaster = makeAddr("broadcaster");
    address attacker = address(0xdEaD);

    // The metadata of a real report: `cre workflow simulate github-keys --target base-settings --broadcast` on Base
    // Sepolia (tx 0xc0322edd…473e3). In simulation the workflow id and owner are dummies (0x11…, 0xaa…).
    bytes constant SIM_METADATA =
        hex"1111111111111111111111111111111111111111111111111111111111111111" hex"64386566623735353338"
        hex"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" hex"0001";
    bytes10 constant BASE_NAME = "d8efb75538"; // github-keys-base
    address constant SIM_OWNER = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;

    uint256 constant ID = 99113360;

    function setUp() public {
        gate = new ReportGate(address(this));
        oracle = new KeyOracle(address(this));
        oracle.setForwarder(address(gate));
        gate.setForwarder(forwarder);
        gate.setBroadcaster(broadcaster, true);
        gate.setRoute(BASE_NAME, SIM_OWNER, address(oracle));
    }

    function _keys() internal pure returns (bytes memory) {
        bytes32[] memory k = new bytes32[](1);
        k[0] = keccak256("attacker key");
        return abi.encode(ID, "letsbecool9792", k);
    }

    function _deliver(address origin, bytes memory metadata) internal {
        vm.prank(forwarder, origin);
        gate.onReport(metadata, _keys());
    }

    function test_name_key_matches_the_cre_metadata() public view {
        assertEq(gate.nameKey("github-keys-base"), BASE_NAME);
        assertEq(gate.nameKey("github-keys-arbitrum"), bytes10("8c43c7d024"));
        assertEq(gate.nameKey("github-keys-sepolia"), bytes10("15f5918ca0"));
    }

    function test_listed_broadcaster_reaches_the_oracle() public {
        _deliver(broadcaster, SIM_METADATA);
        assertGt(oracle.firstSeen(ID, keccak256("attacker key")), 0);
        assertEq(oracle.loginOf(ID), "letsbecool9792");
    }

    /// The hole this closes: anyone could call the simulation forwarder and have it deliver a fake key set.
    function test_unlisted_broadcaster_is_refused() public {
        vm.expectRevert(abi.encodeWithSelector(ReportGate.NotBroadcaster.selector, attacker));
        _deliver(attacker, SIM_METADATA);
        assertEq(oracle.firstSeen(ID, keccak256("attacker key")), 0);
    }

    function test_oracle_refuses_the_forwarder_directly() public {
        vm.prank(forwarder, attacker);
        vm.expectRevert(KeyOracle.NotForwarder.selector);
        oracle.onReport(SIM_METADATA, _keys());
    }

    function test_only_the_forwarder_may_call() public {
        vm.prank(broadcaster, broadcaster);
        vm.expectRevert(ReportGate.NotForwarder.selector);
        gate.onReport(SIM_METADATA, _keys());
    }

    function test_unknown_workflow_is_refused_even_with_open_broadcast() public {
        gate.setOpenBroadcast(true);
        bytes memory other = abi.encodePacked(bytes32(0), bytes10("0123456789"), SIM_OWNER, bytes2(0x0001));
        vm.expectRevert(abi.encodeWithSelector(ReportGate.NoRoute.selector, bytes10("0123456789"), SIM_OWNER));
        _deliver(attacker, other);

        // Same name, someone else's workflow owner (the production case: one shared forwarder for all CRE users).
        bytes memory otherOwner = abi.encodePacked(bytes32(0), BASE_NAME, attacker, bytes2(0x0001));
        vm.expectRevert(abi.encodeWithSelector(ReportGate.NoRoute.selector, BASE_NAME, attacker));
        _deliver(attacker, otherOwner);
    }

    function test_open_broadcast_admits_any_transmitter_for_a_routed_workflow() public {
        gate.setOpenBroadcast(true);
        _deliver(attacker, SIM_METADATA);
        assertGt(oracle.firstSeen(ID, keccak256("attacker key")), 0);
    }

    function test_short_metadata_is_refused() public {
        vm.expectRevert(ReportGate.BadMetadata.selector);
        _deliver(broadcaster, hex"00");
    }

    function test_receiver_revert_bubbles_up() public {
        oracle.setForwarder(address(1)); // the oracle no longer trusts the gate
        vm.expectRevert(KeyOracle.NotForwarder.selector);
        _deliver(broadcaster, SIM_METADATA);
    }

    function test_only_owner_configures() public {
        vm.startPrank(attacker);
        vm.expectRevert(ReportGate.NotOwner.selector);
        gate.setForwarder(attacker);
        vm.expectRevert(ReportGate.NotOwner.selector);
        gate.setBroadcaster(attacker, true);
        vm.expectRevert(ReportGate.NotOwner.selector);
        gate.setOpenBroadcast(true);
        vm.expectRevert(ReportGate.NotOwner.selector);
        gate.setRoute(BASE_NAME, SIM_OWNER, attacker);
        vm.stopPrank();
    }

    function test_removed_broadcaster_and_route_stop_working() public {
        gate.setBroadcaster(broadcaster, false);
        vm.expectRevert(abi.encodeWithSelector(ReportGate.NotBroadcaster.selector, broadcaster));
        _deliver(broadcaster, SIM_METADATA);

        gate.setBroadcaster(broadcaster, true);
        gate.setRoute(BASE_NAME, SIM_OWNER, address(0));
        vm.expectRevert(abi.encodeWithSelector(ReportGate.NoRoute.selector, BASE_NAME, SIM_OWNER));
        _deliver(broadcaster, SIM_METADATA);
    }

    function test_supports_the_receiver_interface() public view {
        assertTrue(gate.supportsInterface(ReportGate.onReport.selector));
        assertTrue(gate.supportsInterface(0x01ffc9a7));
        assertFalse(gate.supportsInterface(0xffffffff));
    }
}
