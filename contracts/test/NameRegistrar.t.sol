// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {SshSigVerifier, IEd25519Verifier} from "../src/SshSigVerifier.sol";
import {KeyOracle} from "../src/KeyOracle.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {NameRegistrar} from "../src/ens/NameRegistrar.sol";
import {Grant, IVerifiableFactory, IENSv2Registry, ResolverRoles} from "../src/ens/IENSv2.sol";
import {SshSigBuilder} from "./utils/SshSigBuilder.sol";

// Stand-ins for the three ENSv2 contracts the registrar calls; the real ones are exercised on Sepolia.
contract MockPermissionedResolver {
    mapping(address => uint256) public rootRoles;
    mapping(uint256 => bytes) public defaultAddress;
    bool internal _initializing;
    bool public initialized;

    function initialize(Grant[] calldata grants, bytes[] calldata calls) external {
        require(!initialized, "initialized");
        initialized = true;
        _initializing = true;
        for (uint256 i = 0; i < grants.length; i++) {
            rootRoles[grants[i].account] = grants[i].roleBitmap;
        }
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok,) = address(this).call(calls[i]);
            require(ok, "init call failed");
        }
        _initializing = false;
    }

    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external {
        require(_initializing || rootRoles[msg.sender] & 1 != 0, "no role");
        require(name.length == 1 && name[0] == 0, "default record only");
        defaultAddress[coinType] = addressBytes;
    }

    mapping(string => string) public defaultText;

    function setText(bytes calldata name, string calldata key, string calldata value) external {
        require(_initializing || rootRoles[msg.sender] & (1 << 4) != 0, "no role");
        require(name.length == 1 && name[0] == 0, "default record only");
        defaultText[key] = value;
    }
}

contract MockVerifiableFactory is IVerifiableFactory {
    function deployProxy(address, uint256 salt, bytes calldata data) external returns (address proxy) {
        proxy = address(new MockPermissionedResolver{salt: bytes32(salt)}());
        (bool ok,) = proxy.call(data);
        require(ok, "init failed");
    }
}

contract MockUserRegistry is IENSv2Registry {
    struct Entry {
        address owner;
        address resolver;
        uint256 roles;
        uint64 expiry;
    }

    address public registrar;
    mapping(bytes32 => Entry) public entries;

    function setRegistrar(address r) external {
        registrar = r;
    }

    function register(string calldata label, address owner, address, address resolver, uint256 roles, uint64 expiry)
        external
        returns (uint256)
    {
        require(msg.sender == registrar, "not registrar");
        bytes32 k = keccak256(bytes(label));
        require(entries[k].owner == address(0), "taken");
        entries[k] = Entry(owner, resolver, roles, expiry);
        return uint256(k);
    }
}

contract NameRegistrarTest is Test {
    KeyOracle oracle;
    AccountFactory accounts;
    MockUserRegistry registry;
    NameRegistrar registrar;
    uint256 constant ID = 99113360;
    uint256 constant KEY = 0xB0B;

    function setUp() public {
        SshSigVerifier verifier = new SshSigVerifier(IEd25519Verifier(deployCode("Ed25519Verifier.sol:Ed25519Verifier")));
        oracle = new KeyOracle(address(this));
        oracle.setForwarder(address(this));
        accounts = new AccountFactory(oracle, verifier);
        registry = new MockUserRegistry();
        uint256[] memory coinTypes = new uint256[](3);
        (coinTypes[0], coinTypes[1], coinTypes[2]) = (60, 0x80000000 | 84532, 0x80000000 | 421614);
        registrar = new NameRegistrar(
            registry, new MockVerifiableFactory(), address(0x1234), accounts, oracle, verifier, "sereno.eth", 2_000_000_000, coinTypes
        );
        registry.setRegistrar(address(registrar));
        bytes32[] memory keys = new bytes32[](1);
        keys[0] = keccak256(SshSigBuilder.p256PublicKey(KEY));
        oracle.onReport("", abi.encode(ID, "letsbecool9792", keys));
    }

    function _claimSig(uint256 key, string memory label, uint256 id) internal view returns (bytes memory) {
        return SshSigBuilder.signP256(key, registrar.claimText(label, id), "sereno@v1");
    }

    function test_claim_text_is_exact() public view {
        assertEq(
            string(registrar.claimText("letsbecool9792", ID)),
            string.concat(
                "sereno v1\nchain: 31337\nclaim-name: letsbecool9792.sereno.eth\ngithub-id: 99113360\naccount: ",
                vm.toLowercase(vm.toString(accounts.addressOf(ID))),
                "\n"
            )
        );
    }

    function test_claim_registers_a_name_owned_by_the_account() public {
        address account = accounts.addressOf(ID);
        address resolver = registrar.claim("letsbecool9792", ID, _claimSig(KEY, "letsbecool9792", ID));
        (address owner, address r,, uint64 expiry) = registry.entries(keccak256("letsbecool9792"));
        assertEq(owner, account, "name not owned by the account");
        assertEq(r, resolver);
        assertEq(expiry, 2_000_000_000);
        MockPermissionedResolver pr = MockPermissionedResolver(resolver);
        assertEq(pr.defaultAddress(60), abi.encodePacked(account));
        assertEq(pr.defaultAddress(0x80000000 | 84532), abi.encodePacked(account));
        assertEq(pr.defaultAddress(0x80000000 | 421614), abi.encodePacked(account));
        uint256 roles = ResolverRoles.ALL_SETTERS | (ResolverRoles.ALL_SETTERS << 128);
        assertEq(pr.rootRoles(account), roles, "account does not hold the record roles");
        assertEq(pr.rootRoles(address(registrar)), 0, "registrar kept roles");
    }

    function test_claim_sets_github_text_records() public {
        address resolver = registrar.claim("letsbecool9792", ID, _claimSig(KEY, "letsbecool9792", ID));
        MockPermissionedResolver pr = MockPermissionedResolver(resolver);
        assertEq(pr.defaultText("url"), "https://github.com/letsbecool9792");
        assertEq(pr.defaultText("avatar"), "https://github.com/letsbecool9792.png");
        assertEq(pr.defaultText("com.github"), "letsbecool9792");
    }

    function test_cannot_claim_someone_elses_login() public {
        bytes memory sig = _claimSig(KEY, "torvalds", ID);
        vm.expectRevert(NameRegistrar.NotYourLogin.selector);
        registrar.claim("torvalds", ID, sig);
    }

    function test_unlisted_key_cannot_claim() public {
        bytes memory sig = _claimSig(0xE7E, "letsbecool9792", ID);
        vm.expectRevert(NameRegistrar.KeyNotOnProfile.selector);
        registrar.claim("letsbecool9792", ID, sig);
    }

    function test_signature_must_match_the_claim() public {
        bytes memory sig = SshSigBuilder.signP256(KEY, "something else", "sereno@v1");
        vm.expectRevert(NameRegistrar.BadSignature.selector);
        registrar.claim("letsbecool9792", ID, sig);
    }

    function test_name_can_be_claimed_once() public {
        bytes memory sig = _claimSig(KEY, "letsbecool9792", ID);
        registrar.claim("letsbecool9792", ID, sig);
        vm.expectRevert();
        registrar.claim("letsbecool9792", ID, sig);
    }
}
