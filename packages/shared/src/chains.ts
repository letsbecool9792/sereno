import type { Address, Chain } from "viem";
import { arbitrumSepolia, baseSepolia, sepolia } from "viem/chains";

export type ChainKey = "base-sepolia" | "arbitrum-sepolia" | "sepolia";

export interface ChainConfig {
  key: ChainKey;
  chain: Chain;
  rpc: string;
  usdc: Address;
  explorer: string;
  /// ENSIP-11 coin type for addresses on this chain (60 = the ENS chain itself).
  coinType: bigint;
  /// Chainlink CRE chain selector name and simulation forwarder.
  creChainName: string;
  creForwarder: Address;
}

export const CHAINS: Record<ChainKey, ChainConfig> = {
  "base-sepolia": {
    key: "base-sepolia",
    chain: baseSepolia,
    rpc: "https://sepolia.base.org",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    explorer: "https://sepolia.basescan.org",
    coinType: 0x80000000n | 84532n,
    creChainName: "ethereum-testnet-sepolia-base-1",
    creForwarder: "0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5",
  },
  "arbitrum-sepolia": {
    key: "arbitrum-sepolia",
    chain: arbitrumSepolia,
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    explorer: "https://sepolia.arbiscan.io",
    coinType: 0x80000000n | 421614n,
    creChainName: "ethereum-testnet-sepolia-arbitrum-1",
    creForwarder: "0xD41263567DdfeAd91504199b8c6c87371e83ca5d",
  },
  sepolia: {
    key: "sepolia",
    chain: sepolia,
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    explorer: "https://sepolia.etherscan.io",
    coinType: 60n,
    creChainName: "ethereum-testnet-sepolia",
    creForwarder: "0x15fC6ae953E024d975e77382eEeC56A9101f9F88",
  },
};

/// Where payments happen by default, and where ENS lives.
export const DEFAULT_CHAIN: ChainKey = "base-sepolia";
export const ENS_CHAIN: ChainKey = "sepolia";

export function chainByKey(key: string): ChainConfig {
  const c = CHAINS[key as ChainKey];
  if (!c) throw new Error(`unknown chain "${key}" (use ${Object.keys(CHAINS).join(", ")})`);
  return c;
}

export function chainById(id: number): ChainConfig {
  const c = Object.values(CHAINS).find((x) => x.chain.id === id);
  if (!c) throw new Error(`unsupported chain id ${id}`);
  return c;
}

/// ENSv2 on Sepolia (docs.ens.domains/learn/deployments; ABIs from contracts-v2 tag v2-mainnet-deployment-1).
export const ENS = {
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  universalResolver: "0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1",
  verifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  permissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
} as const satisfies Record<string, Address>;
