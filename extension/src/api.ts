// Our hosted services (gateway, relayer) and GitHub, from the background worker.
import { HOSTED_GATEWAY_URL, HOSTED_RELAYER_URL } from "@sereno/shared";

export interface GithubProfile {
  login: string;
  id: string;
  name: string | null;
  avatarUrl: string;
  keys: string[];
}

/// Profile and SSH keys (auth + signing) through the gateway (it has a token and a cache). A username that changed
/// owner in the last 15 days fails loudly (409) for payments; `own` still gets the profile (your own account).
export async function lookup(login: string, own = false): Promise<GithubProfile> {
  const res = await fetch(`${HOSTED_GATEWAY_URL}/lookup/${encodeURIComponent(login)}`, { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as GithubProfile & { message?: string; profile?: GithubProfile };
  if (res.status === 404) throw new Error(`No GitHub user "${login}"`);
  if (res.status === 409) {
    if (own && body.profile) return body.profile;
    throw new Error(body.message ?? `${login} changed owner recently; not paying it`);
  }
  if (!res.ok) throw new Error(body.message ?? `The Sereno gateway answered ${res.status}`);
  return body;
}

/// POST to the relayer; throws with its message on refusal.
export async function relay<T = { url: string; tx?: string }>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${HOSTED_RELAYER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });
  const out = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(out.message ?? `The relayer answered ${res.status}`);
  return out;
}

export async function relayGet<T>(path: string): Promise<T> {
  const res = await fetch(`${HOSTED_RELAYER_URL}${path}`, { signal: AbortSignal.timeout(20_000) });
  const out = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(out.message ?? `The relayer answered ${res.status}`);
  return out;
}

const logins = new Map<string, string | null>();
/// A GitHub ID's current login (cached; GitHub's unauthenticated limit is 60 an hour).
export async function loginOfId(id: string): Promise<string | null> {
  if (!logins.has(id)) {
    // Through the gateway (token + cache); GitHub's anonymous limit is shared by the whole network.
    let res = await fetch(`${HOSTED_GATEWAY_URL}/user/${encodeURIComponent(id)}`).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) res = await fetch(`https://api.github.com/user/${encodeURIComponent(id)}`, { headers: { Accept: "application/vnd.github+json" } }).catch(() => null);
    logins.set(id, res?.ok ? ((await res.json()) as { login: string }).login : null);
  }
  return logins.get(id) ?? null;
}
