// When a GitHub username changes owner, its name refuses to resolve for a while: a payer who still uses the old name
// gets a loud error instead of silently paying a stranger (like a phone number that isn't reissued straight away).
// NameRegistrar.QUARANTINE is the same 15 days for claimed names.

export const QUARANTINE_MS = 15 * 24 * 60 * 60 * 1000;

/// An active quarantine: the login belonged to GitHub ID `fromId` (0 = unknown) until `since`.
export type Move = { fromId: bigint; since: number; until: number };

export class MoveLog {
  readonly entries = new Map<string, { fromId: bigint; at: number }>();

  /// `login` belonged to `fromId` and, as of `at`, belongs to someone else or to nobody. A change already being
  /// counted keeps its first time.
  note(login: string, fromId: bigint, at: number): boolean {
    if (this.entries.get(login)?.fromId === fromId) return false;
    this.entries.set(login, { fromId, at });
    return true;
  }

  /// The quarantine on `login`, now owned by `currentId`, if one is running. The previous owner coming back (they
  /// renamed back) is never quarantined.
  active(login: string, currentId: bigint, now: number): Move | null {
    const e = this.entries.get(login);
    if (!e || e.fromId === currentId || now >= e.at + QUARANTINE_MS) return null;
    return { fromId: e.fromId, since: e.at, until: e.at + QUARANTINE_MS };
  }
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/// The error a payer sees. `fromLogin` is the previous owner's current username, if known.
export function movedMessage(name: string, m: Move, fromLogin: string | null): string {
  const who = fromLogin ? `; the previous owner is now @${fromLogin}` : m.fromId ? ` (GitHub user #${m.fromId} had it before)` : "";
  return `${name} changed owner on ${day(m.since)}${who}. To protect payers who still use the old name, it won't resolve until ${day(m.until)}. Check the person's current GitHub username before paying.`;
}
