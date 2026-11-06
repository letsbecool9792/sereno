// CCIP-read gateway for <github-user>.<parent> (ENS on Sepolia). Every answer is signed with the gateway key that
// the OffchainResolver trusts.
//
//   GATEWAY_KEY=0x... [GITHUB_TOKEN=...] [PORT=8787] [CACHE_FILE=path] bun src/main.ts
//   (GATEWAY_KEY defaults to .secrets/gateway.key; CACHE_FILE keeps username -> ID lookups and changes of owner
//   across restarts)
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPublicClient, keccak256, toBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  accountFactoryAbi,
  CHAINS,
  CORE,
  DEFAULT_CHAIN,
  ENS_DEPLOYMENT,
  githubGet,
  githubKeys,
  githubUser,
  keyOracleAbi,
  nameRegistrarAbi,
  transportFor,
} from "@sereno/shared";
import { MoveLog, movedMessage, QUARANTINE_MS, type Move } from "./moves";
import { GatewayError, handle, type Lookups } from "./resolve";

if (!CORE || !ENS_DEPLOYMENT) throw new Error("contracts not deployed; run `bun run sync`");
const core = CORE;
const ens = ENS_DEPLOYMENT;
const keyFile = join(import.meta.dir, "../../.secrets/gateway.key");
const key = (process.env.GATEWAY_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "")) as Hex;
if (!key) throw new Error("set GATEWAY_KEY (or create .secrets/gateway.key)");
const signer = privateKeyToAccount(key);
if (signer.address !== ens.gatewaySigner) console.warn(`warning: ${signer.address} is not the resolver's signer ${ens.gatewaySigner}`);

const chain = CHAINS[DEFAULT_CHAIN];
const pub = createPublicClient({ chain: chain.chain, transport: transportFor(chain) });
// The registrar and the oracle it trusts live on Sepolia: on-chain hints that a login changed owner.
const sepolia = createPublicClient({ chain: CHAINS.sepolia.chain, transport: transportFor(CHAINS.sepolia) });
const ids = new Map<string, { id: bigint | null; at: number }>();
const accounts = new Map<bigint, Address>();
const moves = new MoveLog();
/// /lookup answers (profile + keys), kept on disk too so a restart during a GitHub outage still answers known names.
const profiles = new Map<string, { at: number; body: Profile }>();

// Username -> ID cache on disk, so a restart doesn't refetch everyone and a GitHub outage still answers known names.
const cacheFile = process.env.CACHE_FILE;
type CacheJson = {
  ids: Record<string, { id: string | null; at: number }>;
  accounts: Record<string, Address>;
  moves?: Record<string, { fromId: string; at: number }>;
  profiles?: Record<string, { at: number; body: Profile }>;
};
if (cacheFile && existsSync(cacheFile)) {
  try {
    const c = JSON.parse(readFileSync(cacheFile, "utf8")) as CacheJson;
    for (const [login, v] of Object.entries(c.ids ?? {})) ids.set(login, { id: v.id === null ? null : BigInt(v.id), at: v.at });
    for (const [id, a] of Object.entries(c.accounts ?? {})) accounts.set(BigInt(id), a);
    for (const [login, v] of Object.entries(c.moves ?? {})) moves.entries.set(login, { fromId: BigInt(v.fromId), at: v.at });
    for (const [login, v] of Object.entries(c.profiles ?? {})) profiles.set(login, v);
    console.log(`cache: ${ids.size} logins, ${accounts.size} accounts, ${moves.entries.size} changes of owner from ${cacheFile}`);
  } catch (e) {
    console.warn(`cache: ignoring unreadable ${cacheFile}: ${(e as Error).message}`);
  }
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  if (!cacheFile || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    const c: CacheJson = { ids: {}, accounts: {}, moves: {}, profiles: Object.fromEntries(profiles) };
    for (const [login, v] of ids) c.ids[login] = { id: v.id === null ? null : v.id.toString(), at: v.at };
    for (const [id, a] of accounts) c.accounts[id.toString()] = a;
    for (const [login, v] of moves.entries) c.moves![login] = { fromId: v.fromId.toString(), at: v.at };
    try {
      mkdirSync(dirname(cacheFile), { recursive: true });
      writeFileSync(`${cacheFile}.tmp`, JSON.stringify(c));
      renameSync(`${cacheFile}.tmp`, cacheFile);
    } catch (e) {
      console.warn(`cache: write failed: ${(e as Error).message}`);
    }
  }, 1_000);
}

/// Remembers it when a login we knew now belongs to a different ID (or to nobody).
function sawOwner(login: string, previous: { id: bigint | null } | undefined, id: bigint | null) {
  if (previous && previous.id !== null && previous.id !== id && moves.note(login, previous.id, Date.now())) save();
}

/// The quarantine on `login` (now GitHub ID `id`), from what this gateway has seen plus two hints on Sepolia: the key
/// oracle still giving the login to another ID, and the registrar's record of a released claimed name.
const checkedAt = new Map<string, number>();
async function moveOf(login: string, id: bigint): Promise<Move | null> {
  const now = Date.now();
  if (now - (checkedAt.get(login) ?? 0) >= 60_000) {
    checkedAt.set(login, now);
    const [oracleId, q, account] = await Promise.all([
      sepolia
        .readContract({ address: core.KeyOracle, abi: keyOracleAbi, functionName: "idOfLoginHash", args: [keccak256(toBytes(login))] })
        .catch(() => 0n),
      sepolia
        .readContract({ address: ens.nameRegistrar, abi: nameRegistrarAbi, functionName: "quarantineOf", args: [login] })
        .catch(() => null), // registrars before the quarantine don't have it
      lookups.accountOf(id).catch(() => null),
    ]);
    // An RPC that didn't answer: check again on the next request; the moves already recorded still apply below.
    if (account === null) checkedAt.delete(login);
    let changed = oracleId !== 0n && oracleId !== id && moves.note(login, oracleId, now);
    if (q && account && q[0] > 0n && q[1].toLowerCase() !== account.toLowerCase()) {
      changed = moves.note(login, q[2], Number(q[0]) * 1000 - QUARANTINE_MS) || changed;
    }
    if (changed) save();
  }
  return moves.active(login, id, now);
}

/// The previous owner's current username, for the error message.
const loginsById = new Map<bigint, string | null>();
async function loginOf(id: bigint): Promise<string | null> {
  if (id === 0n) return null;
  if (!loginsById.has(id)) {
    const login = await githubGet<{ login: string }>(`/user/${id}`, process.env.GITHUB_TOKEN).then((u) => u.login.toLowerCase(), () => null);
    loginsById.set(id, login);
  }
  return loginsById.get(id) ?? null;
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
    sawOwner(login, hit, id);
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
  async moved(login, githubId) {
    const m = await moveOf(login, githubId);
    return m && movedMessage(`${login}.${ens.parentName}`, m, await loginOf(m.fromId));
  },
};

/// Profile + SSH keys for the pay page, through our token and a short cache (browsers hit GitHub's 60/hour limit fast).
/// A login in quarantine throws with `moved` and `profile` set: /lookup answers 409, so paying refuses by default,
/// while the account's own owner (spending, checking a balance) can still use the profile.
type Profile = { login: string; id: string; name: string | null; avatarUrl: string; keys: string[] };
async function profile(login: string): Promise<Profile> {
  let hit = profiles.get(login);
  if (!hit || Date.now() - hit.at >= 60_000) {
    try {
      const u = await githubUser(login, process.env.GITHUB_TOKEN);
      const keys = await githubKeys(u.id, process.env.GITHUB_TOKEN);
      sawOwner(login, ids.get(login), u.id);
      ids.set(login, { id: u.id, at: Date.now() });
      save();
      hit = { at: Date.now(), body: { login: u.login, id: u.id.toString(), name: u.name, avatarUrl: u.avatarUrl, keys } };
      profiles.set(login, hit);
      save();
    } catch (e) {
      if ((e as { notFound?: boolean }).notFound) {
        profiles.delete(login);
        throw e;
      }
      // GitHub timed out or rate-limited us: the last answer we had beats an error (keys change rarely).
      if (!hit) throw new Error(`GitHub didn't answer for ${login} (${(e as Error).message}); try again`);
      console.warn(`lookup ${login}: GitHub failed (${(e as Error).message}); serving the profile from ${new Date(hit.at).toISOString()}`);
    }
  }
  const m = await moveOf(login, BigInt(hit.body.id));
  if (m) {
    const fromLogin = await loginOf(m.fromId);
    const moved = { fromId: m.fromId.toString(), fromLogin, since: m.since, until: m.until };
    throw Object.assign(new Error(movedMessage(`${login}.${ens.parentName}`, m, fromLogin)), { moved, profile: hit.body });
  }
  return hit.body;
}

/// GitHub reads for the pay page and the extension, through our token and a short cache: browsers share GitHub's
/// 60-requests-an-hour limit per IP (a whole Wi-Fi network), which runs out fast. A GitHub failure serves the last
/// answer when there is one.
const ghCache = new Map<string, { at: number; body: unknown }>();
async function cachedGithub<T>(path: string, ttlMs: number, shape: (raw: any) => T): Promise<T> {
  const hit = ghCache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.body as T;
  try {
    const body = shape(await githubGet(path, process.env.GITHUB_TOKEN));
    ghCache.set(path, { at: Date.now(), body });
    if (ghCache.size > 5000) ghCache.delete(ghCache.keys().next().value!);
    return body;
  } catch (e) {
    if (hit && !(e as { notFound?: boolean }).notFound) return hit.body as T;
    throw e;
  }
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
        const { moved, profile: body } = e as { moved?: unknown; profile?: Profile };
        if (moved) return json({ message: (e as Error).message, moved, profile: body }, 409);
        return json({ message: (e as Error).message }, (e as { notFound?: boolean }).notFound ? 404 : 502);
      }
    }
    // GET /issue/<owner>/<repo>/<n> → {title, state, html_url, pull_request}   (the bounty tab)
    const issue = /^\/issue\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/([1-9][0-9]{0,9})$/.exec(url.pathname);
    if (issue) {
      try {
        return json(
          await cachedGithub(`/repos/${issue[1]}/${issue[2]}/issues/${issue[3]}`, 30_000, (i) => ({ title: i.title, state: i.state, html_url: i.html_url, pull_request: !!i.pull_request })),
        );
      } catch (e) {
        return json({ message: (e as Error).message }, (e as { notFound?: boolean }).notFound ? 404 : 502);
      }
    }
    // GET /user/<numeric id> → {login}   (a bounty winner's or a counterparty's current username)
    const user = /^\/user\/([1-9][0-9]{0,15})$/.exec(url.pathname);
    if (user) {
      try {
        return json(await cachedGithub(`/user/${user[1]}`, 600_000, (u) => ({ login: u.login })));
      } catch (e) {
        return json({ message: (e as Error).message }, (e as { notFound?: boolean }).notFound ? 404 : 502);
      }
    }
    if (url.pathname === "/health") return json({ ok: true, parent: ens.parentName, signer: signer.address });
    let sender: string | undefined;
    let data: string | undefined;
    const m = /^\/(0x[0-9a-fA-F]{40})\/(0x[0-9a-fA-F]*)(\.json)?$/.exec(url.pathname);
    if (m) [sender, data] = [m[1], m[2]];
    else if (req.method === "POST") ({ sender, data } = (await req.json()) as { sender?: string; data?: string });
    if (!sender || !data) return json({ message: "expected /{sender}/{data}.json" }, 400);
    try {
      const out = await handle(sender as Address, data as Hex, { resolver: ens.resolver, parent: ens.parentName, signer, lookups });
      return json({ data: out });
    } catch (e) {
      const status = e instanceof GatewayError ? e.status : 500;
      console.error(`${new Date().toISOString()} ${status} ${(e as Error).message}`);
      return json({ message: (e as Error).message }, status);
    }
  },
});
console.log(`gateway for *.${ens.parentName} on :${server.port}, signer ${signer.address}`);
