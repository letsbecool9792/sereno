// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {NameRegistrar} from "../src/ens/NameRegistrar.sol";
import {IVerifiableFactory, IENSv2Registry} from "../src/ens/IENSv2.sol";
import {IKeyOracle} from "../src/interfaces/IKeyOracle.sol";
import {ISshSigVerifier} from "../src/SshSigVerifier.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {KeyOracle} from "../src/KeyOracle.sol";

interface IUserRegistryAdmin {
    function grantRootRoles(uint256 roleBitmap, address account) external;
}

/// The rename story against the real ENSv2 contracts and our live KeyOracle on a fork of Ethereum Sepolia (the unit
/// tests use a mock registry). Only the SSH signature check is stubbed; SshSigVerifier has its own tests.
///
///   SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com forge test --match-contract NameRegistrarFork -vv
///
/// Skipped when SEPOLIA_RPC is unset.
contract NameRegistrarForkTest is Test {
    IENSv2Registry constant USER_REGISTRY = IENSv2Registry(0x4BE80595522f0E143b2D34392EA031e29e3652ba);
    IVerifiableFactory constant PROXY_FACTORY = IVerifiableFactory(0xDa70306C98E97eCe36F997a21368e53298572991);
    address constant RESOLVER_IMPL = 0x115eb53F0c60696633855F90b138178Fb40b2b2C;
    AccountFactory constant ACCOUNTS = AccountFactory(0x33915d5B5e104aA6A1F8683362ec0C49FFE5D74b);
    KeyOracle constant ORACLE = KeyOracle(0x6b7303f5F5fc8A9220910eB3097e38603B777D6E);
    address constant VERIFIER = 0xc4830Cb511c6a1B1a011489aEa0834e4EA76c411;
    address constant DEPLOYER = 0x11c06c02424cab83238A7747eBc6584b4B680588; // root admin of the UserRegistry

    // Fake GitHub IDs and logins that nobody holds, so the fork state is clean.
    uint256 constant ALICE_ID = 990_000_001; // "alice" who renames to "bob"
    uint256 constant NEW_ALICE_ID = 990_000_002; // a stranger who takes "alice" afterwards
    string constant ALICE = "zzsereno-rename-alice";
    string constant BOB = "zzsereno-rename-bob";
    bytes constant PUBKEY = "fork-test-key";

    NameRegistrar registrar;
    bool noFork;

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC", string(""));
        if (bytes(rpc).length == 0) {
            noFork = true;
            return;
        }
        vm.createSelectFork(rpc);
        uint256[] memory coinTypes = new uint256[](3);
        (coinTypes[0], coinTypes[1], coinTypes[2]) = (60, 2147568180, 2147905262);
        registrar = new NameRegistrar(
            USER_REGISTRY, PROXY_FACTORY, RESOLVER_IMPL, ACCOUNTS, IKeyOracle(address(ORACLE)), ISshSigVerifier(VERIFIER),
            "sereno.eth", 1825434684, coinTypes
        );
        // What ens-setup.ts grants: REGISTRAR, UNREGISTER, SET_SUBREGISTRY, SET_RESOLVER.
        vm.prank(DEPLOYER);
        IUserRegistryAdmin(address(USER_REGISTRY)).grantRootRoles((1 << 0) | (1 << 12) | (1 << 20) | (1 << 24), address(registrar));
        // Every claim's signature "verifies" as PUBKEY, which the oracle lists for both users below.
        vm.mockCall(VERIFIER, abi.encodeWithSelector(ISshSigVerifier.verify.selector), abi.encode(true, PUBKEY));
    }

    /// The CRE workflow's report for one user, delivered through the oracle's forwarder (the ReportGate).
    function _sync(uint256 id, string memory login) internal {
        bytes32[] memory keys = new bytes32[](1);
        keys[0] = keccak256(PUBKEY);
        vm.prank(ORACLE.forwarder());
        ORACLE.onReport("", abi.encode(id, login, keys));
    }

    function _owner(string memory label) internal view returns (address) {
        return USER_REGISTRY.getOwner(uint256(keccak256(bytes(label))));
    }

    function test_rename_then_a_stranger_takes_the_old_login() public {
        if (noFork) return;

        // 1. alice claims alice.sereno.eth.
        _sync(ALICE_ID, ALICE);
        registrar.claim(ALICE, ALICE_ID, "");
        assertEq(_owner(ALICE), ACCOUNTS.addressOf(ALICE_ID));

        // 2. She renames to bob on GitHub; the next sync moves the login. She claims bob.sereno.eth too.
        _sync(ALICE_ID, BOB);
        assertEq(ORACLE.idOfLoginHash(keccak256(bytes(ALICE))), 0);
        registrar.claim(BOB, ALICE_ID, "");
        assertEq(_owner(BOB), ACCOUNTS.addressOf(ALICE_ID));
        (, bool stale) = registrar.holderOf(ALICE);
        assertTrue(stale, "alice.sereno.eth is stale once its login moved");

        // 3. A stranger takes the "alice" login and syncs. They can't claim while the old holder still has it...
        _sync(NEW_ALICE_ID, ALICE);
        vm.expectRevert(NameRegistrar.StaleNotReleased.selector);
        registrar.claim(ALICE, NEW_ALICE_ID, "");

        // 4. ...anyone releases it: the name resolves to nobody for the quarantine...
        vm.prank(address(0xBEEF));
        registrar.release(ALICE);
        assertEq(_owner(ALICE), address(0));
        (uint256 until, address prev, uint256 prevId) = registrar.quarantineOf(ALICE);
        assertEq(until, block.timestamp + 15 days);
        assertEq(prev, ACCOUNTS.addressOf(ALICE_ID));
        assertEq(prevId, ALICE_ID);
        vm.expectRevert(abi.encodeWithSelector(NameRegistrar.Quarantined.selector, until));
        registrar.claim(ALICE, NEW_ALICE_ID, "");

        // 5. ...and after it, the new alice claims a real ENSv2 name of their own. bob.sereno.eth is untouched.
        vm.warp(until);
        registrar.claim(ALICE, NEW_ALICE_ID, "");
        assertEq(_owner(ALICE), ACCOUNTS.addressOf(NEW_ALICE_ID));
        assertEq(_owner(BOB), ACCOUNTS.addressOf(ALICE_ID));
    }

    /// The old holder renaming back during the quarantine gets their name back at once.
    function test_renaming_back_reclaims_at_once() public {
        if (noFork) return;
        _sync(ALICE_ID, ALICE);
        registrar.claim(ALICE, ALICE_ID, "");
        _sync(ALICE_ID, BOB); // renamed: "alice" maps to nobody, so the name is stale
        registrar.release(ALICE);
        _sync(ALICE_ID, ALICE); // renamed back
        registrar.claim(ALICE, ALICE_ID, "");
        assertEq(_owner(ALICE), ACCOUNTS.addressOf(ALICE_ID));
    }
}
