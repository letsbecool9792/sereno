// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "ed25519/Ed25519.sol";
import "ed25519/Sha512.sol";

/// Exposes the vendored Solidity 0.6 Ed25519 and SHA-512 libraries to the 0.8 contracts as external calls.
contract Ed25519Verifier {
    function verify(bytes32 k, bytes32 r, bytes32 s, bytes calldata m) external pure returns (bool) {
        return Ed25519.verify(k, r, s, m);
    }

    function sha512(bytes calldata m) external pure returns (bytes memory out) {
        uint64[8] memory h = Sha512.hash(m);
        out = new bytes(64);
        for (uint256 i = 0; i < 8; i++) {
            for (uint256 j = 0; j < 8; j++) {
                out[i * 8 + j] = bytes1(uint8(h[i] >> (56 - 8 * j)));
            }
        }
    }
}
