// Chain reads shared by the background worker (direct RPC, with fallbacks) and the content script (JSON-RPC proxied
// through the worker, so GitHub's page CSP never applies). Nothing here signs.
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  parseAbiItem,
  toBytes,
  type Address,
  type Hex,
  type Transport,
} from "viem";
import { accountFactoryAbi, bountyBoardAbi, CHAINS, chainById, CORE, EXTRAS, keyOracleAbi, sshAccountAbi, transportFor, type ChainKey } from "@sereno/shared";

/// Where people pay, and where bounties and escrows live (same addresses on both).
export const PAY_CHAINS: ChainKey[] = ["base-sepolia", "arbitrum-sepolia"];
/// Every chain the key oracle runs on.
export const KEY_CHAINS: ChainKey[] = ["base-sepolia", "arbitrum-sepolia", "sepolia"];
/// History starts here (5 Nov 2026 00:00 UTC, before anything of ours was deployed).
export const HISTORY_FROM: Partial<Record<ChainKey, bigint>> = { "base-sepolia": 54_574_656n, "arbitrum-sepolia": 326_125_647n };

/// The content script proxies JSON-RPC through the background worker.
const viaWorker = (key: ChainKey): Transport =>
  custom({
    async request({ method, params }) {
      const r = (await chrome.runtime.sendMessage({ type: "rpc", chain: key, method, params })) as { result?: unknown; error?: string };
      if (r?.error !== undefined) throw new Error(r.error);
      return r?.result;
    },
  });
let proxied = false;
/// Call once in the content script.
export const useWorkerTransport = () => void (proxied = true);

const make = (key: ChainKey) => createPublicClient({ chain: CHAINS[key].chain, transport: proxied ? viaWorker(key) : transportFor(CHAINS[key]) });
const clients = new Map<ChainKey, ReturnType<typeof make>>();
export const client = (key: ChainKey) => clients.get(key) ?? clients.set(key, make(key)).get(key)!;
/// eth_getLogs over wide ranges: each chain's first fallback is publicnode (50k blocks per query with an address).
const logClients = new Map<ChainKey, ReturnType<typeof make>>();
export const logClient = (key: ChainKey) =>
  logClients.get(key) ??
  logClients
    .set(key, proxied ? make(key) : createPublicClient({ chain: CHAINS[key].chain, transport: transportFor({ ...CHAINS[key], rpc: CHAINS[key].fallbackRpcs[0]!, fallbackRpcs: [CHAINS[key].rpc] }) }))
    .get(key)!;

export const accountOf = (githubId: bigint): Promise<Address> =>
  client("base-sepolia").readContract({ address: CORE!.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [githubId] });

export const usdcBalance = (key: ChainKey, who: Address): Promise<bigint> =>
  client(key).readContract({ address: CHAINS[key].usdc, abi: erc20Abi, functionName: "balanceOf", args: [who] });

/// A GitHub ID's account (the same CREATE2 address on every chain) and its USDC on each pay chain.
export async function account(githubId: bigint): Promise<{ address: Address; balances: { key: ChainKey; units: bigint }[] }> {
  const address = await accountOf(githubId);
  const balances = await Promise.all(PAY_CHAINS.map(async (key) => ({ key, units: await usdcBalance(key, address).catch(() => 0n) })));
  return { address, balances };
}

/// When the oracle first saw this key for this ID on each key chain (0 = not listed there).
export async function keyStatus(githubId: bigint, keyHash: Hex): Promise<{ key: ChainKey; firstSeen: bigint }[]> {
  return Promise.all(
    KEY_CHAINS.map(async (key) => ({
      key,
      firstSeen: await client(key)
        .readContract({ address: CORE!.KeyOracle, abi: keyOracleAbi, functionName: "firstSeen", args: [githubId, keyHash] })
        .catch(() => 0n),
    })),
  );
}

export const keysOf = (key: ChainKey, githubId: bigint): Promise<readonly Hex[]> =>
  client(key).readContract({ address: CORE!.KeyOracle, abi: keyOracleAbi, functionName: "keysOf", args: [githubId] });

/// The account's nonce (0 until it's deployed).
export async function nonceOf(key: ChainKey, accountAddr: Address): Promise<bigint> {
  const code = await client(key).getCode({ address: accountAddr });
  return code && code !== "0x" ? client(key).readContract({ address: accountAddr, abi: sshAccountAbi, functionName: "nonce" }) : 0n;
}

export type Bounty = { key: ChainKey; pot: bigint; winner: bigint };

export const repoHashOf = (repo: string) => keccak256(toBytes(repo.toLowerCase()));

/// The USDC bounty on owner/repo#issue on each pay chain (only chains with a pot or a winner).
export async function bounties(repo: string, issue: number): Promise<Bounty[]> {
  if (!EXTRAS) return [];
  const repoHash = repoHashOf(repo);
  const issueKey = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [repoHash, BigInt(issue)]));
  const board = { address: EXTRAS.BountyBoard, abi: bountyBoardAbi } as const;
  const out = await Promise.all(
    PAY_CHAINS.map(async (key) => {
      const potKey = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "address" }], [repoHash, BigInt(issue), CHAINS[key].usdc]));
      const [pot, winner] = await Promise.all([
        client(key).readContract({ ...board, functionName: "potOf", args: [potKey] }),
        client(key).readContract({ ...board, functionName: "winnerOf", args: [issueKey] }),
      ]);
      return { key, pot, winner };
    }),
  );
  return out.filter((b) => b.pot > 0n || b.winner > 0n);
}

export const executedEvent = parseAbiItem(
  "event Executed(uint256 indexed nonce, address indexed token, address indexed to, uint256 amount, uint256 fee, address relayer, bytes32 keyHash, bool viaCommit)",
);

/// Whether a payment intent went through: its nonce used, and its transaction if found in recent blocks.
export async function paymentStatus(p: { chainId: number; account: Address; nonce: bigint; to: Address; amount: bigint }): Promise<
  { state: "paid"; tx?: Hex } | { state: "other" } | { state: "pending" }
> {
  const key = chainById(p.chainId).key;
  if ((await nonceOf(key, p.account)) <= p.nonce) return { state: "pending" };
  const pub = logClient(key);
  const head = await pub.getBlockNumber();
  const floor = HISTORY_FROM[key] ?? 0n;
  // Newest first, in publicnode-sized windows, up to ~1M blocks back.
  for (let to = head, i = 0; to > floor && i < 20; i++) {
    const from = to - 49_999n > floor ? to - 49_999n : floor;
    const logs = await pub.getLogs({ address: p.account, event: executedEvent, args: { nonce: p.nonce }, fromBlock: from, toBlock: to }).catch(() => []);
    const l = logs[0];
    if (l) return l.args.to?.toLowerCase() === p.to.toLowerCase() && l.args.amount === p.amount ? { state: "paid", tx: l.transactionHash ?? undefined } : { state: "other" };
    to = from - 1n;
  }
  return { state: "paid" };
}
