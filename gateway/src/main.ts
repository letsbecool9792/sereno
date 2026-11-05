// CCIP-read gateway for <github-user>.<parent> (ENS on Sepolia). Every answer is signed with the gateway key that
// the OffchainResolver trusts.
//
//   GATEWAY_KEY=0x... [GITHUB_TOKEN=...] [PORT=8787] [CACHE_FILE=path] bun src/main.ts
//   (GATEWAY_KEY defaults to .secrets/gateway.key; CACHE_FILE keeps username -> ID lookups across restarts)
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { accountFactoryAbi, CHAINS, CORE, DEFAULT_CHAIN, ENS_DEPLOYMENT, githubKeys, githubUser, type GithubUser } from "@sereno/shared";
import { GatewayError, handle, type Lookups } from "./resolve";

if (!CORE || !ENS_DEPLOYMENT) throw new Error("contracts not deployed; run `bun run sync`");
const core = CORE;
const keyFile = join(import.meta.dir, "../../.secrets/gateway.key");
const key = (process.env.GATEWAY_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "")) as Hex;
if (!key) throw new Error("set GATEWAY_KEY (or create .secrets/gateway.key)");
const signer = privateKeyToAccount(key);
if (signer.address !== ENS_DEPLOYMENT.gatewaySigner) console.warn(`warning: ${signer.address} is not the resolver's signer ${ENS_DEPLOYMENT.gatewaySigner}`);

const chain = CHAINS[DEFAULT_CHAIN];
const pub = createPublicClient({ chain: chain.chain, transport: http(chain.rpc, { retryCount: 2 }) });
const ids = new Map<string, { id: bigint | null; at: number }>();
const accounts = new Map<bigint, Address>();

// Username -> ID cache on disk, so a restart doesn't refetch everyone and a GitHub outage still answers known names.
const cacheFile = process.env.CACHE_FILE;
type CacheJson = { ids: Record<string, { id: string | null; at: number }>; accounts: Record<string, Address> };
if (cacheFile && existsSync(cacheFile)) {
  try {
    const c = JSON.parse(readFileSync(cacheFile, "utf8")) as CacheJson;
    for (const [login, v] of Object.entries(c.ids ?? {})) ids.set(login, { id: v.id === null ? null : BigInt(v.id), at: v.at });
    for (const [id, a] of Object.entries(c.accounts ?? {})) accounts.set(BigInt(id), a);
    console.log(`cache: ${ids.size} logins, ${accounts.size} accounts from ${cacheFile}`);
  } catch (e) {
    console.warn(`cache: ignoring unreadable ${cacheFile}: ${(e as Error).message}`);
  }
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  if (!cacheFile || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    const c: CacheJson = { ids: {}, accounts: {} };
    for (const [login, v] of ids) c.ids[login] = { id: v.id === null ? null : v.id.toString(), at: v.at };
    for (const [id, a] of accounts) c.accounts[id.toString()] = a;
    try {
      mkdirSync(dirname(cacheFile), { recursive: true });
      writeFileSync(`${cacheFile}.tmp`, JSON.stringify(c));
      renameSync(`${cacheFile}.tmp`, cacheFile);
    } catch (e) {
      console.warn(`cache: write failed: ${(e as Error).message}`);
    }
  }, 1_000);
}

const lookups: Lookups = {
  async githubId(login) {
    const hit = ids.get(login);
    if (hit && Date.now() - hit.at < (hit.id === null ? 60_000 : 600_000)) return hit.id;
    let id: bigint | null;
    try {
      id = (await githubUser(login, process.env.GITHUB_TOKEN)).id;
    } catch (e) {
      if (!(e as { notFound?: boolean }).notFound) {
        // GitHub is down or rate-limited: a stale answer beats no answer (IDs don't change; renames are rare).
        if (hit) return hit.id;
        throw e;
      }
      id = null;
    }
    ids.set(login, { id, at: Date.now() });
    save();
    return id;
  },
  async accountOf(githubId) {
    let a = accounts.get(githubId);
    if (!a) {
      a = await pub.readContract({ address: core.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [githubId] });
      accounts.set(githubId, a);
      save();
    }
    return a;
  },
};

/// Profile + SSH keys for the pay page, through our token and a short cache (browsers hit GitHub's 60/hour limit fast).
const profiles = new Map<string, { at: number; body: unknown }>();
async function profile(login: string) {
  const hit = profiles.get(login);
  if (hit && Date.now() - hit.at < 60_000) return hit.body;
  const u: GithubUser = await githubUser(login, process.env.GITHUB_TOKEN);
  const body = { login: u.login, id: u.id.toString(), name: u.name, avatarUrl: u.avatarUrl, keys: await githubKeys(u.id, process.env.GITHUB_TOKEN) };
  ids.set(u.login.toLowerCase(), { id: u.id, at: Date.now() });
  save();
  profiles.set(login, { at: Date.now(), body });
  return body;
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8787),
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const lookup = /^\/lookup\/([A-Za-z0-9-]{1,39})$/.exec(url.pathname);
    if (lookup) {
      try {
        return json(await profile(lookup[1]!.toLowerCase()));
      } catch (e) {
        return json({ message: (e as Error).message }, (e as { notFound?: boolean }).notFound ? 404 : 502);
      }
    }
    if (url.pathname === "/health") return json({ ok: true, parent: ENS_DEPLOYMENT!.parentName, signer: signer.address });
    let sender: string | undefined;
    let data: string | undefined;
    const m = /^\/(0x[0-9a-fA-F]{40})\/(0x[0-9a-fA-F]*)(\.json)?$/.exec(url.pathname);
    if (m) [sender, data] = [m[1], m[2]];
    else if (req.method === "POST") ({ sender, data } = (await req.json()) as { sender?: string; data?: string });
    if (!sender || !data) return json({ message: "expected /{sender}/{data}.json" }, 400);
    try {
      const out = await handle(sender as Address, data as Hex, { resolver: ENS_DEPLOYMENT!.resolver, parent: ENS_DEPLOYMENT!.parentName, signer, lookups });
      return json({ data: out });
    } catch (e) {
      const status = e instanceof GatewayError ? e.status : 500;
      console.error(`${new Date().toISOString()} ${status} ${(e as Error).message}`);
      return json({ message: (e as Error).message }, status);
    }
  },
});
console.log(`gateway for *.${ENS_DEPLOYMENT.parentName} on :${server.port}, signer ${signer.address}`);
