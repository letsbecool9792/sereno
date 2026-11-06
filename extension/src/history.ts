// Transaction history from chain logs only (EXTENSION_DESIGN.md §6), cached in chrome.storage.local with the last
// block scanned per chain, so each open only fetches new blocks.
import { parseAbiItem, type Address, type Hex } from "viem";
import { CHAINS, EXTRAS, sshAccountAbi, type ChainKey } from "@sereno/shared";
import { loginOfId } from "./api";
import { accountOf, client, executedEvent, HISTORY_FROM, logClient, PAY_CHAINS } from "./chain";
import { getProfile } from "./store";

export type Kind = "sent" | "received" | "bounty" | "escrow-waiting";

export interface Row {
  id: string; // chain:tx:logIndex (or pending:<n>)
  chain: ChainKey;
  kind: Kind;
  amount: string; // USDC base units
  fee?: string;
  counterparty?: Address;
  label?: string; // "@login" when known
  tx?: Hex;
  url?: string;
  block?: string;
  time?: number; // ms
  viaCommit?: boolean;
  keyHash?: Hex;
  status: "submitted" | "confirmed";
  note?: string;
  escrowId?: string;
  deadline?: number;
}

interface Cache {
  githubId: string;
  rows: Row[];
  scanned: Partial<Record<ChainKey, string>>;
  /// Escrow deposits already claimed ("chain:id").
  claimed?: string[];
  /// Counterparty address → "@login" (sereno accounts) or "" (checked, not one).
  names?: Record<string, string>;
}

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const paidEvent = parseAbiItem("event Paid(bytes32 indexed repoHash, uint256 indexed issue, address indexed token, address account, uint256 amount)");
const depositedEvent = parseAbiItem("event Deposited(uint256 indexed id, uint256 indexed githubId, address sender, address token, uint256 amount, uint64 deadline)");
const claimedEvent = parseAbiItem("event Claimed(uint256 indexed id, uint256 indexed githubId, address account, bytes32 keyHash)");
const reclaimedEvent = parseAbiItem("event Reclaimed(uint256 indexed id, address sender)");
const WINDOW = 49_999n;

async function load(githubId: string): Promise<Cache> {
  const c = (await chrome.storage.local.get("history")).history as Cache | undefined;
  return c && c.githubId === githubId ? c : { githubId, rows: [], scanned: {} };
}
const save = (c: Cache) => chrome.storage.local.set({ history: c });

/// A payment just handed to the relayer: shown at once as "submitted", confirmed when its log is scanned.
export async function addPending(r: Omit<Row, "id" | "status" | "time"> & { tx?: Hex }): Promise<void> {
  const p = await getProfile();
  if (!p) return;
  const c = await load(p.githubId);
  c.rows.unshift({ ...r, id: `pending:${Date.now()}`, status: "submitted", time: Date.now() });
  await save(c);
}

let scanning: Promise<Row[]> | null = null;
/// Fetches new logs on both pay chains and returns all rows, newest first.
export function scan(): Promise<Row[]> {
  return (scanning ??= doScan().finally(() => (scanning = null)));
}

async function doScan(): Promise<Row[]> {
  const p = await getProfile();
  if (!p) return [];
  const c = await load(p.githubId);
  const account = p.account.toLowerCase() as Address;
  const id = BigInt(p.githubId);
  for (const key of PAY_CHAINS) {
    const pub = logClient(key);
    const head = await pub.getBlockNumber().catch(() => null);
    if (head === null) continue;
    let from = c.scanned[key] ? BigInt(c.scanned[key]!) + 1n : HISTORY_FROM[key] ?? head - WINDOW;
    const fresh: Row[] = [];
    const windows: [bigint, bigint][] = [];
    for (; from <= head; from += WINDOW + 1n) windows.push([from, from + WINDOW < head ? from + WINDOW : head]);
    // A few windows at a time; publicnode answers each in well under a second.
    for (let i = 0; i < windows.length; i += 4) {
      const batch = await Promise.all(
        windows.slice(i, i + 4).map(async ([fromBlock, toBlock]) => {
          const [sent, received, paid, deposited, claimed] = await Promise.all([
            pub.getLogs({ address: account, event: executedEvent, fromBlock, toBlock }),
            pub.getLogs({ address: CHAINS[key].usdc, event: transferEvent, args: { to: account }, fromBlock, toBlock }),
            EXTRAS ? pub.getLogs({ address: EXTRAS.BountyBoard, event: paidEvent, fromBlock, toBlock }) : [],
            EXTRAS ? pub.getLogs({ address: EXTRAS.Escrow, event: depositedEvent, args: { githubId: id }, fromBlock, toBlock }) : [],
            EXTRAS ? pub.getLogs({ address: EXTRAS.Escrow, event: claimedEvent, args: { githubId: id }, fromBlock, toBlock }) : [],
          ]);
          return { sent, received, paid, deposited, claimed };
        }),
      );
      const url = (tx: Hex) => `${CHAINS[key].explorer}/tx/${tx}`;
      for (const b of batch) {
        const special = new Set<string>(); // txs already shown as a bounty or escrow (don't also show "received")
        for (const l of b.paid) {
          if (l.args.account?.toLowerCase() !== account || l.args.token?.toLowerCase() !== CHAINS[key].usdc.toLowerCase()) continue;
          special.add(l.transactionHash!);
          fresh.push({ id: `${key}:${l.transactionHash}:${l.logIndex}`, chain: key, kind: "bounty", amount: l.args.amount!.toString(), tx: l.transactionHash!, url: url(l.transactionHash!), block: l.blockNumber!.toString(), status: "confirmed", note: `issue #${l.args.issue}` });
        }
        for (const l of b.claimed) {
          special.add(l.transactionHash!);
          (c.claimed ??= []).push(`${key}:${l.args.id}`);
        }
        for (const l of b.deposited) {
          fresh.push({
            id: `${key}:${l.transactionHash}:${l.logIndex}`,
            chain: key,
            kind: "escrow-waiting",
            amount: l.args.amount!.toString(),
            counterparty: l.args.sender,
            tx: l.transactionHash!,
            url: url(l.transactionHash!),
            block: l.blockNumber!.toString(),
            status: "confirmed",
            escrowId: l.args.id!.toString(),
            deadline: Number(l.args.deadline) * 1000,
          });
        }
        for (const l of b.sent) {
          fresh.push({
            id: `${key}:${l.transactionHash}:${l.logIndex}`,
            chain: key,
            kind: "sent",
            amount: l.args.amount!.toString(),
            fee: l.args.fee!.toString(),
            counterparty: l.args.to,
            tx: l.transactionHash!,
            url: url(l.transactionHash!),
            block: l.blockNumber!.toString(),
            status: "confirmed",
            viaCommit: l.args.viaCommit,
            keyHash: l.args.keyHash,
          });
        }
        for (const l of b.received) {
          if (special.has(l.transactionHash!)) continue;
          fresh.push({ id: `${key}:${l.transactionHash}:${l.logIndex}`, chain: key, kind: "received", amount: l.args.value!.toString(), counterparty: l.args.from, tx: l.transactionHash!, url: url(l.transactionHash!), block: l.blockNumber!.toString(), status: "confirmed" });
        }
      }
      c.scanned[key] = windows[Math.min(i + 3, windows.length - 1)]![1].toString();
    }
    // Block times for the new rows (one call per block).
    const blocks = [...new Set(fresh.map((r) => r.block!))];
    const times = new Map(await Promise.all(blocks.map(async (b) => [b, Number((await pub.getBlock({ blockNumber: BigInt(b) }).catch(() => null))?.timestamp ?? 0n) * 1000] as const)));
    for (const r of fresh) r.time = times.get(r.block!) || undefined;
    // A pending row becomes its confirmed log.
    const seen = new Set(fresh.map((r) => r.tx));
    c.rows = c.rows.filter((r) => !(r.status === "submitted" && r.tx && seen.has(r.tx)));
    const labels = new Map(c.rows.filter((r) => r.label && r.counterparty).map((r) => [r.counterparty!.toLowerCase(), r.label!]));
    for (const r of fresh) if (r.counterparty && !r.label) r.label = labels.get(r.counterparty.toLowerCase());
    c.rows.push(...fresh.filter((r) => !c.rows.some((x) => x.id === r.id)));
  }
  // Escrows: a deposit is waiting until it's claimed or reclaimed.
  const done = new Set(c.claimed ?? []);
  for (const r of c.rows.filter((x) => x.kind === "escrow-waiting" && done.has(`${x.chain}:${x.escrowId}`))) r.kind = "received";
  for (const r of c.rows.filter((x) => x.kind === "escrow-waiting")) {
    if (!EXTRAS) break;
    const reclaimed = await logClient(r.chain)
      .getLogs({ address: EXTRAS.Escrow, event: reclaimedEvent, args: { id: BigInt(r.escrowId!) }, fromBlock: BigInt(r.block!), toBlock: "latest" })
      .catch(() => []);
    if (reclaimed.length) r.note = "reclaimed by the sender";
  }
  // Name counterparties that are sereno accounts: a contract answering githubId() at factory.addressOf(that id).
  const names = (c.names ??= {});
  const unknown = [...new Set(c.rows.filter((r) => r.counterparty && !r.label).map((r) => r.counterparty!.toLowerCase()))].filter((a) => !(a in names)).slice(0, 12);
  await Promise.all(
    unknown.map(async (a) => {
      names[a] = "";
      const code = await client("base-sepolia").getCode({ address: a as Address }).catch(() => undefined);
      if (!code || code === "0x") return;
      const gid = await client("base-sepolia").readContract({ address: a as Address, abi: sshAccountAbi, functionName: "githubId" }).catch(() => null);
      if (gid === null || (await accountOf(gid)).toLowerCase() !== a) return;
      const login = await loginOfId(gid.toString());
      names[a] = login ? `@${login}` : `GitHub #${gid}`;
    }),
  );
  for (const r of c.rows) if (r.counterparty && !r.label && names[r.counterparty.toLowerCase()]) r.label = names[r.counterparty.toLowerCase()];
  c.rows.sort((a, b) => (b.time ?? Date.now()) - (a.time ?? Date.now()));
  await save(c);
  return c.rows;
}

export function csv(rows: Row[]): string {
  const head = "time,chain,kind,amount_usdc,fee_usdc,counterparty,label,tx,status";
  const esc = (v: unknown) => (v === undefined || v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [
    head,
    ...rows.map((r) =>
      [r.time ? new Date(r.time).toISOString() : "", r.chain, r.kind, Number(r.amount) / 1e6, r.fee ? Number(r.fee) / 1e6 : "", r.counterparty, r.label, r.tx, r.status].map(esc).join(","),
    ),
  ].join("\n");
}
