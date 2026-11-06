// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// The parts of ENSv2 we call (ensdomains/contracts-v2, tag v2-mainnet-deployment-1 = the live Sepolia deployment;
// `main` has different ABIs). Addresses: docs.ens.domains/learn/deployments.

struct Grant {
    address account;
    uint256 roleBitmap;
}

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address);
}

/// UserRegistry / PermissionedRegistry
interface IENSv2Registry {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);
    /// Requires ROLE_UNREGISTER on the name or on the registry root. `anyId` may be the labelhash. Afterwards the label
    /// is expired, so it can be registered again.
    function unregister(uint256 anyId) external;
    /// The name's owner, or address(0) if it is unregistered, reserved or expired. `anyId` may be the labelhash.
    function getOwner(uint256 anyId) external view returns (address);
}

interface IPermissionedResolver {
    function initialize(Grant[] calldata grants, bytes[] calldata calls) external;
    /// `name` is DNS-encoded; 0x00 is the default record, used by every name without its own record.
    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external;
    function setText(bytes calldata name, string calldata key, string calldata value) external;
}

library RegistryRoles {
    uint256 internal constant REGISTRAR = 1 << 0;
    uint256 internal constant UNREGISTER = 1 << 12;
    uint256 internal constant SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant SET_RESOLVER = 1 << 24;
    uint256 internal constant CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 internal constant ADMIN_SHIFT = 128;
}

library ResolverRoles {
    // ADDRESS, TEXT, CONTENTHASH, ABI, INTERFACE, NAME, DATA, LINK (bits 0..28 step 4) and UPGRADE (bit 124)
    uint256 internal constant ALL_SETTERS =
        (1 << 0) | (1 << 4) | (1 << 8) | (1 << 12) | (1 << 16) | (1 << 20) | (1 << 24) | (1 << 28) | (1 << 124);
    uint256 internal constant ADMIN_SHIFT = 128;
}
