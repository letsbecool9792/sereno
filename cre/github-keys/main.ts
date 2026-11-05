// GitHub key oracle. Every node fetches a GitHub user's login, authentication keys and signing keys by numeric ID
// (rename-proof), hashes each key blob, and the nodes must agree on the identical result. The signed report
// (githubId, login, keyHashes) is written to the KeyOracle contract, which accounts read on every spend.
//
// Triggers: 0 = cron, syncs every ID in `githubIds`; 1 = HTTP, syncs one user on demand from `{"githubId": "..."}`
// (the relayer or pay page calls it right before a spend or claim).
import {
  bytesToHex,
  consensusIdenticalAggregation,
  CronCapability,
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
import { encodeAbiParameters, type Hex, keccak256, parseAbiParameters } from "viem";

export type Config = {
  schedule: string;
  githubIds: string[];
  chainName: string;
  oracle: string;
  gasLimit: string;
  /// CRE secret id holding a GitHub token (5,000 requests/hour instead of 60). Optional.
  githubTokenSecret?: string;
  /// EVM addresses allowed to call the HTTP trigger once deployed (simulation accepts any caller).
  httpAuthorizedKeys?: string[];
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// No Buffer in the workflow runtime.
function base64ToHex(s: string): Hex {
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const c of s.replace(/=+$/, "")) {
    const i = B64.indexOf(c);
    if (i < 0) throw new Error("invalid base64");
    acc = ((acc << 6) | i) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += ((acc >> bits) & 0xff).toString(16).padStart(2, "0");
    }
  }
  return `0x${out}`;
}

/// keccak256 of the key blob (the base64 field of an authorized_keys line), the identifier the contracts use.
const keyHash = (authorizedKeysLine: string): Hex => keccak256(base64ToHex(authorizedKeysLine.split(" ")[1] ?? ""));

type Fetched = { login: string; keyHashes: string[] };

// Runs on each node; the JSON string must come out identical on every node for consensus.
const fetchUser = (nodeRuntime: NodeRuntime<Config>, githubId: string, token: string): string => {
  const http = new HTTPClient();
  const headers: Record<string, string> = { "User-Agent": "sereno-cre", Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const get = <T>(path: string): T => {
    const resp = http.sendRequest(nodeRuntime, { url: `https://api.github.com${path}`, method: "GET", headers }).result();
    if (resp.statusCode !== 200) throw new Error(`GitHub ${resp.statusCode} for ${path}`);
    return JSON.parse(new TextDecoder().decode(resp.body)) as T;
  };
  const user = get<{ login: string }>(`/user/${githubId}`);
  const keys = [
    ...get<{ key: string }[]>(`/user/${githubId}/keys`),
    ...get<{ key: string }[]>(`/user/${githubId}/ssh_signing_keys`),
  ];
  const fetched: Fetched = { login: user.login.toLowerCase(), keyHashes: [...new Set(keys.map((k) => keyHash(k.key)))].sort() };
  return JSON.stringify(fetched);
};

/// Fetches one user with node consensus and writes the report to the oracle; returns the transaction hash.
const syncUser = (runtime: Runtime<Config>, id: string): string => {
  const cfg = runtime.config;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainName });
  if (!network) throw new Error(`unknown chain ${cfg.chainName}`);
  const evm = new EVMClient(network.chainSelector.selector);
  // Secrets are read in DON mode and passed into the node function; the token never enters a report.
  const token = cfg.githubTokenSecret ? runtime.getSecret({ id: cfg.githubTokenSecret }).result().value : "";

  const agreed = runtime.runInNodeMode(fetchUser, consensusIdenticalAggregation<string>())(id, token).result();
  const { login, keyHashes } = JSON.parse(agreed) as Fetched;
  runtime.log(`GitHub ${id} (${login}): ${keyHashes.length} key(s)`);

  const report = runtime
    .report({
      encodedPayload: hexToBase64(
        encodeAbiParameters(parseAbiParameters("uint256 githubId, string login, bytes32[] keyHashes"), [
          BigInt(id),
          login,
          keyHashes as Hex[],
        ]),
      ),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();
  const reply = evm.writeReport(runtime, { receiver: cfg.oracle, report, gasConfig: { gasLimit: cfg.gasLimit } }).result();
  const tx = reply.txHash ? bytesToHex(reply.txHash) : "none";
  runtime.log(`  wrote to ${cfg.chainName}: status ${reply.txStatus}, tx ${tx}${reply.errorMessage ? `, error ${reply.errorMessage}` : ""}`);
  return tx;
};

export const onCronTrigger = (runtime: Runtime<Config>): string =>
  runtime.config.githubIds.map((id) => syncUser(runtime, id)).join(",");

/// Body: `{"githubId": "172588240"}` (a decimal string or number).
export const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  const body = decodeJson(payload.input) as { githubId?: unknown };
  const id = String(body?.githubId ?? "");
  if (!/^[1-9][0-9]{0,19}$/.test(id)) throw new Error(`expected {"githubId": "<numeric GitHub id>"}, got ${JSON.stringify(body)}`);
  return syncUser(runtime, id);
};

export const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  const http = new HTTPCapability();
  const authorizedKeys = (config.httpAuthorizedKeys ?? []).map((publicKey) => ({ type: "KEY_TYPE_ECDSA_EVM" as const, publicKey }));
  // The order fixes the trigger indexes: 0 = cron, 1 = HTTP.
  return [
    handler(cron.trigger({ schedule: config.schedule }), onCronTrigger),
    handler(http.trigger({ authorizedKeys }), onHttpTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
