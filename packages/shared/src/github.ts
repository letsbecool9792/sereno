export interface GithubUser {
  id: bigint;
  login: string;
  avatarUrl: string;
  name: string | null;
}

const API = "https://api.github.com";

/// GitHub API GET with a token if provided, retries on network errors (api.github.com times out on some networks).
export async function githubGet<T>(path: string, token?: string, tries = 3): Promise<T> {
  const headers: Record<string, string> = { "User-Agent": "sereno", Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(10_000) });
      if (res.status === 404) throw Object.assign(new Error(`GitHub: ${path} not found`), { notFound: true });
      if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
      return (await res.json()) as T;
    } catch (e) {
      if ((e as { notFound?: boolean }).notFound) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw last;
}

export async function githubUser(login: string, token?: string): Promise<GithubUser> {
  const u = await githubGet<{ id: number; login: string; avatar_url: string; name: string | null }>(
    `/users/${encodeURIComponent(login)}`,
    token,
  );
  return { id: BigInt(u.id), login: u.login, avatarUrl: u.avatar_url, name: u.name };
}

/// Authentication and signing keys (both count), as authorized_keys lines.
export async function githubKeys(githubId: bigint, token?: string): Promise<string[]> {
  const [auth, signing] = await Promise.all([
    githubGet<{ key: string }[]>(`/user/${githubId}/keys`, token),
    githubGet<{ key: string }[]>(`/user/${githubId}/ssh_signing_keys`, token),
  ]);
  return [...new Set([...auth, ...signing].map((k) => k.key))];
}
