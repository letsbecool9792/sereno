// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {OffchainResolver} from "../src/ens/OffchainResolver.sol";

contract OffchainResolverTest is Test {
    OffchainResolver resolver;
    uint256 constant SIGNER_KEY = 0x5161;
    string constant URL = "https://gateway.example/{sender}/{data}.json";

    function setUp() public {
        resolver = new OffchainResolver(address(this), URL, vm.addr(SIGNER_KEY));
    }

    function _request() internal pure returns (bytes memory name, bytes memory data, bytes memory callData) {
        name = hex"08746f7276616c64730974616e676572696e650365746800"; // torvalds.tangerine.eth
        data = abi.encodeWithSignature("addr(bytes32)", bytes32(uint256(1)));
        callData = abi.encodeWithSelector(OffchainResolver.resolve.selector, name, data);
    }

    function _response(uint256 key, bytes memory callData, bytes memory result, uint64 expires)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest =
            keccak256(abi.encodePacked(hex"1900", address(resolver), expires, keccak256(callData), keccak256(result)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encode(result, expires, abi.encodePacked(r, s, v));
    }

    function test_resolve_asks_the_gateway() public {
        (bytes memory name, bytes memory data, bytes memory callData) = _request();
        string[] memory urls = new string[](1);
        urls[0] = URL;
        vm.expectRevert(
            abi.encodeWithSelector(
                OffchainResolver.OffchainLookup.selector,
                address(resolver),
                urls,
                callData,
                OffchainResolver.resolveWithProof.selector,
                callData
            )
        );
        resolver.resolve(name, data);
    }

    function test_signed_answer_is_accepted() public view {
        (,, bytes memory callData) = _request();
        bytes memory result = abi.encode(address(0xBEEF));
        bytes memory out =
            resolver.resolveWithProof(_response(SIGNER_KEY, callData, result, uint64(block.timestamp + 300)), callData);
        assertEq(out, result);
    }

    function test_unknown_signer_is_rejected() public {
        (,, bytes memory callData) = _request();
        bytes memory response = _response(0xBAD, callData, abi.encode(address(1)), uint64(block.timestamp + 300));
        vm.expectRevert(OffchainResolver.BadSigner.selector);
        resolver.resolveWithProof(response, callData);
    }

    function test_answer_for_another_request_is_rejected() public {
        (,, bytes memory callData) = _request();
        bytes memory response = _response(SIGNER_KEY, callData, abi.encode(address(1)), uint64(block.timestamp + 300));
        vm.expectRevert(OffchainResolver.BadSigner.selector);
        resolver.resolveWithProof(response, abi.encodePacked(callData, "x"));
    }

    function test_expired_answer_is_rejected() public {
        vm.warp(1000);
        (,, bytes memory callData) = _request();
        bytes memory response = _response(SIGNER_KEY, callData, abi.encode(address(1)), 999);
        vm.expectRevert(OffchainResolver.Expired.selector);
        resolver.resolveWithProof(response, callData);
    }

    function test_owner_controls_url_and_signers() public {
        resolver.setUrl("https://other/{sender}/{data}.json");
        assertEq(resolver.url(), "https://other/{sender}/{data}.json");
        resolver.setSigner(address(7), true);
        assertTrue(resolver.signers(address(7)));
        vm.prank(address(9));
        vm.expectRevert(OffchainResolver.NotOwner.selector);
        resolver.setUrl("x");
    }

    function test_is_an_extended_resolver() public view {
        assertTrue(resolver.supportsInterface(0x9061b923));
    }
}
