// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test, console2} from "forge-std/Test.sol";
import {SshSigVerifier, IEd25519Verifier} from "../src/SshSigVerifier.sol";
import {SshSigBuilder} from "./utils/SshSigBuilder.sol";

contract SshSigVerifierTest is Test {
    SshSigVerifier verifier;
    string constant LOCAL = "test/fixtures/local/";
    string constant OPENSSH = "test/fixtures/openssh/";

    function setUp() public {
        verifier = new SshSigVerifier(IEd25519Verifier(deployCode("Ed25519Verifier.sol:Ed25519Verifier")));
    }

    function _hex(string memory path) internal view returns (bytes memory) {
        return vm.parseBytes(string.concat("0x", vm.readFile(path)));
    }

    function _check(bytes memory sig, bytes memory message, bytes memory ns, bytes memory expectedKey, string memory label)
        internal
        view
    {
        uint256 g = gasleft();
        (bool ok, bytes memory pk) = verifier.verify(sig, message, ns);
        console2.log(label, g - gasleft());
        assertTrue(ok, string.concat(label, ": valid signature rejected"));
        assertEq(pk, expectedKey, string.concat(label, ": wrong public key"));
        (ok,) = verifier.verify(sig, bytes.concat(message, "x"), ns);
        assertFalse(ok, string.concat(label, ": tampered message accepted"));
        (ok,) = verifier.verify(sig, message, bytes.concat(ns, "x"));
        assertFalse(ok, string.concat(label, ": wrong namespace accepted"));
    }

    // Generated in-test: P-256 key, sha256 message hash (what `ssh-keygen -Y sign -O hashalg=sha256` produces).
    function test_p256_built() public view {
        uint256 key = 0xA11CE;
        bytes memory message = "sereno v1\nhello\n";
        _check(SshSigBuilder.signP256(key, message, "sereno@v1"), message, "sereno@v1", SshSigBuilder.p256PublicKey(key), "p256 built");
    }

    function test_p256_other_key_rejected() public view {
        bytes memory sig = SshSigBuilder.signP256(1234, "m", "ns");
        // swap in another public key; the signature no longer matches it
        bytes memory forged = bytes.concat(sig);
        bytes memory otherKey = SshSigBuilder.p256PublicKey(5678);
        for (uint256 i = 0; i < otherKey.length; i++) {
            forged[14 + i] = otherKey[i];
        }
        (bool ok,) = verifier.verify(forged, "m", "ns");
        assertFalse(ok);
    }

    // ssh-keygen -Y sign -O hashalg=sha256 with fresh keys (test/fixtures/local/gen.sh).
    function test_local_ed25519() public view {
        _check(_hex(string.concat(LOCAL, "ed25519.sig.hex")), bytes(vm.readFile(string.concat(LOCAL, "message.txt"))), "sereno-test", _hex(string.concat(LOCAL, "ed25519.pub.hex")), "ed25519 sha256");
    }

    function test_local_rsa() public view {
        _check(_hex(string.concat(LOCAL, "rsa.sig.hex")), bytes(vm.readFile(string.concat(LOCAL, "message.txt"))), "sereno-test", _hex(string.concat(LOCAL, "rsa.pub.hex")), "rsa-3072 sha256");
    }

    function test_local_ecdsa() public view {
        _check(_hex(string.concat(LOCAL, "ecdsa.sig.hex")), bytes(vm.readFile(string.concat(LOCAL, "message.txt"))), "sereno-test", _hex(string.concat(LOCAL, "ecdsa.pub.hex")), "ecdsa sha256");
    }

    // OpenSSH's own regression vectors: default sha512 message hash, including FIDO security keys.
    function _openssh(string memory k) internal view {
        _check(_hex(string.concat(OPENSSH, k, ".sig.hex")), bytes(vm.readFile(string.concat(OPENSSH, "signed-data"))), bytes(vm.readFile(string.concat(OPENSSH, "namespace"))), _hex(string.concat(OPENSSH, k, ".pub.hex")), string.concat("openssh ", k, " sha512"));
    }

    function test_openssh_ecdsa() public view {
        _openssh("ecdsa");
    }

    function test_openssh_ecdsa_sk() public view {
        _openssh("ecdsa_sk");
    }

    function test_openssh_ed25519() public view {
        _openssh("ed25519");
    }

    function test_openssh_ed25519_sk() public view {
        _openssh("ed25519_sk");
    }

    function test_openssh_rsa() public view {
        _openssh("rsa");
    }

    function test_garbage_is_rejected() public view {
        (bool ok,) = verifier.verify("not an sshsig at all", "m", "ns");
        assertFalse(ok);
    }

    function test_truncated_reverts() public {
        bytes memory sig = SshSigBuilder.signP256(1, "m", "ns");
        bytes memory cut = new bytes(sig.length - 10);
        for (uint256 i = 0; i < cut.length; i++) {
            cut[i] = sig[i];
        }
        vm.expectRevert();
        verifier.verify(cut, "m", "ns");
    }
}
