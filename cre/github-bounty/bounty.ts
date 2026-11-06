// What the bounty workflow decides, kept free of the CRE SDK so it can be tested with `bun test`.
import { encodeAbiParameters, type Hex, keccak256, parseAbiParameters, stringToBytes } from "viem";

export type BountyRequest = { repo: string; issue: number };

/// The latest close of an issue, and the PR behind it if a PR closed it. GitHub's GraphQL API answers this directly
/// (`ClosedEvent.closer`); REST doesn't say which PR closed an issue.
export const CLOSER_QUERY = `query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    issue(number: $number) {
      state
      timelineItems(itemTypes: [CLOSED_EVENT], last: 1) {
        nodes {
          ... on ClosedEvent {
            closer {
              __typename
              ... on PullRequest { number merged repository { nameWithOwner } author { __typename login ... on User { databaseId } } }
            }
          }
        }
      }
    }
  }
}`;

type Closer = {
  __typename: string;
  number?: number;
  merged?: boolean;
  repository?: { nameWithOwner: string };
  author?: { __typename: string; login: string; databaseId?: number } | null;
};
export type CloserResponse = {
  data?: {
    repository: {
      nameWithOwner: string;
      issue: { state: string; timelineItems: { nodes: { closer?: Closer | null }[] } } | null;
    } | null;
  } | null;
  errors?: { type?: string; message: string }[];
};

/// Identical on every node for the same GitHub answer, so the nodes can agree on it.
export type Verdict =
  | { pay: true; pr: number; author: string; authorGithubId: string }
  | { pay: false; reason: string };

/// Body `{"repo": "owner/repo", "issue": "12"}` (issue as a decimal string or number). The repo is lowercased, as
/// BountyBoard.repoHashOf does.
export function parseRequest(body: unknown): BountyRequest {
  const b = (body ?? {}) as { repo?: unknown; issue?: unknown };
  const repo = String(b.repo ?? "").toLowerCase();
  const issue = String(b.issue ?? "");
  if (!/^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/.test(repo) || !/^[1-9][0-9]{0,9}$/.test(issue) || Number(issue) > 2 ** 31 - 1) {
    throw new Error(`expected {"repo": "owner/repo", "issue": "<number>"}, got ${JSON.stringify(body)}`);
  }
  return { repo, issue: Number(issue) };
}

export const closerVariables = ({ repo, issue }: BountyRequest) => {
  const [owner, name] = repo.split("/") as [string, string];
  return { owner, name, number: issue };
};

/// Pays only when the issue is closed now and its latest close came from a merged PR in the same repo, written by a
/// GitHub user (not a bot or a deleted account). Anything else is a deterministic "no"; GitHub errors other than
/// "not found" throw, so a flaky node can't turn into a "no".
export function decide(res: CloserResponse): Verdict {
  const other = res.errors?.find((e) => e.type !== "NOT_FOUND");
  if (other) throw new Error(`GitHub GraphQL: ${other.message}`);
  const repo = res.data?.repository;
  if (!repo) return { pay: false, reason: "no such repository" };
  const issue = repo.issue;
  if (!issue) return { pay: false, reason: "no such issue (or it is a pull request)" };
  if (issue.state !== "CLOSED") return { pay: false, reason: "the issue is open" };
  const closes = issue.timelineItems.nodes;
  const closer = closes[closes.length - 1]?.closer;
  if (!closer || closer.__typename !== "PullRequest") return { pay: false, reason: "the issue was closed without a pull request" };
  if (!closer.merged) return { pay: false, reason: `PR #${closer.number} is not merged` };
  if (closer.repository?.nameWithOwner.toLowerCase() !== repo.nameWithOwner.toLowerCase()) {
    return { pay: false, reason: `PR #${closer.number} is in another repository (${closer.repository?.nameWithOwner})` };
  }
  const author = closer.author;
  if (!author || author.__typename !== "User" || !author.databaseId) {
    return { pay: false, reason: `PR #${closer.number}'s author is not a GitHub user` };
  }
  return { pay: true, pr: closer.number!, author: author.login.toLowerCase(), authorGithubId: String(author.databaseId) };
}

/// BountyBoard.onReport's report: abi.encode(bytes32 repoHash, uint256 issue, uint256 authorGithubId), with
/// repoHash = keccak256(lowercase "owner/repo").
export const bountyReport = ({ repo, issue }: BountyRequest, authorGithubId: string): Hex =>
  encodeAbiParameters(parseAbiParameters("bytes32 repoHash, uint256 issue, uint256 authorGithubId"), [
    keccak256(stringToBytes(repo.toLowerCase())),
    BigInt(issue),
    BigInt(authorGithubId),
  ]);
