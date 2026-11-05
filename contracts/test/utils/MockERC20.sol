// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// Minimal 6-decimal token for tests (shaped like USDC).
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    uint8 public constant decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
