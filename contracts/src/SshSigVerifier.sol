// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {SshWire} from "./libraries/SshWire.sol";

interface IEd25519Verifier {
    function verify(bytes32 k, bytes32 r, bytes32 s, bytes calldata m) external pure returns (bool);
    function sha512(bytes calldata m) external pure returns (bytes memory);
}

interface ISshSigVerifier {
    function verify(bytes calldata sig, bytes calldata message, bytes calldata namespace)
        external
        view
        returns (bool ok, bytes memory publicKey);
}

// Verifies OpenSSH signatures made with `ssh-keygen -Y sign` (the SSHSIG format, OpenSSH PROTOCOL.sshsig).
//
// Keys: ecdsa-sha2-nistp256, sk-ecdsa-sha2-nistp256@openssh.com (FIDO security keys, phones), ssh-ed25519,
// sk-ssh-ed25519@openssh.com, and ssh-rsa of 2048 bits or more (rsa-sha2-256 or rsa-sha2-512).
// Message hashes: sha256 (precompile, cheap) or sha512 (Solidity, about 210k gas per 128-byte block).
contract SshSigVerifier is ISshSigVerifier {
    using SshWire for bytes;

    address internal constant P256_VERIFY = address(0x100); // EIP-7951 / RIP-7212
    address internal constant MODEXP = address(0x05);
    uint8 internal constant FLAG_USER_PRESENT = 0x01;

    bytes32 internal constant ECDSA_P256 = keccak256("ecdsa-sha2-nistp256");
    bytes32 internal constant SK_ECDSA_P256 = keccak256("sk-ecdsa-sha2-nistp256@openssh.com");
    bytes32 internal constant ED25519 = keccak256("ssh-ed25519");
    bytes32 internal constant SK_ED25519 = keccak256("sk-ssh-ed25519@openssh.com");
    bytes32 internal constant RSA = keccak256("ssh-rsa");
    bytes32 internal constant NISTP256 = keccak256("nistp256");

    // DER DigestInfo prefixes for PKCS#1 v1.5 (RFC 8017, section 9.2)
    bytes internal constant SHA256_DIGEST_INFO = hex"3031300d060960864801650304020105000420";
    bytes internal constant SHA512_DIGEST_INFO = hex"3051300d060960864801650304020305000440";

    IEd25519Verifier public immutable ed25519;

    constructor(IEd25519Verifier ed25519Verifier) {
        ed25519 = ed25519Verifier;
    }

    /// Returns `ok` and the signer's public key blob: the base64-decoded key field of an `authorized_keys` line,
    /// so `keccak256(publicKey)` identifies the key. Returns false for any well-formed but invalid signature;
    /// reverts only on truncated encodings.
    function verify(bytes calldata sig, bytes calldata message, bytes calldata namespace)
        external
        view
        returns (bool ok, bytes memory publicKey)
    {
        bytes memory signature;
        bytes memory signedData;
        (publicKey, signature, signedData) = _unwrap(sig, message, namespace);
        if (signedData.length != 0) ok = _verifyKey(publicKey, signature, signedData);
    }

    /// Parses the SSHSIG envelope and rebuilds the bytes the key signed. Empty `signedData` means reject.
    function _unwrap(bytes memory sig, bytes calldata message, bytes calldata namespace)
        internal
        view
        returns (bytes memory publicKey, bytes memory signature, bytes memory signedData)
    {
        if (sig.length < 10 || bytes6(sig) != bytes6("SSHSIG")) return (publicKey, signature, signedData);
        (uint32 version, uint256 o) = sig.readUint32(6);
        if (version != 1) return (publicKey, signature, signedData);
        bytes memory ns;
        bytes memory reserved;
        bytes memory hashAlg;
        (publicKey, o) = sig.readString(o);
        (ns, o) = sig.readString(o);
        (reserved, o) = sig.readString(o);
        (hashAlg, o) = sig.readString(o);
        (signature,) = sig.readString(o);
        if (keccak256(ns) != keccak256(namespace)) return (publicKey, signature, signedData);
        bytes memory digest = _messageDigest(hashAlg, message);
        if (digest.length == 0) return (publicKey, signature, signedData);
        signedData = abi.encodePacked(
            "SSHSIG", ns.encodeString(), reserved.encodeString(), hashAlg.encodeString(), digest.encodeString()
        );
    }

    function _messageDigest(bytes memory hashAlg, bytes calldata message) internal view returns (bytes memory) {
        bytes32 h = keccak256(hashAlg);
        if (h == keccak256("sha256")) return abi.encodePacked(sha256(message));
        if (h == keccak256("sha512")) return ed25519.sha512(message);
        return "";
    }

    function _verifyKey(bytes memory publicKey, bytes memory signature, bytes memory signedData)
        internal
        view
        returns (bool)
    {
        (bytes memory keyType, uint256 o) = publicKey.readString(0);
        bytes32 t = keccak256(keyType);
        if (t == ECDSA_P256) return _ecdsaP256(publicKey, o, signature, signedData);
        if (t == SK_ECDSA_P256) return _skEcdsaP256(publicKey, o, signature, signedData);
        if (t == ED25519) return _ed25519(publicKey, o, signature, signedData);
        if (t == SK_ED25519) return _skEd25519(publicKey, o, signature, signedData);
        if (t == RSA) return _rsa(publicKey, o, signature, signedData);
        return false;
    }

    // publickey: string "ecdsa-sha2-nistp256", string "nistp256", string Q
    // signature: string "ecdsa-sha2-nistp256", string (mpint r, mpint s)
    function _ecdsaP256(bytes memory pk, uint256 o, bytes memory signature, bytes memory signedData)
        internal
        view
        returns (bool)
    {
        bytes memory curve;
        bytes memory q;
        (curve, o) = pk.readString(o);
        (q,) = pk.readString(o);
        (bytes memory sigType, uint256 so) = signature.readString(0);
        if (keccak256(sigType) != ECDSA_P256 || keccak256(curve) != NISTP256) return false;
        (bytes memory rs,) = signature.readString(so);
        return _p256(sha256(signedData), q, rs);
    }

    // publickey: ... string Q, string application
    // signature: string type, string (mpint r, mpint s), byte flags, uint32 counter
    // The authenticator signs SHA256(application) || flags || counter || SHA256(signed data) (PROTOCOL.u2f).
    function _skEcdsaP256(bytes memory pk, uint256 o, bytes memory signature, bytes memory signedData)
        internal
        view
        returns (bool)
    {
        bytes memory curve;
        bytes memory q;
        bytes memory application;
        (curve, o) = pk.readString(o);
        (q, o) = pk.readString(o);
        (application,) = pk.readString(o);
        (bytes memory sigType, uint256 so) = signature.readString(0);
        if (keccak256(sigType) != SK_ECDSA_P256 || keccak256(curve) != NISTP256) return false;
        bytes memory rs;
        uint8 flags;
        uint32 counter;
        (rs, so) = signature.readString(so);
        (flags, so) = signature.readByte(so);
        (counter,) = signature.readUint32(so);
        if (flags & FLAG_USER_PRESENT == 0) return false;
        bytes32 h = sha256(abi.encodePacked(sha256(application), flags, counter, sha256(signedData)));
        return _p256(h, q, rs);
    }

    function _p256(bytes32 h, bytes memory q, bytes memory rs) internal view returns (bool) {
        if (q.length != 65 || q[0] != 0x04) return false;
        (bool ok, uint256 r, uint256 s) = _ecdsaRS(rs);
        if (!ok) return false;
        (bool success, bytes memory ret) = P256_VERIFY.staticcall(abi.encodePacked(h, r, s, SshWire.slice(q, 1, 64)));
        return success && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }

    // string (mpint r, mpint s)
    function _ecdsaRS(bytes memory rs) internal pure returns (bool ok, uint256 r, uint256 s) {
        (bytes memory rBytes, uint256 o) = rs.readString(0);
        (bytes memory sBytes,) = rs.readString(o);
        bool okS;
        (ok, r) = SshWire.mpintToUint(rBytes);
        (okS, s) = SshWire.mpintToUint(sBytes);
        ok = ok && okS;
    }

    // publickey: string "ssh-ed25519", string key(32)
    // signature: string "ssh-ed25519", string R(32) || S(32)
    function _ed25519(bytes memory pk, uint256 o, bytes memory signature, bytes memory signedData)
        internal
        view
        returns (bool)
    {
        (bytes memory k,) = pk.readString(o);
        (bytes memory sigType, uint256 so) = signature.readString(0);
        if (keccak256(sigType) != ED25519 || k.length != 32) return false;
        (bytes memory raw,) = signature.readString(so);
        if (raw.length != 64) return false;
        return ed25519.verify(bytes32(k), bytes32(raw), bytes32(SshWire.slice(raw, 32, 32)), signedData);
    }

    // publickey: ... string key(32), string application
    // signature: string type, string R || S, byte flags, uint32 counter
    function _skEd25519(bytes memory pk, uint256 o, bytes memory signature, bytes memory signedData)
        internal
        view
        returns (bool)
    {
        bytes memory k;
        bytes memory application;
        (k, o) = pk.readString(o);
        (application,) = pk.readString(o);
        (bytes memory sigType, uint256 so) = signature.readString(0);
        if (keccak256(sigType) != SK_ED25519 || k.length != 32) return false;
        bytes memory raw;
        uint8 flags;
        uint32 counter;
        (raw, so) = signature.readString(so);
        (flags, so) = signature.readByte(so);
        (counter,) = signature.readUint32(so);
        if (raw.length != 64 || flags & FLAG_USER_PRESENT == 0) return false;
        bytes memory m = abi.encodePacked(sha256(application), flags, counter, sha256(signedData));
        return ed25519.verify(bytes32(k), bytes32(raw), bytes32(SshWire.slice(raw, 32, 32)), m);
    }

    // publickey: string "ssh-rsa", mpint e, mpint n
    // signature: string "rsa-sha2-512" | "rsa-sha2-256", string s (ssh-keygen always uses rsa-sha2-512)
    function _rsa(bytes memory pk, uint256 o, bytes memory signature, bytes memory signedData)
        internal
        view
        returns (bool)
    {
        bytes memory e;
        bytes memory n;
        (e, o) = pk.readString(o);
        (n,) = pk.readString(o);
        e = SshWire.stripMpint(e);
        n = SshWire.stripMpint(n);
        if (n.length < 256) return false; // 2048-bit minimum
        (bytes memory alg, uint256 so) = signature.readString(0);
        (bytes memory s,) = signature.readString(so);
        if (s.length > n.length) return false;
        bytes32 a = keccak256(alg);
        bytes memory digestInfo;
        if (a == keccak256("rsa-sha2-512")) {
            digestInfo = abi.encodePacked(SHA512_DIGEST_INFO, ed25519.sha512(signedData));
        } else if (a == keccak256("rsa-sha2-256")) {
            digestInfo = abi.encodePacked(SHA256_DIGEST_INFO, sha256(signedData));
        } else {
            return false;
        }
        return _pkcs1v15(s, e, n, digestInfo);
    }

    /// s^e mod n must equal 0x00 0x01 0xff..0xff 0x00 DigestInfo (EMSA-PKCS1-v1_5).
    function _pkcs1v15(bytes memory s, bytes memory e, bytes memory n, bytes memory digestInfo)
        internal
        view
        returns (bool)
    {
        uint256 k = n.length;
        if (k < digestInfo.length + 11) return false;
        (bool success, bytes memory em) =
            MODEXP.staticcall(abi.encodePacked(uint256(s.length), uint256(e.length), k, s, e, n));
        if (!success || em.length != k) return false;
        uint256 sep = k - digestInfo.length - 1;
        if (em[0] != 0x00 || em[1] != 0x01 || em[sep] != 0x00) return false;
        for (uint256 i = 2; i < sep; i++) {
            if (em[i] != 0xff) return false;
        }
        return keccak256(SshWire.slice(em, sep + 1, digestInfo.length)) == keccak256(digestInfo);
    }
}
