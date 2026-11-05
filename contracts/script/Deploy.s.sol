// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script, console2} from "forge-std/Script.sol";
import {SshSigVerifier, IEd25519Verifier} from "../src/SshSigVerifier.sol";
import {KeyOracle} from "../src/KeyOracle.sol";
import {AccountFactory} from "../src/AccountFactory.sol";

/// Deploys the core contracts through the deterministic CREATE2 deployer with fixed salts and identical constructor
/// arguments, so every contract (and every user's account) has the same address on every chain. Idempotent.
///
///   DEPLOYER_KEY=0x... forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
contract Deploy is Script {
    function _salt(string memory name) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("sereno/v1/", name));
    }

    function _deploy(string memory name, bytes memory initCode) internal returns (address a) {
        a = vm.computeCreate2Address(_salt(name), keccak256(initCode), CREATE2_FACTORY);
        if (a.code.length == 0) {
            (bool ok,) = CREATE2_FACTORY.call(abi.encodePacked(_salt(name), initCode));
            require(ok && a.code.length > 0, string.concat("deploy failed: ", name));
        }
        console2.log(name, a);
    }

    /// Chainlink CRE simulation forwarders (cre workflow simulate --broadcast).
    function _creForwarder(uint256 chainId) internal pure returns (address) {
        if (chainId == 11155111) return 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
        if (chainId == 84532) return 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5;
        if (chainId == 421614) return 0xD41263567DdfeAd91504199b8c6c87371e83ca5d;
        return address(0);
    }

    function run() external {
        uint256 key = vm.envUint("DEPLOYER_KEY");
        address owner = vm.addr(key);
        vm.startBroadcast(key);
        // Sepolia L1 prices contract creation so high that the 13 KB Ed25519 contract exceeds the per-transaction gas
        // cap. There we only need the claim path (P-256 / phone keys), so it can be skipped; the verifier still points
        // at its deterministic address, so every other address stays the same.
        bytes memory edCode = vm.getCode("Ed25519Verifier.sol:Ed25519Verifier");
        address ed = vm.envOr("SKIP_ED25519", false)
            ? vm.computeCreate2Address(_salt("Ed25519Verifier"), keccak256(edCode), CREATE2_FACTORY)
            : _deploy("Ed25519Verifier", edCode);
        address verifier = _deploy("SshSigVerifier", abi.encodePacked(type(SshSigVerifier).creationCode, abi.encode(ed)));
        address oracle = _deploy("KeyOracle", abi.encodePacked(type(KeyOracle).creationCode, abi.encode(owner)));
        address factory =
            _deploy("AccountFactory", abi.encodePacked(type(AccountFactory).creationCode, abi.encode(oracle, verifier)));
        address forwarder = vm.envOr("CRE_FORWARDER", _creForwarder(block.chainid));
        if (forwarder != address(0) && KeyOracle(oracle).forwarder() != forwarder) {
            KeyOracle(oracle).setForwarder(forwarder);
        }
        vm.stopBroadcast();
        console2.log("CRE forwarder", KeyOracle(oracle).forwarder());

        string memory j = "addresses";
        vm.serializeAddress(j, "Ed25519Verifier", ed);
        vm.serializeAddress(j, "SshSigVerifier", verifier);
        vm.serializeAddress(j, "KeyOracle", oracle);
        vm.serializeAddress(j, "AccountFactory", factory);
        vm.writeJson(vm.serializeAddress(j, "owner", owner), "./deployments/core.json");
    }
}
