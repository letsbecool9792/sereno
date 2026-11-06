import { createPublicClient, http } from "viem";
import { CHAINS, githubKeys, githubUser, HOSTED_GATEWAY_URL, HOSTED_RELAYER_URL, type ChainKey, type GithubUser } from "@sereno/shared";

export const PAY_CHAINS: ChainKey[] = ["base-sepolia", "arbitrum-sepolia"];
export const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? HOSTED_GATEWAY_URL;
export const RELAYER = import.meta.env.VITE_RELAYER_URL ?? HOSTED_RELAYER_URL;

/// Profile and SSH keys through our gateway (token + cache); straight from GitHub if the gateway is unreachable.
export async function fetchProfile(login: string): Promise<{ user: GithubUser; keys: string[] }> {
  try {
    const res = await fetch(`${GATEWAY}/lookup/${encodeURIComponent(login)}`);
    if (res.status === 404) throw Object.assign(new Error("not found"), { notFound: true });
    if (res.ok) {
      const p = (await res.json()) as { login: string; id: string; name: string | null; avatarUrl: string; keys: string[] };
      return { user: { login: p.login, id: BigInt(p.id), name: p.name, avatarUrl: p.avatarUrl }, keys: p.keys };
    }
  } catch (e) {
    if ((e as { notFound?: boolean }).notFound) throw e;
  }
  const user = await githubUser(login);
  return { user, keys: await githubKeys(user.id).catch(() => []) };
}

export const clientFor = (key: ChainKey) => createPublicClient({ chain: CHAINS[key].chain, transport: http(CHAINS[key].rpc) });

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/// POST to the relayer; throws with its message on refusal.
export async function relay(path: string, body: unknown): Promise<Record<string, string>> {
  const res = await fetch(`${RELAYER}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({ message: `relayer answered ${res.status}` }))) as Record<string, string>;
  if (!res.ok) throw new Error(out.message ?? `relayer answered ${res.status}`);
  return out;
}

/// "https://github.com/o/r/commit/<sha>", ".../pull/1/commits/<sha>" or "o/r@<sha>" → { repo, sha }.
export function parseCommitLink(s: string): { repo: string; sha: string } | null {
  const t = s.trim();
  const url = t.match(/github\.com\/([\w.-]+\/[\w.-]+)\/(?:pull\/\d+\/)?commits?\/([0-9a-f]{7,40})/i);
  if (url) return { repo: url[1]!, sha: url[2]!.toLowerCase() };
  const at = t.match(/^([\w.-]+\/[\w.-]+)@([0-9a-f]{7,40})$/i);
  return at ? { repo: at[1]!, sha: at[2]!.toLowerCase() } : null;
}
