// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test, console2} from "forge-std/Test.sol";
import {SshSigVerifier, IEd25519Verifier} from "../src/SshSigVerifier.sol";
import {KeyOracle} from "../src/KeyOracle.sol";
import {SshAccount} from "../src/SshAccount.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {SshSigBuilder} from "./utils/SshSigBuilder.sol";
import {MockERC20} from "./utils/MockERC20.sol";

contract SshAccountTest is Test {
    SshSigVerifier verifier;
    KeyOracle oracle;
    AccountFactory factory;
    MockERC20 usdc;
    address forwarder = makeAddr("forwarder");
    address relayer = makeAddr("relayer");
    address alice = makeAddr("alice");

    uint256 constant ID = 99113360;
    uint256 constant KEY = 0xB0B; // the developer's P-256 SSH key (in real life: ~/.ssh/id_ecdsa or a phone)
    uint256 constant OTHER_KEY = 0xE7E;
    bytes constant COMMIT_HEADERS =
        "tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nauthor dev <99113360+dev@users.noreply.github.com> 1793779827 +0530\ncommitter dev <99113360+dev@users.noreply.github.com> 1793779827 +0530\n";

    function setUp() public {
        vm.warp(1_800_000_000);
        verifier = new SshSigVerifier(IEd25519Verifier(deployCode("Ed25519Verifier.sol:Ed25519Verifier")));
        oracle = new KeyOracle(address(this));
        oracle.setForwarder(forwarder);
        factory = new AccountFactory(oracle, verifier);
        usdc = new MockERC20();
    }

    function _listKeys(uint256 id, uint256[] memory privateKeys) internal {
        bytes32[] memory hashes = new bytes32[](privateKeys.length);
        for (uint256 i = 0; i < privateKeys.length; i++) {
            hashes[i] = keccak256(SshSigBuilder.p256PublicKey(privateKeys[i]));
        }
        vm.prank(forwarder);
        oracle.onReport("", abi.encode(id, "dev", hashes));
    }

    function _listKey(uint256 privateKey) internal {
        uint256[] memory keys = new uint256[](1);
        keys[0] = privateKey;
        _listKeys(ID, keys);
    }

    /// Funds the account before it exists, lists KEY, ages it past the delay, deploys.
    function _ready() internal returns (SshAccount account) {
        usdc.mint(factory.addressOf(ID), 1000e6);
        _listKey(KEY);
        vm.warp(block.timestamp + 73 hours);
        account = factory.deploy(ID);
    }

    function _sign(SshAccount account, uint256 key, uint256 amount, uint256 fee) internal view returns (bytes memory) {
        return SshSigBuilder.signP256(key, account.intent(address(usdc), alice, amount, fee, account.nonce()), "sereno@v1");
    }

    function test_intent_text_is_exact() public {
        SshAccount account = _ready();
        string memory expected = string.concat(
            "sereno v1\nchain: 31337\naccount: ",
            vm.toLowercase(vm.toString(address(account))),
            "\ngithub-id: 99113360\nnonce: 0\nsend: 1500000 of ",
            vm.toLowercase(vm.toString(address(usdc))),
            "\nto: ",
            vm.toLowercase(vm.toString(alice)),
            "\nrelayer-fee: 20000\n"
        );
        assertEq(string(account.intent(address(usdc), alice, 1.5e6, 0.02e6, 0)), expected);
    }

    function test_paid_before_it_existed_then_spends() public {
        address predicted = factory.addressOf(ID);
        assertEq(predicted.code.length, 0);
        SshAccount account = _ready();
        assertEq(address(account), predicted);
        assertEq(usdc.balanceOf(address(account)), 1000e6);

        bytes memory sig = _sign(account, KEY, 5e6, 0.02e6);
        vm.prank(relayer);
        uint256 g = gasleft();
        account.execute(address(usdc), alice, 5e6, 0.02e6, sig);
        console2.log("execute (P-256) gas", g - gasleft());
        assertEq(usdc.balanceOf(alice), 5e6);
        assertEq(usdc.balanceOf(relayer), 0.02e6);
        assertEq(account.nonce(), 1);
    }

    function test_replay_is_rejected() public {
        SshAccount account = _ready();
        bytes memory sig = _sign(account, KEY, 1e6, 0);
        account.execute(address(usdc), alice, 1e6, 0, sig);
        vm.expectRevert(SshAccount.BadSignature.selector);
        account.execute(address(usdc), alice, 1e6, 0, sig);
    }

    function test_changed_recipient_amount_or_fee_is_rejected() public {
        SshAccount account = _ready();
        bytes memory sig = _sign(account, KEY, 1e6, 0.01e6);
        vm.expectRevert(SshAccount.BadSignature.selector);
        account.execute(address(usdc), relayer, 1e6, 0.01e6, sig);
        vm.expectRevert(SshAccount.BadSignature.selector);
        account.execute(address(usdc), alice, 2e6, 0.01e6, sig);
        vm.expectRevert(SshAccount.BadSignature.selector);
        account.execute(address(usdc), alice, 1e6, 0.5e6, sig);
    }

    function test_key_not_on_profile_is_rejected() public {
        SshAccount account = _ready();
        bytes memory sig = _sign(account, OTHER_KEY, 1e6, 0);
        vm.expectRevert(SshAccount.KeyNotOnProfile.selector);
        account.execute(address(usdc), alice, 1e6, 0, sig);
    }

    function test_key_removed_on_github_is_rejected() public {
        SshAccount account = _ready();
        _listKeys(ID, new uint256[](0)); // next oracle run: key gone
        bytes memory sig = _sign(account, KEY, 1e6, 0);
        vm.expectRevert(SshAccount.KeyNotOnProfile.selector);
        account.execute(address(usdc), alice, 1e6, 0, sig);
    }

    function test_new_key_waits_for_large_spends_only() public {
        usdc.mint(factory.addressOf(ID), 1000e6);
        _listKey(KEY);
        SshAccount account = factory.deploy(ID);
        // small spend: instant
        account.execute(address(usdc), alice, 50e6, 0, _sign(account, KEY, 50e6, 0));
        // large spend: delayed for 72 hours after the key first appeared
        bytes memory big = _sign(account, KEY, 51e6, 0);
        vm.expectRevert(abi.encodeWithSelector(SshAccount.NewKeyCoolingDown.selector, block.timestamp + 72 hours));
        account.execute(address(usdc), alice, 51e6, 0, big);
        vm.warp(block.timestamp + 72 hours);
        account.execute(address(usdc), alice, 51e6, 0, big);
        assertEq(usdc.balanceOf(alice), 101e6);
    }

    function test_git_namespace_signature_cannot_execute() public {
        SshAccount account = _ready();
        bytes memory sig = SshSigBuilder.signP256(KEY, account.intent(address(usdc), alice, 1e6, 0, 0), "git");
        vm.expectRevert(SshAccount.BadSignature.selector);
        account.execute(address(usdc), alice, 1e6, 0, sig);
    }

    function test_signature_for_another_account_is_useless() public {
        SshAccount account = _ready();
        // same GitHub ID and key under a second deployment (another factory) -> another account address
        AccountFactory other = new AccountFactory(oracle, verifier);
        usdc.mint(other.addressOf(ID), 10e6);
        SshAccount twin = other.deploy(ID);
        bytes memory sig = _sign(account, KEY, 1e6, 0);
        vm.expectRevert(SshAccount.BadSignature.selector);
        twin.execute(address(usdc), alice, 1e6, 0, sig);
    }

    // ---- commit-as-payment ----

    function _commitSig(SshAccount account, bytes memory headers, uint256 amount, uint256 fee)
        internal
        view
        returns (bytes memory)
    {
        bytes memory commit = bytes.concat(headers, "\n", account.intent(address(usdc), alice, amount, fee, account.nonce()));
        return SshSigBuilder.signP256(KEY, commit, "git");
    }

    function test_signed_commit_pays() public {
        SshAccount account = _ready();
        bytes memory sig = _commitSig(account, COMMIT_HEADERS, 2e6, 0.02e6);
        vm.prank(relayer);
        uint256 g = gasleft();
        account.executeCommit(address(usdc), alice, 2e6, 0.02e6, COMMIT_HEADERS, sig);
        console2.log("executeCommit (P-256) gas", g - gasleft());
        assertEq(usdc.balanceOf(alice), 2e6);
        assertEq(usdc.balanceOf(relayer), 0.02e6);
        vm.expectRevert(SshAccount.BadSignature.selector); // same commit again
        account.executeCommit(address(usdc), alice, 2e6, 0.02e6, COMMIT_HEADERS, sig);
    }

    function test_commit_with_parent_line_pays() public {
        SshAccount account = _ready();
        bytes memory headers = bytes.concat(
            "tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nparent 5d7a2983a72520e1ea16b1eaf683fafad3e7f5dd\n",
            "author dev <d@x> 1 +0000\ncommitter dev <d@x> 1 +0000\n"
        );
        account.executeCommit(address(usdc), alice, 1e6, 0, headers, _commitSig(account, headers, 1e6, 0));
        assertEq(usdc.balanceOf(alice), 1e6);
    }

    function test_commit_headers_must_be_a_real_header_block() public {
        SshAccount account = _ready();
        bytes memory sig = _commitSig(account, COMMIT_HEADERS, 1e6, 0);
        vm.expectRevert(SshAccount.BadCommitHeader.selector); // blank line: intent hidden as a later paragraph
        account.executeCommit(address(usdc), alice, 1e6, 0, bytes.concat(COMMIT_HEADERS, "\nsomething else\n"), sig);
        vm.expectRevert(SshAccount.BadCommitHeader.selector); // not a commit
        account.executeCommit(address(usdc), alice, 1e6, 0, "object abc\ntype commit\n", sig);
        vm.expectRevert(SshAccount.BadCommitHeader.selector); // no trailing newline
        account.executeCommit(address(usdc), alice, 1e6, 0, "tree abc", sig);
    }

    function test_altered_commit_author_is_rejected() public {
        SshAccount account = _ready();
        bytes memory sig = _commitSig(account, COMMIT_HEADERS, 1e6, 0);
        bytes memory altered =
            "tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nauthor mallory <m@x> 1793779827 +0530\ncommitter dev <99113360+dev@users.noreply.github.com> 1793779827 +0530\n";
        vm.expectRevert(SshAccount.BadSignature.selector);
        account.executeCommit(address(usdc), alice, 1e6, 0, altered, sig);
    }

    function test_plain_namespace_signature_cannot_pay_as_commit() public {
        SshAccount account = _ready();
        bytes memory commit = bytes.concat(COMMIT_HEADERS, "\n", account.intent(address(usdc), alice, 1e6, 0, 0));
        bytes memory sig = SshSigBuilder.signP256(KEY, commit, "sereno@v1");
        vm.expectRevert(SshAccount.BadSignature.selector);
        account.executeCommit(address(usdc), alice, 1e6, 0, COMMIT_HEADERS, sig);
    }

    // ---- factory and ENS compatibility ----

    function test_factory_deploy_is_idempotent() public {
        SshAccount a = factory.deploy(ID);
        SshAccount b = factory.deploy(ID);
        assertEq(address(a), address(b));
        assertEq(address(a), factory.addressOf(ID));
        assertEq(a.githubId(), ID);
    }

    function test_accepts_erc1155_names() public {
        SshAccount account = factory.deploy(ID);
        assertEq(account.onERC1155Received(address(0), address(0), 1, 1, ""), SshAccount.onERC1155Received.selector);
        assertTrue(account.supportsInterface(0x4e2312e0));
    }
}
