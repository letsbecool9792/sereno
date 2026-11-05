// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script, console2} from "forge-std/Script.sol";
import {KeyOracle} from "../src/KeyOracle.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {ISshSigVerifier} from "../src/SshSigVerifier.sol";
import {BountyBoard} from "../src/BountyBoard.sol";
import {Escrow} from "../src/Escrow.sol";

/// Deploys the extras (BountyBoard, Escrow) on top of the core addresses in deployments/core.json, through the
/// deterministic CREATE2 deployer, so they too have the same address on every chain. They have no owner, so any funded
/// key may run this (unlike Deploy.s.sol, whose KeyOracle embeds the deployer as owner). Idempotent.
///
///   DEPLOYER_KEY=0x... forge script script/DeployExtras.s.sol --rpc-url base_sepolia --broadcast
contract DeployExtras is Script {
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

    function run() external {
        string memory core = vm.readFile("./deployments/core.json");
        address oracle = vm.parseJsonAddress(core, ".KeyOracle");
        address verifier = vm.parseJsonAddress(core, ".SshSigVerifier");
        address factory = vm.parseJsonAddress(core, ".AccountFactory");
        require(factory.code.length > 0, "core not deployed on this chain");

        vm.startBroadcast(vm.envUint("DEPLOYER_KEY"));
        address board = _deploy("BountyBoard", abi.encodePacked(type(BountyBoard).creationCode, abi.encode(oracle, factory)));
        address escrow =
            _deploy("Escrow", abi.encodePacked(type(Escrow).creationCode, abi.encode(oracle, verifier, factory)));
        vm.stopBroadcast();

        string memory j = "extras";
        vm.serializeAddress(j, "BountyBoard", board);
        vm.writeJson(vm.serializeAddress(j, "Escrow", escrow), "./deployments/extras.json");
    }
}
