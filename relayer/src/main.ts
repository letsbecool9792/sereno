// Relayer HTTP service plus a watcher that relays payment commits pushed to the watched GitHub repos.
//
//   [RELAYER_KEY=0x...] [WATCH_REPOS=owner/repo,...] [GITHUB_TOKEN=...] [PORT=8788] bun src/main.ts
//   RELAYER_KEY defaults to .secrets/relayer.key, then .secrets/deployer.key.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress, type Hex } from "viem";
import { githubGet, parseCommitObject, parseIntent } from "@sereno/shared";
import { commitFromGithub, makeRelayer, RelayError } from "./relay";
import { makeSyncQueue } from "./sync";

const secret = (n: string) => {
  const p = join(import.meta.dir, "../../.secrets", `${n}.key`);
  return existsSync(p) ? readFileSync(p, "utf8").trim() : "";
};
const key = (process.env.RELAYER_KEY ?? (secret("relayer") || secret("deployer"))) as Hex;
if (!key) throw new Error("set RELAYER_KEY");
const relayer = makeRelayer(key.startsWith("0x") ? key : (`0x${key}` as Hex));
const token = process.env.GITHUB_TOKEN;

const sync = makeSyncQueue(process.env.SYNC_WORKER_TOKEN || undefined, token);

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const json = (body: unknown, status = 200) =>
  Response.json(JSON.parse(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v))), { status, headers: cors });
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (url.pathname === "/health") return json({ ok: true, relayer: relayer.address, watching: watched, keySync: sync.enabled, syncWorkerAge: sync.workerAge() });
  try {
    if (req.method === "GET" && url.pathname.startsWith("/sync/status/")) return json(sync.status(url.pathname.slice("/sync/status/".length)));
    if (req.method === "GET" && url.pathname === "/sync/next") return json(sync.next(req));
    if (req.method !== "POST") return json({ message: "not found" }, 404);
    const body = (await req.json()) as Record<string, string>;
    if (url.pathname === "/sync") {
      const r = await sync.request(body.login!);
      log(`sync requested for ${r.login} (${r.githubId}): ${r.state}`);
      return json(r);
    }
    if (url.pathname === "/sync/done") {
      const r = sync.done(req, body as { githubId?: string; ok?: boolean; detail?: string });
      log(`sync ${r.login} (${r.githubId}): ${r.state}${r.detail ? ` ${r.detail}` : ""}`);
      return json(r);
    }
    if (url.pathname === "/intent") {
      const r = await relayer.intent({
        chainId: Number(body.chainId),
        githubId: BigInt(body.githubId!),
        token: getAddress(body.token!),
        to: getAddress(body.to!),
        amount: BigInt(body.amount!),
        fee: BigInt(body.fee ?? "0"),
        signature: body.signature!,
      });
      log(`intent ${body.githubId} -> ${r.url}`);
      return json(r);
    }
    if (url.pathname === "/commit") {
      const { commit, githubVerified } = body.raw
        ? { commit: parseCommitObject(body.raw), githubVerified: undefined }
        : await commitFromGithub(body.repo!, body.sha!, token);
      const r = await relayer.commit(commit);
      log(`commit ${body.sha ?? "(raw)"} -> ${r.url}`);
      return json({ ...r, githubVerified });
    }
    if (url.pathname === "/claim") {
      const r = await relayer.claim({ label: body.label!, githubId: BigInt(body.githubId!), signature: body.signature! });
      log(`claim ${body.label} -> ${r.url}`);
      return json(r);
    }
    return json({ message: "not found" }, 404);
  } catch (e) {
    const status = e instanceof RelayError ? e.status : 500;
    log(`${url.pathname} failed (${status}): ${(e as Error).message}`);
    return json({ message: (e as Error).message }, status);
  }
}

// ---- push is the broadcast: watch repos for new payment commits ----
const watched = (process.env.WATCH_REPOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const seen = new Set<string>();
let primed = false;

async function poll() {
  for (const repo of watched) {
    try {
      const list = await githubGet<{ sha: string; commit: { message: string } }[]>(`/repos/${repo}/commits?per_page=10`, token);
      for (const c of list.reverse()) {
        if (seen.has(c.sha)) continue;
        seen.add(c.sha);
        // Commits that existed before the relayer started are history, not new payments.
        if (!primed || !parseIntent(c.commit.message.endsWith("\n") ? c.commit.message : `${c.commit.message}\n`)) continue;
        try {
          const { commit, githubVerified } = await commitFromGithub(repo, c.sha, token);
          const r = await relayer.commit(commit);
          log(`push ${repo}@${c.sha.slice(0, 7)} (GitHub verified: ${githubVerified}) paid: ${r.url}`);
        } catch (e) {
          log(`push ${repo}@${c.sha.slice(0, 7)} not relayed: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      log(`watch ${repo}: ${(e as Error).message}`);
    }
  }
  primed = true;
}

const server = Bun.serve({ port: Number(process.env.PORT ?? 8788), fetch: route });
log(`relayer ${relayer.address} on :${server.port}${watched.length ? `, watching ${watched.join(", ")}` : ""}`);
if (watched.length) {
  await poll();
  setInterval(poll, Number(process.env.POLL_MS ?? 15_000));
}
