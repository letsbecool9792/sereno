// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// Reads and writes the SSH wire encoding (RFC 4251): uint32 big-endian lengths in front of byte strings.
library SshWire {
    error Truncated();

    function readString(bytes memory b, uint256 off) internal pure returns (bytes memory s, uint256 next) {
        if (off + 4 > b.length) revert Truncated();
        uint256 len;
        assembly ("memory-safe") {
            len := shr(224, mload(add(add(b, 32), off)))
        }
        next = off + 4 + len;
        if (next > b.length) revert Truncated();
        s = new bytes(len);
        assembly ("memory-safe") {
            mcopy(add(s, 32), add(add(b, 36), off), len)
        }
    }

    function readByte(bytes memory b, uint256 off) internal pure returns (uint8 v, uint256 next) {
        if (off + 1 > b.length) revert Truncated();
        return (uint8(b[off]), off + 1);
    }

    function readUint32(bytes memory b, uint256 off) internal pure returns (uint32 v, uint256 next) {
        if (off + 4 > b.length) revert Truncated();
        assembly ("memory-safe") {
            v := shr(224, mload(add(add(b, 32), off)))
        }
        next = off + 4;
    }

    function encodeString(bytes memory s) internal pure returns (bytes memory) {
        return abi.encodePacked(uint32(s.length), s);
    }

    /// An SSH mpint (positive, big-endian, optional leading zero byte) as a uint256. Fails if it is wider.
    function mpintToUint(bytes memory m) internal pure returns (bool ok, uint256 v) {
        uint256 start;
        while (start < m.length && m[start] == 0) start++;
        if (m.length - start > 32) return (false, 0);
        for (uint256 i = start; i < m.length; i++) {
            v = (v << 8) | uint8(m[i]);
        }
        return (true, v);
    }

    /// An SSH mpint with leading zero bytes removed.
    function stripMpint(bytes memory m) internal pure returns (bytes memory out) {
        uint256 start;
        while (start < m.length && m[start] == 0) start++;
        out = new bytes(m.length - start);
        for (uint256 i = 0; i < out.length; i++) {
            out[i] = m[start + i];
        }
    }

    function slice(bytes memory b, uint256 start, uint256 len) internal pure returns (bytes memory out) {
        out = new bytes(len);
        assembly ("memory-safe") {
            mcopy(add(out, 32), add(add(b, 32), start), len)
        }
    }
}
