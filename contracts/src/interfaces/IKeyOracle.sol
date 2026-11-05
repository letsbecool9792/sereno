// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IKeyOracle {
    /// When the key (keccak256 of its public key blob) first appeared on the GitHub profile; 0 = not listed now.
    function firstSeen(uint256 githubId, bytes32 keyHash) external view returns (uint256);

    /// The GitHub ID whose current login hashes to `loginHash` (keccak256 of the lowercase login); 0 = unknown.
    function idOfLoginHash(bytes32 loginHash) external view returns (uint256);
}
