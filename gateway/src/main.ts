// CCIP-read gateway for <github-user>.<parent> (ENS on Sepolia). Every answer is signed with the gateway key that
// the OffchainResolver trusts.
//
//   GATEWAY_KEY=0x... [GITHUB_TOKEN=...] [PORT=8787] bun src/main.ts   (GATEWAY_KEY defaults to .secrets/gateway.key)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { accountFactoryAbi, CHAINS, CORE, DEFAULT_CHAIN, ENS_DEPLOYMENT, githubUser } from "@sereno/shared";
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

const lookups: Lookups = {
  async githubId(login) {
    const hit = ids.get(login);
    if (hit && Date.now() - hit.at < (hit.id === null ? 60_000 : 600_000)) return hit.id;
    let id: bigint | null;
    try {
      id = (await githubUser(login, process.env.GITHUB_TOKEN)).id;
    } catch (e) {
      if (!(e as { notFound?: boolean }).notFound) throw e;
      id = null;
    }
    ids.set(login, { id, at: Date.now() });
    return id;
  },
  async accountOf(githubId) {
    let a = accounts.get(githubId);
    if (!a) {
      a = await pub.readContract({ address: core.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [githubId] });
      accounts.set(githubId, a);
    }
    return a;
  },
};

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8787),
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
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
