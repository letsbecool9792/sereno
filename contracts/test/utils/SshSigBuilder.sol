// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Vm} from "forge-std/Vm.sol";

/// Builds real SSHSIG blobs for P-256 keys inside tests (vm.signP256), byte for byte what
/// `ssh-keygen -Y sign -O hashalg=sha256` produces for an ecdsa-sha2-nistp256 key.
library SshSigBuilder {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function enc(bytes memory s) internal pure returns (bytes memory) {
        return abi.encodePacked(uint32(s.length), s);
    }

    function mpint(uint256 v) internal pure returns (bytes memory out) {
        bytes memory full = abi.encodePacked(v);
        uint256 i;
        while (i < 32 && full[i] == 0) i++;
        bool pad = i < 32 && uint8(full[i]) >= 0x80;
        out = new bytes(32 - i + (pad ? 1 : 0));
        for (uint256 j = i; j < 32; j++) {
            out[j - i + (pad ? 1 : 0)] = full[j];
        }
    }

    /// The public key blob, i.e. the base64-decoded field of an `authorized_keys` line.
    function p256PublicKey(uint256 privateKey) internal pure returns (bytes memory) {
        (uint256 x, uint256 y) = vm.publicKeyP256(privateKey);
        return abi.encodePacked(
            enc("ecdsa-sha2-nistp256"), enc("nistp256"), enc(abi.encodePacked(bytes1(0x04), x, y))
        );
    }

    function signP256(uint256 privateKey, bytes memory message, bytes memory namespace)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory signedData =
            abi.encodePacked("SSHSIG", enc(namespace), enc(""), enc("sha256"), enc(abi.encodePacked(sha256(message))));
        (bytes32 r, bytes32 s) = vm.signP256(privateKey, sha256(signedData));
        bytes memory signature =
            abi.encodePacked(enc("ecdsa-sha2-nistp256"), enc(abi.encodePacked(enc(mpint(uint256(r))), enc(mpint(uint256(s))))));
        return abi.encodePacked(
            "SSHSIG", uint32(1), enc(p256PublicKey(privateKey)), enc(namespace), enc(""), enc("sha256"), enc(signature)
        );
    }
}
