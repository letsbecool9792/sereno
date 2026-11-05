// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// ENSIP-10 wildcard resolver for `<github-user>.<parent>`. Every lookup goes to the gateway through EIP-3668
/// CCIP-read; the gateway maps the GitHub login to its numeric ID and the ID to the user's account address, and signs
/// the answer with the scheme of ENS's reference offchain resolver. Claimed names have their own resolver instead.
contract OffchainResolver {
    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);
    error NotOwner();
    error Expired();
    error BadSigner();

    address public owner;
    string public url;
    mapping(address => bool) public signers;

    event UrlSet(string url);
    event SignerSet(address signer, bool allowed);
    event OwnerSet(address owner);

    constructor(address owner_, string memory url_, address signer) {
        owner = owner_;
        url = url_;
        signers[signer] = true;
        emit SignerSet(signer, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// Gateway URL template, e.g. "https://gateway.example/{sender}/{data}.json".
    function setUrl(string calldata url_) external onlyOwner {
        url = url_;
        emit UrlSet(url_);
    }

    function setSigner(address signer, bool allowed) external onlyOwner {
        signers[signer] = allowed;
        emit SignerSet(signer, allowed);
    }

    function setOwner(address owner_) external onlyOwner {
        owner = owner_;
        emit OwnerSet(owner_);
    }

    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        bytes memory callData = abi.encodeWithSelector(this.resolve.selector, name, data);
        string[] memory urls = new string[](1);
        urls[0] = url;
        revert OffchainLookup(address(this), urls, callData, this.resolveWithProof.selector, callData);
    }

    /// `response` = abi.encode(bytes result, uint64 expires, bytes signature), signature by an allowed signer over
    /// keccak256(0x1900 || this || expires || keccak256(request) || keccak256(result)).
    function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns (bytes memory) {
        (bytes memory result, uint64 expires, bytes memory sig) = abi.decode(response, (bytes, uint64, bytes));
        if (expires < block.timestamp) revert Expired();
        bytes32 digest =
            keccak256(abi.encodePacked(hex"1900", address(this), expires, keccak256(extraData), keccak256(result)));
        if (!signers[_recover(digest, sig)]) revert BadSigner();
        return result;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x9061b923 || interfaceId == 0x01ffc9a7; // IExtendedResolver, ERC-165
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }
}
