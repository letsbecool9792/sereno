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
}

interface IPermissionedResolver {
    function initialize(Grant[] calldata grants, bytes[] calldata calls) external;
    /// `name` is DNS-encoded; 0x00 is the default record, used by every name without its own record.
    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external;
}

library RegistryRoles {
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
