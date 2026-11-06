import { describe, expect, test } from "bun:test";
import { encodeFunctionData, type Hex } from "viem";
import { bountyBoardAbi } from "@sereno/shared";
import { repoFromFundInput, repoHash, shouldCheck } from "./bounties";

const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const fund = (repo: string, issue: bigint) =>
  encodeFunctionData({ abi: bountyBoardAbi, functionName: "fund", args: [repo, issue, usdc, 1_000_000n, 2_000_000_000n] });

describe("repoFromFundInput", () => {
  test("reads the repo (lowercased) when the hash and issue match the event", () => {
    expect(repoFromFundInput(fund("Letsbecool9792/Sereno-Demo", 3n), repoHash("letsbecool9792/sereno-demo"), 3n)).toBe("letsbecool9792/sereno-demo");
  });
  test("finds a fund call wrapped in a smart wallet's call", () => {
    const inner = fund("a/b", 7n);
    const wrapped = encodeFunctionData({
      abi: [{ type: "function", name: "execute", inputs: [{ type: "address" }, { type: "uint256" }, { type: "bytes" }], outputs: [], stateMutability: "nonpayable" }],
      args: ["0xCfecCbDB71236E27db36Aef2d1Da5bD428d796f3", 0n, inner],
    });
    expect(repoFromFundInput(wrapped, repoHash("a/b"), 7n)).toBe("a/b");
  });
  test("refuses a mismatched issue, a mismatched repo, or another call", () => {
    expect(repoFromFundInput(fund("a/b", 3n), repoHash("a/b"), 4n)).toBeNull();
    expect(repoFromFundInput(fund("a/b", 3n), repoHash("a/c"), 3n)).toBeNull();
    const payout = encodeFunctionData({ abi: bountyBoardAbi, functionName: "payout", args: [repoHash("a/b"), 3n, usdc] });
    expect(repoFromFundInput(payout, repoHash("a/b"), 3n)).toBeNull();
    expect(repoFromFundInput("0x1234" as Hex, repoHash("a/b"), 3n)).toBeNull();
  });
});

describe("shouldCheck", () => {
  const closed = { state: "closed", closed_at: "2026-11-06T15:00:00Z" };
  test("an open issue is never checked", () => {
    expect(shouldCheck({ state: "open", closed_at: null }, undefined, 0)).toBe(false);
  });
  test("a newly closed issue is checked at once", () => {
    expect(shouldCheck(closed, undefined, 0)).toBe(true);
  });
  test("the same close is retried once, after two minutes", () => {
    const t = 1_000_000;
    expect(shouldCheck(closed, { closedAt: closed.closed_at, tries: 1, at: t }, t + 60_000)).toBe(false);
    expect(shouldCheck(closed, { closedAt: closed.closed_at, tries: 1, at: t }, t + 120_000)).toBe(true);
    expect(shouldCheck(closed, { closedAt: closed.closed_at, tries: 2, at: t }, t + 600_000)).toBe(false);
  });
  test("a new close (after a reopen) starts over", () => {
    expect(shouldCheck({ state: "closed", closed_at: "2026-11-06T16:00:00Z" }, { closedAt: closed.closed_at, tries: 2, at: 0 }, 1)).toBe(true);
  });
});
