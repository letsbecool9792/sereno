// Watches every funded bounty and starts settlement as soon as its issue closes, so a merged "Fixes #N" PR pays its
// author within about a minute, with nobody pressing "settle". The relayer only *starts* the check: the github-bounty
// CRE workflow still decides whether a merged PR in that repo closed the issue, and who wrote it.
//
// Discovery: BountyBoard's Funded event carries only keccak(repo), so the repo string comes from the funding
// transaction's calldata (fund(repo, …), directly or wrapped by a smart wallet). One that can't be read that way
// still settles through POST /bounty.
import { createPublicClient, decodeFunctionData, encodeFunctionData, http, keccak256, parseAbiItem, toBytes, zeroAddress, type Hex } from "viem";
import { bountyBoardAbi, CHAINS, EXTRAS, githubGet, type ChainConfig } from "@sereno/shared";

/// Where the board's logs start on each chain: its deployment on Base (6 Nov), and on Arbitrum two hours earlier.
export const BOUNTY_FROM_BLOCK: Partial<Record<number, bigint>> = { 84532: 55_133_085n, 421614: 326_521_289n };
const LOG_CHUNK = 20_000n; // publicnode serves 50k blocks per eth_getLogs with an address; sepolia.base.org only 200
const RETRY_MS = 2 * 60_000; // a check that didn't settle (e.g. GitHub's timeline lagged) runs once more after this
const MAX_TRIES = 2;

const funded = parseAbiItem(
  "event Funded(bytes32 indexed repoHash, uint256 indexed issue, address indexed token, address funder, uint256 amount, uint64 deadline)",
);

/// keccak256 of the lowercase "owner/repo", as BountyBoard.repoHashOf computes it.
export const repoHash = (repo: string) => keccak256(toBytes(repo.toLowerCase()));

const FUND_SELECTOR = encodeFunctionData({ abi: bountyBoardAbi, functionName: "fund", args: ["", 0n, zeroAddress, 0n, 0n] }).slice(2, 10);

/// The repo from a transaction's input that calls fund(repo, issue, …), directly or nested inside a smart wallet's
/// call (found by its selector), if it matches the event's repoHash and issue.
export function repoFromFundInput(input: Hex, hash: Hex, issue: bigint): string | null {
  const hex = input.slice(2).toLowerCase();
  for (let at = hex.indexOf(FUND_SELECTOR); at >= 0; at = hex.indexOf(FUND_SELECTOR, at + 1)) {
    if (at % 2) continue; // not byte-aligned
    try {
      const call = decodeFunctionData({ abi: bountyBoardAbi, data: `0x${hex.slice(at)}` });
      if (call.functionName !== "fund") continue;
      const [repo, i] = call.args as readonly [string, bigint, ...unknown[]];
      if (i === issue && repoHash(repo) === hash.toLowerCase()) return repo.toLowerCase();
    } catch {
      // a coincidental match; keep looking
    }
  }
  return null;
}

/// Whether to ask the workflow now: the issue is closed, and this close hasn't been checked MAX_TRIES times yet
/// (a new close, after a reopen, starts over).
export function shouldCheck(
  issue: { state: string; closed_at: string | null },
  tried: { closedAt: string; tries: number; at: number } | undefined,
  now: number,
): boolean {
  if (issue.state !== "closed" || !issue.closed_at) return false;
  if (!tried || tried.closedAt !== issue.closed_at) return true;
  return tried.tries < MAX_TRIES && now - tried.at >= RETRY_MS;
}

type Bounty = { chainId: number; repo: string; issue: bigint; tried?: { closedAt: string; tries: number; at: number } };

export function makeBountyWatcher(deps: {
  githubToken: string | undefined;
  /// The board's state for a bounty (winner 0 = unsettled; pot = unpaid USDC).
  state: (chainId: number, repo: string, issue: bigint) => Promise<{ winner: bigint; pot: bigint }>;
  /// Queue the github-bounty workflow (the relayer pays out when the worker reports it settled).
  settle: (chainId: number, repo: string, issue: string) => void;
  /// Pay a pot that is already settled (e.g. topped up after the winner was recorded).
  payout: (chainId: number, repo: string, issue: bigint) => Promise<string | null>;
  log: (msg: string) => void;
}) {
  const chains: ChainConfig[] = Object.values(CHAINS).filter((c) => BOUNTY_FROM_BLOCK[c.chain.id] !== undefined);
  // Logs from the provider with the big range limit (each chain's first fallback is publicnode).
  const logClients = new Map(chains.map((c) => [c.chain.id, createPublicClient({ chain: c.chain, transport: http(c.fallbackRpcs[0], { retryCount: 2 }) })]));
  const next = new Map(chains.map((c) => [c.chain.id, BOUNTY_FROM_BLOCK[c.chain.id]!]));
  const bounties = new Map<string, Bounty>();

  async function discover(c: ChainConfig) {
    const pub = logClients.get(c.chain.id)!;
    const head = await pub.getBlockNumber();
    for (let from = next.get(c.chain.id)!; from <= head; from += LOG_CHUNK) {
      const to = from + LOG_CHUNK - 1n < head ? from + LOG_CHUNK - 1n : head;
      const logs = await pub.getLogs({ address: EXTRAS!.BountyBoard, event: funded, fromBlock: from, toBlock: to });
      for (const l of logs) {
        if (l.args.token?.toLowerCase() !== c.usdc.toLowerCase()) continue; // the relayer pays out USDC pots only
        const key = `${c.chain.id}:${l.args.repoHash}:${l.args.issue}`;
        if (bounties.has(key)) continue;
        const tx = await pub.getTransaction({ hash: l.transactionHash! });
        const repo = repoFromFundInput(tx.input, l.args.repoHash!, l.args.issue!);
        if (!repo) {
          deps.log(`bounty watch: can't read the repo of ${l.transactionHash} on ${c.key} (no fund call in its input)`);
          continue;
        }
        bounties.set(key, { chainId: c.chain.id, repo, issue: l.args.issue! });
        deps.log(`bounty watch: ${repo}#${l.args.issue} on ${c.key}`);
      }
      next.set(c.chain.id, to + 1n);
    }
  }

  async function check(key: string, b: Bounty) {
    const s = await deps.state(b.chainId, b.repo, b.issue);
    if (s.pot === 0n) {
      // Paid out or refunded; a new Funded event brings it back.
      bounties.delete(key);
      return;
    }
    if (s.winner !== 0n) {
      const url = await deps.payout(b.chainId, b.repo, b.issue);
      if (url) deps.log(`bounty ${b.repo}#${b.issue}: paid ${url}`);
      return;
    }
    const issue = await githubGet<{ state: string; closed_at: string | null }>(`/repos/${b.repo}/issues/${b.issue}`, deps.githubToken);
    if (!shouldCheck(issue, b.tried, Date.now())) return;
    b.tried = { closedAt: issue.closed_at!, tries: b.tried?.closedAt === issue.closed_at ? b.tried.tries + 1 : 1, at: Date.now() };
    deps.settle(b.chainId, b.repo, b.issue.toString());
    deps.log(`bounty ${b.repo}#${b.issue}: issue closed ${issue.closed_at}; asking the bounty workflow (try ${b.tried.tries})`);
  }

  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      for (const c of chains) await discover(c).catch((e) => deps.log(`bounty watch ${c.key}: ${(e as Error).message.split("\n")[0]}`));
      for (const [key, b] of bounties) await check(key, b).catch((e) => deps.log(`bounty ${b.repo}#${b.issue}: ${(e as Error).message.split("\n")[0]}`));
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start(intervalMs: number) {
      void tick();
      setInterval(tick, intervalMs);
    },
    watching: () => [...bounties.values()].map((b) => ({ chainId: b.chainId, repo: b.repo, issue: b.issue.toString() })),
  };
}
