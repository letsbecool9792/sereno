import { describe, expect, test } from "bun:test";
import { MoveLog, movedMessage, QUARANTINE_MS } from "./moves";

const DAY = 24 * 60 * 60 * 1000;
const t0 = Date.UTC(2026, 10, 6);

describe("name quarantine after a change of owner", () => {
  test("a login that moved to someone else is quarantined for 15 days", () => {
    const log = new MoveLog();
    log.note("alice", 1n, t0);
    expect(log.active("alice", 2n, t0 + DAY)).toEqual({ fromId: 1n, since: t0, until: t0 + 15 * DAY });
    expect(log.active("alice", 2n, t0 + 15 * DAY - 1)).not.toBeNull();
    expect(log.active("alice", 2n, t0 + 15 * DAY)).toBeNull();
    expect(QUARANTINE_MS).toBe(15 * DAY);
  });

  test("the previous owner renaming back is not quarantined", () => {
    const log = new MoveLog();
    log.note("alice", 1n, t0);
    expect(log.active("alice", 1n, t0 + DAY)).toBeNull();
  });

  test("seeing the same change again keeps the first time", () => {
    const log = new MoveLog();
    expect(log.note("alice", 1n, t0)).toBe(true);
    expect(log.note("alice", 1n, t0 + 10 * DAY)).toBe(false);
    expect(log.active("alice", 2n, t0 + 15 * DAY)).toBeNull();
  });

  test("other logins are unaffected", () => {
    const log = new MoveLog();
    log.note("alice", 1n, t0);
    expect(log.active("bob", 2n, t0)).toBeNull();
  });

  test("the message says who had the name and until when it is blocked", () => {
    const m = { fromId: 1n, since: t0, until: t0 + 15 * DAY };
    expect(movedMessage("alice.sereno.eth", m, "bob")).toBe(
      "alice.sereno.eth changed owner on 2026-11-06; the previous owner is now @bob. To protect payers who still use the old name, it won't resolve until 2026-11-21. Check the person's current GitHub username before paying.",
    );
    expect(movedMessage("alice.sereno.eth", m, null)).toContain("(GitHub user #1 had it before)");
  });
});
