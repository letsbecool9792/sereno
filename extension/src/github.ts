// Pure helpers for reading GitHub pages: which page we're on, a payment commit's fields, closing references.
// No DOM access here, so it's unit-tested (github.test.ts).
import { type Address, getAddress } from "viem";

export type Page =
  | { kind: "profile"; login: string }
  | { kind: "issue"; repo: string; issue: number }
  | { kind: "pull"; repo: string; pull: number }
  | { kind: "commit"; repo: string; sha: string };

/// GitHub's top-level paths that aren't users (a profile is github.com/<login> with nothing after it).
const RESERVED = new Set(
  "about account apps blog codespaces collections contact copilot customer-stories dashboard enterprise events explore features github-copilot issues login logout marketplace new notifications orgs organizations pricing pulls search security settings site sponsors stars team topics trending users".split(
    " ",
  ),
);

/// The page kind from a github.com path, or null for pages we don't touch.
export function pageOf(pathname: string): Page | null {
  const p = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (p.length === 1 && /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(p[0]!) && !RESERVED.has(p[0]!.toLowerCase())) return { kind: "profile", login: p[0]! };
  if (p.length < 4) return null;
  const repo = `${p[0]}/${p[1]}`.toLowerCase();
  const n = Number(p[3]);
  if (p[2] === "issues" && p.length === 4 && Number.isInteger(n) && n > 0) return { kind: "issue", repo, issue: n };
  if (p[2] === "pull" && Number.isInteger(n) && n > 0) return { kind: "pull", repo, pull: n };
  if (p[2] === "commit" && /^[0-9a-f]{7,40}$/i.test(p[3]!)) return { kind: "commit", repo, sha: p[3]!.toLowerCase() };
  return null;
}

export interface PaymentFields {
  chainId: number;
  account: Address;
  githubId: bigint;
  nonce: bigint;
  amount: bigint;
  token: Address;
  to: Address;
  fee: bigint;
}

/// A Sereno payment's fields from a commit message as GitHub shows it. Whitespace-tolerant: a `.patch` folds the
/// intent's first paragraph into one `Subject:` line, and the page may wrap lines.
export function parsePayment(text: string): PaymentFields | null {
  const m =
    /sereno v1\s+chain:\s+(\d+)\s+account:\s+(0x[0-9a-fA-F]{40})\s+github-id:\s+(\d+)\s+nonce:\s+(\d+)\s+send:\s+(\d+)\s+of\s+(0x[0-9a-fA-F]{40})\s+to:\s+(0x[0-9a-fA-F]{40})\s+relayer-fee:\s+(\d+)/.exec(
      text,
    );
  if (!m) return null;
  return {
    chainId: Number(m[1]),
    account: getAddress(m[2]!),
    githubId: BigInt(m[3]!),
    nonce: BigInt(m[4]!),
    amount: BigInt(m[5]!),
    token: getAddress(m[6]!),
    to: getAddress(m[7]!),
    fee: BigInt(m[8]!),
  };
}

/// The author's login from a `.patch` (only for GitHub noreply addresses: `<id>+<login>@users.noreply.github.com`).
export function patchAuthor(patch: string): string | null {
  const from = /^From: .*<([^>]+)>/m.exec(patch)?.[1] ?? "";
  return /^(?:\d+\+)?([a-z\d](?:[a-z\d-]{0,38}))@users\.noreply\.github\.com$/i.exec(from)?.[1] ?? null;
}

/// Issue numbers a PR body says it closes ("Fixes #12", "closes owner/repo#3" for the same repo), GitHub's keywords.
export function closingRefs(body: string, repo: string): number[] {
  const out = new Set<number>();
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/gi;
  for (const m of body.matchAll(re)) if (!m[1] || m[1].toLowerCase() === repo) out.add(Number(m[2]));
  return [...out];
}

/// Base units (6 decimals) as a short USDC amount: 1500000 → "1.5".
export function usdc(units: bigint): string {
  const whole = units / 1_000_000n;
  const frac = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
