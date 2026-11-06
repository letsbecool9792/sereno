import { describe, expect, test } from "bun:test";
import { buildIntent } from "@sereno/shared";
import { closingRefs, fingerprintOf, pageOf, parsePayment, patchAuthor, usdc } from "./github";

describe("pageOf", () => {
  test("profiles, issues, PRs and commits", () => {
    expect(pageOf("/letsbecool9792")).toEqual({ kind: "profile", login: "letsbecool9792" });
    expect(pageOf("/octocat/")).toEqual({ kind: "profile", login: "octocat" });
    expect(pageOf("/Foundry-RS/Foundry/issues/12")).toEqual({ kind: "issue", repo: "foundry-rs/foundry", issue: 12 });
    expect(pageOf("/o/r/pull/7/files")).toEqual({ kind: "pull", repo: "o/r", pull: 7 });
    expect(pageOf("/o/r/commit/ABCDEF1234")).toEqual({ kind: "commit", repo: "o/r", sha: "abcdef1234" });
  });
  test("ignores GitHub's own pages and everything else", () => {
    expect(pageOf("/settings/keys")).toEqual({ kind: "keys" });
    expect(pageOf("/Foundry-RS/Foundry")).toEqual({ kind: "repo", repo: "foundry-rs/foundry" });
    for (const p of ["/", "/settings", "/settings/profile", "/notifications", "/pulls", "/orgs/x", "/o/r/issues", "/o/r/issues/new", "/o/r/issues/12/edit", "/o/r/commits/main"]) expect(pageOf(p)).toBeNull();
  });
});

describe("parsePayment", () => {
  const p = {
    chainId: 84532,
    account: "0xa82f4ef5f8b3cd8c0b7b0e00d6b1b9e2ee7bd4f8",
    githubId: 99113360n,
    nonce: 3n,
    amount: 1_000_000n,
    token: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    to: "0x0d39a2f0b9fd0b63b1b49ff0ebd1cbb3e5d65809",
    fee: 20_000n,
  } as const;
  const text = buildIntent(p as never);
  test("reads the exact intent text", () => {
    const got = parsePayment(text)!;
    expect(got.nonce).toBe(3n);
    expect(got.amount).toBe(1_000_000n);
    expect(got.to.toLowerCase()).toBe(p.to);
  });
  test("reads it from a .patch, where git folds the first paragraph into the Subject", () => {
    const patch = `From abc Mon Sep 17 00:00:00 2001\nFrom: Suparno <99113360+letsbecool9792@users.noreply.github.com>\nSubject: [PATCH] ${text.trimEnd().split("\n").join("\n ")}\n\n---\n`;
    expect(parsePayment(patch)?.githubId).toBe(99113360n);
    expect(patchAuthor(patch)).toBe("letsbecool9792");
  });
  test("reads GitHub's real .patch, which folds lines right after the colons", () => {
    const real = [
      "From c0461248f27a70f8620af7c97a2ca27af8918705 Mon Sep 17 00:00:00 2001",
      "From: Suparno Saha <99113360+letsbecool9792@users.noreply.github.com>",
      "Date: Fri, 6 Nov 2026 13:14:18 +0530",
      "Subject: [PATCH] sereno v1 chain: 84532 account:",
      " 0xa82f9cff1f2913527276875829fdf42ea200d4f8 github-id: 99113360 nonce: 13",
      " send: 1000000 of 0x036cbd53842c5426634e7929541ec2318f3dcf7e to:",
      " 0x0d392856ac31df1a2e2e2110dc92bb4192185809 relayer-fee: 20000",
      "",
    ].join("\n");
    const got = parsePayment(real)!;
    expect(got.nonce).toBe(13n);
    expect(got.to.toLowerCase()).toBe("0x0d392856ac31df1a2e2e2110dc92bb4192185809");
    expect(got.fee).toBe(20_000n);
  });
  test("ignores ordinary commits", () => {
    expect(parsePayment("Fix the build\n\nsereno v1 mentioned in passing")).toBeNull();
  });
});

test("patchAuthor only trusts GitHub noreply addresses", () => {
  expect(patchAuthor("From: A <octocat@users.noreply.github.com>")).toBe("octocat");
  expect(patchAuthor("From: A <someone@example.com>")).toBeNull();
});

test("closingRefs: GitHub's keywords, same repo only", () => {
  expect(closingRefs("Fixes #12. Also closes o/r#3, resolves other/repo#9, and mentions #4.", "o/r")).toEqual([12, 3]);
  expect(closingRefs("Resolved: #5", "o/r")).toEqual([5]);
});

test("usdc", () => {
  expect(usdc(1_500_000n)).toBe("1.5");
  expect(usdc(20_000n)).toBe("0.02");
  expect(usdc(5_000_000n)).toBe("5");
});

test("fingerprintOf matches ssh-keygen -l", async () => {
  // ssh-keygen -lf of this key prints SHA256:2NrTiNMgVf5ADXKD7I2PU7dvXhJwyStTYYW+X2XfDlI
  const line = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl test";
  expect(await fingerprintOf(line)).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
});
