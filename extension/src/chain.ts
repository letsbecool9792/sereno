// Read-only chain lookups for the content script. JSON-RPC goes through the background worker (background.ts), which
// tries each public RPC in turn; nothing here signs or sends a transaction. Payments happen on the pay page, with
// the visitor's own wallet.
import { createPublicClient, custom, encodeAbiParameters, erc20Abi, keccak256, parseAbiItem, toBytes, type Address, type Hex } from "viem";
import { accountFactoryAbi, bountyBoardAbi, CHAINS, chainById, CORE, EXTRAS, sshAccountAbi, type ChainKey } from "@sereno/shared";

/// Where people pay and bounties live (same addresses on both).
export const PAY_CHAINS: ChainKey[] = ["base-sepolia", "arbitrum-sepolia"];

const clients = new Map<ChainKey, ReturnType<typeof make>>();
const make = (key: ChainKey) =>
  createPublicClient({
    chain: CHAINS[key].chain,
    transport: custom({
      async request({ method, params }) {
        const r = (await chrome.runtime.sendMessage({ type: "rpc", chain: key, method, params })) as { result?: unknown; error?: string };
        if (r?.error !== undefined) throw new Error(r.error);
        return r?.result;
      },
    }),
  });
export const client = (key: ChainKey) => clients.get(key) ?? clients.set(key, make(key)).get(key)!;

/// A GitHub ID's account (the same CREATE2 address on every chain) and its USDC on each pay chain.
export async function account(githubId: bigint): Promise<{ address: Address; balances: { key: ChainKey; units: bigint }[] }> {
  const address = await client("base-sepolia").readContract({ address: CORE!.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [githubId] });
  const balances = await Promise.all(
    PAY_CHAINS.map(async (key) => ({
      key,
      units: await client(key)
        .readContract({ address: CHAINS[key].usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] })
        .catch(() => 0n),
    })),
  );
  return { address, balances };
}

export type Bounty = { key: ChainKey; pot: bigint; winner: bigint };

/// The USDC bounty on owner/repo#issue on each pay chain (only chains with a pot or a winner).
export async function bounties(repo: string, issue: number): Promise<Bounty[]> {
  if (!EXTRAS) return [];
  const repoHash = keccak256(toBytes(repo.toLowerCase()));
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

const executed = parseAbiItem(
  "event Executed(uint256 indexed nonce, address indexed token, address indexed to, uint256 amount, uint256 fee, address relayer, bytes32 keyHash, bool viaCommit)",
);

/// Whether a payment intent went through: its nonce used, and (if the payment is in the last ~50k blocks) its tx.
export async function paymentStatus(p: { chainId: number; account: Address; nonce: bigint; to: Address; amount: bigint }): Promise<
  { state: "paid"; tx?: Hex } | { state: "other" } | { state: "pending" }
> {
  const key = chainById(p.chainId).key;
  const pub = client(key);
  const code = await pub.getCode({ address: p.account });
  const nonce = code && code !== "0x" ? await pub.readContract({ address: p.account, abi: sshAccountAbi, functionName: "nonce" }) : 0n;
  if (nonce <= p.nonce) return { state: "pending" };
  const head = await pub.getBlockNumber();
  const logs = await pub
    .getLogs({ address: p.account, event: executed, args: { nonce: p.nonce }, fromBlock: head > 49_000n ? head - 49_000n : 0n, toBlock: head })
    .catch(() => []);
  const l = logs[0];
  if (!l) return { state: "paid" }; // used, but too long ago to find cheaply
  return l.args.to?.toLowerCase() === p.to.toLowerCase() && l.args.amount === p.amount ? { state: "paid", tx: l.transactionHash ?? undefined } : { state: "other" };
}
