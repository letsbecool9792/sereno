// Key sync worker: serves the relayer's on-demand sync queue (POST /sync on the relayer) by running the Chainlink CRE
// workflow `github-keys` (HTTP trigger, one user) with --broadcast on each chain, then reading the oracle back.
//
//   GITHUB_TOKEN=... bun packages/ops/src/sync-worker.ts [--relayer <url>] [--targets base,sepolia,arbitrum] [--once]
//
// Needs: the `cre` CLI logged in (`cre login`, or CRE_API_KEY), CRE_BIN if it isn't on PATH, and .secrets/cre.env (or
// CRE_ENV_FILE) with CRE_ETH_PRIVATE_KEY, an address on the ReportGate broadcaster list. The worker token is
// SYNC_WORKER_TOKEN or .secrets/sync-worker.token, and the relayer must have the same value.
//
// We run this because our workflow runs in CRE *simulation*; deployed to a DON, the workflow's HTTP trigger would take
// these requests itself and no machine of ours would be involved.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http } from "viem";
import { chainByKey, CORE, githubKeys, HOSTED_RELAYER_URL, keyHash, keyOracleAbi, type ChainKey } from "@sereno/shared";

const ROOT = join(import.meta.dir, "../../..");
const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const RELAYER = opt("relayer") ?? process.env.AK_RELAYER ?? HOSTED_RELAYER_URL;
const TARGETS: { target: string; chain: ChainKey }[] = (opt("targets") ?? "base,sepolia,arbitrum").split(",").map((t) => ({
  target: `${t}-settings`,
  chain: ({ base: "base-sepolia", arbitrum: "arbitrum-sepolia", sepolia: "sepolia" } as Record<string, ChainKey>)[t] ?? die(`unknown target ${t}`),
}));
const POLL_MS = Number(process.env.SYNC_POLL_MS ?? 5_000);
const CRE = process.env.CRE_BIN ?? "cre";
const ENV_FILE = process.env.CRE_ENV_FILE ?? join(ROOT, ".secrets/cre.env");
const TOKEN_FILE = join(ROOT, ".secrets/sync-worker.token");
const WORKER_TOKEN = process.env.SYNC_WORKER_TOKEN ?? (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, "utf8").trim() : "");
const GH = process.env.GITHUB_TOKEN;

function die(msg: string): never {
  console.error(`sync-worker: ${msg}`);
  process.exit(1);
}
if (!WORKER_TOKEN) die("set SYNC_WORKER_TOKEN or write .secrets/sync-worker.token (same value as the relayer's)");
if (!existsSync(ENV_FILE)) die(`no ${ENV_FILE}: cre needs CRE_ETH_PRIVATE_KEY from it to broadcast`);
if (!GH) console.warn("sync-worker: no GITHUB_TOKEN; GitHub allows 60 requests an hour without one");
const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
const auth = { Authorization: `Bearer ${WORKER_TOKEN}` };

/// Runs the workflow for one user on one target; resolves with the exit code and the output's tail.
function runCre(target: string, githubId: string): Promise<{ code: number | null; tail: string }> {
  return new Promise((resolve) => {
    const p = spawn(
      CRE,
      ["workflow", "simulate", "github-keys", "--target", target, "--non-interactive", "--trigger-index", "1", "--http-payload", JSON.stringify({ githubId }), "--broadcast", "-e", ENV_FILE],
      { cwd: join(ROOT, "cre"), env: { ...process.env, GITHUB_TOKEN_ALL: process.env.GITHUB_TOKEN_ALL ?? GH ?? "" } },
    );
    let out = "";
    const keep = (b: Buffer) => (out = (out + b.toString()).slice(-4000));
    p.stdout.on("data", keep);
    p.stderr.on("data", keep);
    const timer = setTimeout(() => p.kill(), 5 * 60_000);
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, tail: out });
    });
  });
}

/// Every key on the GitHub profile is listed on this chain's oracle (the forwarder can report success while the
/// receiver failed, so check the state, not the exit code). Retries a little: public RPCs lag.
async function listed(chain: ChainKey, githubId: string, lines: string[]): Promise<boolean> {
  const c = chainByKey(chain);
  const pub = createPublicClient({ chain: c.chain, transport: http(c.rpc, { retryCount: 3 }) });
  for (let i = 0; i < 6; i++) {
    const seen = await Promise.all(
      lines.map((l) => pub.readContract({ address: CORE!.KeyOracle, abi: keyOracleAbi, functionName: "firstSeen", args: [BigInt(githubId), keyHash(l)] })),
    );
    if (seen.every((s) => s > 0n)) return true;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return false;
}

async function syncOne(githubId: string, login: string): Promise<{ ok: boolean; detail: string }> {
  const lines = await githubKeys(BigInt(githubId), GH).catch(() => [] as string[]);
  const results: string[] = [];
  let ok = true;
  for (const { target, chain } of TARGETS) {
    const t0 = Date.now();
    const r = await runCre(target, githubId);
    const good = r.code === 0 && (lines.length === 0 || (await listed(chain, githubId, lines)));
    const secs = Math.round((Date.now() - t0) / 1000);
    log(`  ${login} on ${chain}: ${good ? "synced" : `FAILED (cre exit ${r.code})`} in ${secs}s`);
    if (!good) console.log(r.tail.split("\n").slice(-12).join("\n"));
    results.push(`${chain} ${good ? "ok" : "failed"}`);
    ok &&= good;
  }
  return { ok, detail: `${lines.length} key(s); ${results.join(", ")}` };
}

async function tick() {
  const res = await fetch(`${RELAYER}/sync/next`, { headers: auth });
  if (!res.ok) throw new Error(`relayer /sync/next: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const jobs = (await res.json()) as { githubId: string; login: string }[];
  for (const j of jobs) {
    log(`syncing ${j.login} (${j.githubId}) on ${TARGETS.map((t) => t.chain).join(", ")}`);
    const r = await syncOne(j.githubId, j.login).catch((e) => ({ ok: false, detail: (e as Error).message }));
    await fetch(`${RELAYER}/sync/done`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ githubId: j.githubId, ...r }) });
    log(`${j.login}: ${r.ok ? "done" : "failed"} (${r.detail})`);
  }
}

log(`sync worker for ${RELAYER}: ${TARGETS.map((t) => t.target).join(", ")}; polling every ${POLL_MS / 1000}s`);
do {
  await tick().catch((e) => log(`error: ${(e as Error).message}`));
  if (args.includes("--once")) break;
  await new Promise((r) => setTimeout(r, POLL_MS));
} while (true);
