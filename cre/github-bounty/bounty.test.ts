import { describe, expect, test } from "bun:test";
import { decodeAbiParameters, keccak256, parseAbiParameters, stringToBytes } from "viem";
import { bountyReport, type CloserResponse, closerVariables, decide, parseRequest } from "./bounty";

type Closer = Record<string, unknown> | null;
const answer = (closer: Closer, state = "CLOSED", repo = "foundry-rs/foundry"): CloserResponse =>
  ({ data: { repository: { nameWithOwner: repo, issue: { state, timelineItems: { nodes: [{ closer }] } } } } }) as CloserResponse;
// GitHub's real answer for foundry-rs/foundry#18130 (closed by merged PR #18131).
const mergedPr = {
  __typename: "PullRequest",
  number: 18131,
  merged: true,
  repository: { nameWithOwner: "foundry-rs/foundry" },
  author: { __typename: "User", login: "stevencartavia", databaseId: 112043913 },
};

describe("parseRequest", () => {
  test("lowercases the repo and accepts the issue as a string or number", () => {
    expect(parseRequest({ repo: "Foundry-RS/Foundry", issue: "18130" })).toEqual({ repo: "foundry-rs/foundry", issue: 18130 });
    expect(parseRequest({ repo: "a/b.c_d-e", issue: 7 })).toEqual({ repo: "a/b.c_d-e", issue: 7 });
  });
  test("refuses anything else", () => {
    for (const body of [{}, { repo: "foundry", issue: "1" }, { repo: "a/b", issue: "0" }, { repo: "a/b", issue: "1e3" }, { repo: "a/b/c", issue: "1" }, { repo: "a/b", issue: "2147483648" }, null]) {
      expect(() => parseRequest(body)).toThrow();
    }
  });
  test("splits into GraphQL variables", () => {
    expect(closerVariables({ repo: "foundry-rs/foundry", issue: 18130 })).toEqual({ owner: "foundry-rs", name: "foundry", number: 18130 });
  });
});

describe("decide", () => {
  test("pays the author of the merged PR that closed the issue", () => {
    expect(decide(answer(mergedPr))).toEqual({ pay: true, pr: 18131, author: "stevencartavia", authorGithubId: "112043913" });
  });
  test("matches the repo case-insensitively", () => {
    expect(decide(answer({ ...mergedPr, repository: { nameWithOwner: "Foundry-RS/foundry" } })).pay).toBe(true);
  });
  test("no payout for an open issue, a manual close, an unmerged or foreign PR, or a bot author", () => {
    expect(decide(answer(mergedPr, "OPEN"))).toEqual({ pay: false, reason: "the issue is open" });
    expect(decide(answer(null)).pay).toBe(false);
    expect(decide(answer({ __typename: "Commit" })).pay).toBe(false);
    expect(decide(answer({ ...mergedPr, merged: false })).pay).toBe(false);
    expect(decide(answer({ ...mergedPr, repository: { nameWithOwner: "someone/fork" } })).pay).toBe(false);
    expect(decide(answer({ ...mergedPr, author: { __typename: "Bot", login: "dependabot" } })).pay).toBe(false);
    expect(decide(answer({ ...mergedPr, author: null })).pay).toBe(false);
  });
  test("no payout when GitHub says the repo or issue doesn't exist (a PR number is not an issue)", () => {
    const notFound = [{ type: "NOT_FOUND", message: "Could not resolve to an Issue with the number of 1." }];
    expect(decide({ data: { repository: { nameWithOwner: "foundry-rs/foundry", issue: null } }, errors: notFound }).pay).toBe(false);
    expect(decide({ data: { repository: null }, errors: notFound }).pay).toBe(false);
  });
  test("other GitHub errors throw instead of becoming a no", () => {
    expect(() => decide({ data: null, errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] })).toThrow("rate limit");
  });
});

test("the report is what BountyBoard.onReport decodes", () => {
  const [repoHash, issue, author] = decodeAbiParameters(
    parseAbiParameters("bytes32, uint256, uint256"),
    bountyReport({ repo: "Foundry-RS/Foundry", issue: 18130 }, "112043913"),
  );
  expect(repoHash).toBe(keccak256(stringToBytes("foundry-rs/foundry")));
  expect(issue).toBe(18130n);
  expect(author).toBe(112043913n);
});
