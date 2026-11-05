// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// Formatting for the plain-text messages users sign.
library Text {
    function dec(uint256 v) internal pure returns (bytes memory out) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t > 0; t /= 10) len++;
        out = new bytes(len);
        for (; v > 0; v /= 10) out[--len] = bytes1(uint8(48 + (v % 10)));
    }

    /// 0x-prefixed lowercase hex (not EIP-55 checksummed).
    function hexAddress(address a) internal pure returns (bytes memory out) {
        bytes memory digits = "0123456789abcdef";
        out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        uint160 v = uint160(a);
        for (uint256 i = 41; i > 1; i--) {
            out[i] = digits[v & 15];
            v >>= 4;
        }
    }
}
