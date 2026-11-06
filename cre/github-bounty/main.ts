// GitHub issue bounties. On request, every node asks GitHub whether a merged PR closed `owner/repo#issue` and who
// wrote it (numeric ID), and the nodes must agree. If so, the signed report (repoHash, issue, authorGithubId) goes to
// the ReportGate, which routes it to BountyBoard; the board pays the pot to the author's SshAccount.
//
// Trigger: 0 = HTTP, body {"repo": "owner/repo", "issue": "12"}.
import {
  bytesToHex,
  consensusIdenticalAggregation,
  decodeJson,
  EVMClient,
  getNetwork,
  handler,
  hexToBase64,
  HTTPCapability,
  HTTPClient,
  type HTTPPayload,
  type NodeRuntime,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";
import { stringToHex } from "viem";
import { bountyReport, CLOSER_QUERY, type CloserResponse, closerVariables, decide, parseRequest, type BountyRequest, type Verdict } from "./bounty";

export type Config = {
  chainName: string;
  /// The ReportGate (contracts/src/ReportGate.sol), which checks the broadcaster and workflow, then calls BountyBoard.
  receiver: string;
  gasLimit: string;
  /// CRE secret id holding a GitHub token. Required: GitHub's GraphQL API refuses anonymous requests.
  githubTokenSecret: string;
  /// EVM addresses allowed to call the HTTP trigger once deployed (simulation accepts any caller).
  httpAuthorizedKeys?: string[];
};

// Runs on each node; the JSON string must come out identical on every node for consensus.
const checkIssue = (nodeRuntime: NodeRuntime<Config>, repo: string, issue: number, token: string): string => {
  const resp = new HTTPClient()
    .sendRequest(nodeRuntime, {
      url: "https://api.github.com/graphql",
      method: "POST",
      headers: { "User-Agent": "sereno-cre", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: hexToBase64(stringToHex(JSON.stringify({ query: CLOSER_QUERY, variables: closerVariables({ repo, issue }) }))),
    })
    .result();
  if (resp.statusCode !== 200) throw new Error(`GitHub GraphQL ${resp.statusCode}`);
  return JSON.stringify(decide(JSON.parse(new TextDecoder().decode(resp.body)) as CloserResponse));
};

export const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  const cfg = runtime.config;
  const req: BountyRequest = parseRequest(decodeJson(payload.input));
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainName });
  if (!network) throw new Error(`unknown chain ${cfg.chainName}`);
  // Secrets are read in DON mode and passed into the node function; the token never enters a report.
  const token = runtime.getSecret({ id: cfg.githubTokenSecret }).result().value;
  if (!token) throw new Error(`secret ${cfg.githubTokenSecret} is empty; GitHub's GraphQL API needs a token`);

  const agreed = runtime.runInNodeMode(checkIssue, consensusIdenticalAggregation<string>())(req.repo, req.issue, token).result();
  const verdict = JSON.parse(agreed) as Verdict;
  if (!verdict.pay) {
    runtime.log(`${req.repo}#${req.issue}: no payout, ${verdict.reason}`);
    return `skipped: ${verdict.reason}`;
  }
  const encoded = bountyReport(req, verdict.authorGithubId);
  runtime.log(`${req.repo}#${req.issue}: closed by merged PR #${verdict.pr} from ${verdict.author} (GitHub ${verdict.authorGithubId})`);
  runtime.log(`  report ${encoded}`);

  const report = runtime
    .report({ encodedPayload: hexToBase64(encoded), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result();
  const reply = new EVMClient(network.chainSelector.selector)
    .writeReport(runtime, { receiver: cfg.receiver, report, gasConfig: { gasLimit: cfg.gasLimit } })
    .result();
  const tx = reply.txHash ? bytesToHex(reply.txHash) : "none";
  runtime.log(`  wrote to ${cfg.chainName}: status ${reply.txStatus}, tx ${tx}${reply.errorMessage ? `, error ${reply.errorMessage}` : ""}`);
  return tx;
};

export const initWorkflow = (config: Config) => {
  const http = new HTTPCapability();
  const authorizedKeys = (config.httpAuthorizedKeys ?? []).map((publicKey) => ({ type: "KEY_TYPE_ECDSA_EVM" as const, publicKey }));
  return [handler(http.trigger({ authorizedKeys }), onHttpTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
