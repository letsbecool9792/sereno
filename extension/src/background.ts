// Service worker: forwards the content script's read-only JSON-RPC calls to public RPCs (each chain's main RPC, then
// its fallbacks), so GitHub's page CSP never applies to them. It holds no keys and sends no transactions.
import { CHAINS, HOSTED_RELAYER_URL, type ChainKey } from "@sereno/shared";

type RpcMessage = { type: "rpc"; chain: ChainKey; method: string; params?: unknown };
type Message =
  | RpcMessage
  /// Ask our relayer to submit a pushed payment commit (it reads the commit from GitHub, the contract checks it).
  | { type: "relayCommit"; repo: string; sha: string }
  /// A GitHub ID's current login (for "paid to @login").
  | { type: "login"; id: string };

let id = 0;
async function call(m: RpcMessage): Promise<unknown> {
  const c = CHAINS[m.chain];
  if (!c) throw new Error(`unknown chain ${m.chain}`);
  let last = "no RPC answered";
  for (const url of [c.rpc, ...c.fallbackRpcs]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: m.method, params: m.params ?? [] }),
        signal: AbortSignal.timeout(10_000),
      });
      const j = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (j.error) {
        last = j.error.message ?? "RPC error";
        // A revert is the answer, not an RPC problem; anything else (range limits, rate limits) tries the next RPC.
        if (/revert/i.test(last)) throw Object.assign(new Error(last), { final: true });
        continue;
      }
      return j.result;
    } catch (e) {
      if ((e as { final?: boolean }).final) throw e;
      last = (e as Error).message;
    }
  }
  throw new Error(last);
}

async function relayCommit(repo: string, sha: string): Promise<{ url: string }> {
  const res = await fetch(`${HOSTED_RELAYER_URL}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, sha }),
    signal: AbortSignal.timeout(60_000),
  });
  const out = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !out.url) throw new Error(out.message ?? `relayer answered ${res.status}`);
  return { url: out.url };
}

const logins = new Map<string, string | null>();
async function login(id: string): Promise<string | null> {
  if (!logins.has(id)) {
    const res = await fetch(`https://api.github.com/user/${encodeURIComponent(id)}`, { headers: { Accept: "application/vnd.github+json" } });
    logins.set(id, res.ok ? ((await res.json()) as { login: string }).login : null);
  }
  return logins.get(id) ?? null;
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, reply) => {
  const work =
    msg?.type === "rpc" ? call(msg) : msg?.type === "relayCommit" ? relayCommit(msg.repo, msg.sha) : msg?.type === "login" ? login(msg.id) : null;
  if (!work) return false;
  work.then(
    (result) => reply({ result }),
    (e: Error) => reply({ error: e.message }),
  );
  return true; // reply asynchronously
});
