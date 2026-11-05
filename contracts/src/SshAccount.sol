// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {INTENT_HEADER, SIGNING_NAMESPACE, GIT_NAMESPACE} from "./Constants.sol";
import {IKeyOracle} from "./interfaces/IKeyOracle.sol";
import {Text} from "./libraries/Text.sol";
import {ISshSigVerifier} from "./SshSigVerifier.sol";

/// A GitHub user's account. Any SSH key currently listed on their GitHub profile (per the key oracle) can spend by
/// signing a plain-text intent, either with `ssh-keygen -Y sign` (execute) or as the message of a signed git commit
/// (executeCommit). Anyone may submit; the signed text fixes recipient, amount and the relayer's fee.
contract SshAccount {
    /// Spends above INSTANT_LIMIT (token base units; 50 USDC) from a key first seen less than NEW_KEY_DELAY ago
    /// are refused, so a freshly added key (for example after a GitHub account takeover) can't drain the account.
    uint256 public constant NEW_KEY_DELAY = 72 hours;
    uint256 public constant INSTANT_LIMIT = 50e6;

    uint256 public immutable githubId;
    IKeyOracle public immutable oracle;
    ISshSigVerifier public immutable verifier;
    uint256 public nonce;

    event Executed(
        uint256 indexed nonce,
        address indexed token,
        address indexed to,
        uint256 amount,
        uint256 fee,
        address relayer,
        bytes32 keyHash,
        bool viaCommit
    );

    error BadSignature();
    error KeyNotOnProfile();
    error NewKeyCoolingDown(uint256 until);
    error BadCommitHeader();
    error TransferFailed();

    constructor(uint256 githubId_, IKeyOracle oracle_, ISshSigVerifier verifier_) {
        githubId = githubId_;
        oracle = oracle_;
        verifier = verifier_;
    }

    /// The exact text a spend signs (every line ends in \n; addresses lowercase hex; numbers decimal).
    function intent(address token, address to, uint256 amount, uint256 fee, uint256 n)
        public
        view
        returns (bytes memory)
    {
        return abi.encodePacked(
            INTENT_HEADER,
            "\nchain: ",
            Text.dec(block.chainid),
            "\naccount: ",
            Text.hexAddress(address(this)),
            "\ngithub-id: ",
            Text.dec(githubId),
            "\nnonce: ",
            Text.dec(n),
            "\nsend: ",
            Text.dec(amount),
            " of ",
            Text.hexAddress(token),
            "\nto: ",
            Text.hexAddress(to),
            "\nrelayer-fee: ",
            Text.dec(fee),
            "\n"
        );
    }

    /// Spend with an SSHSIG over `intent(...)` in the namespace SIGNING_NAMESPACE.
    function execute(address token, address to, uint256 amount, uint256 fee, bytes calldata sshsig) external {
        (bool ok, bytes memory publicKey) =
            verifier.verify(sshsig, intent(token, to, amount, fee, nonce), bytes(SIGNING_NAMESPACE));
        _spend(ok, publicKey, token, to, amount, fee, false);
    }

    /// Spend with a signed git commit whose message is exactly `intent(...)`. git signs the commit object without its
    /// gpgsig header: `headers` (tree, parent, author, committer lines) + "\n" + message.
    function executeCommit(
        address token,
        address to,
        uint256 amount,
        uint256 fee,
        bytes calldata headers,
        bytes calldata sshsig
    ) external {
        _checkCommitHeaders(headers);
        bytes memory commit = abi.encodePacked(headers, "\n", intent(token, to, amount, fee, nonce));
        (bool ok, bytes memory publicKey) = verifier.verify(sshsig, commit, bytes(GIT_NAMESPACE));
        _spend(ok, publicKey, token, to, amount, fee, true);
    }

    /// ENSv2 names are ERC-1155 tokens; claimed subnames are minted to this account.
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x4e2312e0 || interfaceId == 0x01ffc9a7; // ERC-1155 receiver, ERC-165
    }

    function _spend(
        bool ok,
        bytes memory publicKey,
        address token,
        address to,
        uint256 amount,
        uint256 fee,
        bool viaCommit
    ) internal {
        if (!ok) revert BadSignature();
        bytes32 keyHash = keccak256(publicKey);
        uint256 since = oracle.firstSeen(githubId, keyHash);
        if (since == 0) revert KeyNotOnProfile();
        if (amount > INSTANT_LIMIT && block.timestamp < since + NEW_KEY_DELAY) {
            revert NewKeyCoolingDown(since + NEW_KEY_DELAY);
        }
        uint256 n = nonce++;
        _transfer(token, to, amount);
        if (fee > 0) _transfer(token, msg.sender, fee);
        emit Executed(n, token, to, amount, fee, msg.sender, keyHash, viaCommit);
    }

    /// The intent must be the whole commit message, not a paragraph hidden in a longer one: the header block must
    /// start like a commit's ("tree "), end with a newline, and contain no blank line.
    function _checkCommitHeaders(bytes calldata h) internal pure {
        if (h.length < 6 || bytes5(h[:5]) != "tree " || h[h.length - 1] != "\n") revert BadCommitHeader();
        for (uint256 i = 1; i < h.length; i++) {
            if (h[i] == "\n" && h[i - 1] == "\n") revert BadCommitHeader();
        }
    }

    function _transfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!success || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
