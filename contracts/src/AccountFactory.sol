// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {SshAccount} from "./SshAccount.sol";
import {IKeyOracle} from "./interfaces/IKeyOracle.sol";
import {ISshSigVerifier} from "./SshSigVerifier.sol";

/// Deploys each GitHub user's SshAccount with CREATE2 (salt = numeric GitHub ID), so the address is known, and can
/// receive funds, before deployment. Deployed at the same address on every chain, so accounts are too.
contract AccountFactory {
    IKeyOracle public immutable oracle;
    ISshSigVerifier public immutable verifier;

    event AccountDeployed(uint256 indexed githubId, address account);

    constructor(IKeyOracle oracle_, ISshSigVerifier verifier_) {
        oracle = oracle_;
        verifier = verifier_;
    }

    function addressOf(uint256 githubId) public view returns (address) {
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(SshAccount).creationCode, abi.encode(githubId, oracle, verifier)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(githubId), initCodeHash)))));
    }

    /// Deploys the account if needed (anyone can call; relayers do it before the first spend).
    function deploy(uint256 githubId) external returns (SshAccount account) {
        address predicted = addressOf(githubId);
        if (predicted.code.length > 0) return SshAccount(predicted);
        account = new SshAccount{salt: bytes32(githubId)}(githubId, oracle, verifier);
        emit AccountDeployed(githubId, address(account));
    }
}
