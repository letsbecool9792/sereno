// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IKeyOracle} from "./interfaces/IKeyOracle.sol";

/// On-chain copy of each tracked GitHub user's SSH keys (authentication and signing keys) and login, written by a
/// Chainlink CRE workflow through its forwarder. Each report is the user's complete current key set, so a key
/// deleted on GitHub disappears here on the next run.
contract KeyOracle is IKeyOracle {
    address public immutable owner;
    /// The CRE forwarder allowed to deliver reports. Settable (not a constructor argument) so the oracle has the same
    /// CREATE2 address on every chain.
    address public forwarder;

    mapping(uint256 githubId => mapping(bytes32 keyHash => uint256)) public firstSeen;
    mapping(uint256 githubId => bytes32[]) internal _keys;
    mapping(uint256 githubId => string) public loginOf;
    mapping(bytes32 loginHash => uint256) public idOfLoginHash;
    mapping(uint256 githubId => uint256) public lastUpdated;

    event ForwarderSet(address forwarder);
    event KeysUpdated(uint256 indexed githubId, string login, bytes32[] keyHashes);

    error NotOwner();
    error NotForwarder();

    constructor(address owner_) {
        owner = owner_;
    }

    function setForwarder(address forwarder_) external {
        if (msg.sender != owner) revert NotOwner();
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    /// CRE receiver entry point. `report` = abi.encode(uint256 githubId, string login, bytes32[] keyHashes), the login
    /// lowercase and each key hash keccak256 of the raw key blob (the base64-decoded field of an authorized_keys line).
    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != forwarder || forwarder == address(0)) revert NotForwarder();
        (uint256 githubId, string memory login, bytes32[] memory keyHashes) =
            abi.decode(report, (uint256, string, bytes32[]));
        _setKeys(githubId, keyHashes);
        _setLogin(githubId, login);
        lastUpdated[githubId] = block.timestamp;
        emit KeysUpdated(githubId, login, keyHashes);
    }

    function keysOf(uint256 githubId) external view returns (bytes32[] memory) {
        return _keys[githubId];
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == this.onReport.selector || interfaceId == 0x01ffc9a7; // IReceiver, ERC-165
    }

    function _setKeys(uint256 githubId, bytes32[] memory keyHashes) internal {
        bytes32[] storage old = _keys[githubId];
        for (uint256 i = 0; i < old.length; i++) {
            if (!_contains(keyHashes, old[i])) delete firstSeen[githubId][old[i]];
        }
        for (uint256 i = 0; i < keyHashes.length; i++) {
            if (firstSeen[githubId][keyHashes[i]] == 0) firstSeen[githubId][keyHashes[i]] = block.timestamp;
        }
        _keys[githubId] = keyHashes;
    }

    function _setLogin(uint256 githubId, string memory login) internal {
        bytes32 newHash = keccak256(bytes(login));
        bytes32 oldHash = keccak256(bytes(loginOf[githubId]));
        if (newHash == oldHash) return;
        if (idOfLoginHash[oldHash] == githubId) delete idOfLoginHash[oldHash];
        idOfLoginHash[newHash] = githubId;
        loginOf[githubId] = login;
    }

    function _contains(bytes32[] memory list, bytes32 x) internal pure returns (bool) {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == x) return true;
        }
        return false;
    }
}
