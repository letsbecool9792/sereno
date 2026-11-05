// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// ERC-20 calls that accept tokens returning nothing (like USDT) and revert on `false`.
library SafeToken {
    error TransferFailed();

    function send(address token, address to, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer
    }

    function pull(address token, address from, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(0x23b872dd, from, address(this), amount)); // transferFrom
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool))) || token.code.length == 0) revert TransferFailed();
    }
}
