// Demo beat 2:40, revocation: a key deleted on GitHub stops spending after one CRE run.
//
//   GITHUB_TOKEN=... bun run revoke-demo <github-user> --key <ssh key> [--to <0x.. | github-user>] [--amount 0.01]
//                                        [--chain base-sepolia] [--relay http://localhost:8788] [--yes] [--skip-sync]
//
// 1. Signs a spend with --key now, while the oracle still lists it.
// 2. Waits until the key is gone from the user's GitHub profile (delete it at github.com/settings/keys).
// 3. Dry-runs the spend: still accepted, because the oracle hasn't seen the deletion yet.
// 4. Runs the CRE workflow for this one user (HTTP trigger, --broadcast) on the chain.
// 5. Dry-runs (or, with --relay, submits) the same signed spend: rejected with KeyNotOnProfile.
//
// Practise with a throwaway key on a test GitHub account, never someone's real key. Needs the `cre` CLI (CRE_BIN),
// `cre login`, and CRE_ETH_PRIVATE_KEY (a funded testnet key on the ReportGate broadcaster allowlist) in
// .secrets/cre.env or the env file named by CRE_ENV_FILE.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  accountFactoryAbi,
  buildIntent,
  chainByKey,
  CORE,
  DEFAULT_CHAIN,
  githubKeys,
  githubUser,
  keyHash,
  keyOracleAbi,
  SIGNING_NAMESPACE,
  sshAccountAbi,
  unarmor,
} from "@sereno/shared";
import { ROOT } from "./env";

// CRE target per chain (cre/github-keys/workflow.yaml).
const CRE_TARGETS: Record<string, string> = {
  "base-sepolia": "base-settings",
  "arbitrum-sepolia": "arbitrum-settings",
  sepolia: "sepolia-settings",
};

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);
const die = (msg: string): never => {
  console.error(`revoke-demo: ${msg}`);
  process.exit(1);
};

const login = args[0] && !args[0].startsWith("--") ? args[0] : die("usage: revoke-demo <github-user> --key <ssh key>");
const keyArg = opt("key") ?? die("missing --key <ssh key> (the key you will delete on GitHub)");
const c = chainByKey(opt("chain") ?? DEFAULT_CHAIN);
const target = CRE_TARGETS[c.key] ?? die(`no CRE target for ${c.key}`);
const amount = parseUnits(opt("amount") ?? "0.01", 6);
const fee = 0n;
const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN_ALL;
if (!CORE) die("contracts not deployed (run `bun run sync`)");
const core = CORE!;
const pub = createPublicClient({ chain: c.chain, transport: http(c.rpc, { retryCount: 3 }) });

const step = (n: number, s: string) => console.log(`\n\x1b[1m${n}. ${s}\x1b[0m`);
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

// The public key line for --key (a private key file has its .pub next to it).
const pubPath = keyArg.endsWith(".pub") ? keyArg : `${keyArg}.pub`;
if (!existsSync(pubPath)) die(`can't find ${pubPath}`);
const pubLine = readFileSync(pubPath, "utf8").trim();
const demoKey = keyHash(pubLine);

const user = await githubUser(login, token);
const account = await pub.readContract({ address: core.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [user.id] });
const to: Address = await (async () => {
  const t = opt("to");
  if (!t) return account; // paying yourself is enough to show the check
  if (isAddress(t)) return getAddress(t);
  const u = await githubUser(t, token);
  return pub.readContract({ address: core.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [u.id] });
})();
const code = await pub.getCode({ address: account });
const deployed = !!code && code !== "0x";
console.log(`${user.login} (GitHub ${user.id}), account ${account} on ${c.key}${deployed ? "" : " (not deployed)"}`);
console.log(`demo key ${pubLine.split(" ")[0]} ${pubLine.split(" ")[2] ?? ""}  hash ${short(demoKey)}`);

const firstSeen = () =>
  pub.readContract({ address: core.KeyOracle, abi: keyOracleAbi, functionName: "firstSeen", args: [user.id, demoKey] });
const onGithub = async () => (await githubKeys(user.id, token)).some((l) => keyHash(l) === demoKey);

async function showKeys(when: string) {
  const [gh, chain] = await Promise.all([onGithub(), firstSeen()]);
  console.log(`   ${when}: on GitHub ${gh ? "yes" : "no"}, listed on-chain ${chain > 0n ? `yes (since ${new Date(Number(chain) * 1000).toISOString()})` : "no"}`);
  return { gh, chain };
}

/// Signs `text` with ssh-keygen in our namespace and returns the SSHSIG blob.
function sshSign(text: string): Hex {
  const dir = mkdtempSync(join(tmpdir(), "revoke-"));
  try {
    const f = join(dir, "message.txt");
    writeFileSync(f, text);
    const r = spawnSync(process.env.AK_SSH_KEYGEN ?? "ssh-keygen", ["-Y", "sign", "-n", SIGNING_NAMESPACE, "-O", "hashalg=sha256", "-f", resolve(keyArg), f], { stdio: "inherit" });
    if (r.status !== 0) die(`ssh-keygen failed (exit ${r.status})`);
    return unarmor(readFileSync(`${f}.sig`, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/// eth_call of execute(); returns "accepted" or the contract's error name.
async function dryRun(sig: Hex): Promise<string> {
  if (!deployed) return "skipped (account not deployed yet; make one spend first, e.g. `ak send`)";
  try {
    await pub.simulateContract({ address: account, abi: sshAccountAbi, functionName: "execute", args: [c.usdc, to, amount, fee, sig], account: account });
    return "accepted";
  } catch (e) {
    const r = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? r.reason ?? "reverted";
    throw e;
  }
}

step(1, "Sign a spend with the demo key");
const nonce = deployed ? await pub.readContract({ address: account, abi: sshAccountAbi, functionName: "nonce" }) : 0n;
const text = deployed
  ? Buffer.from((await pub.readContract({ address: account, abi: sshAccountAbi, functionName: "intent", args: [c.usdc, to, amount, fee, nonce] })).slice(2), "hex").toString("utf8")
  : buildIntent({ chainId: c.chain.id, account, githubId: user.id, nonce, amount, token: c.usdc, to, fee });
console.log(text.trimEnd().replace(/^/gm, "   │ "));
const sig = sshSign(text);

step(2, "Delete the key on GitHub");
let state = await showKeys("now");
if (state.chain === 0n && !flag("skip-sync")) console.log("   (not listed on-chain yet: run the CRE workflow once before deleting the key, or the demo shows nothing)");
while (state.gh) {
  if (flag("yes")) die("the key is still on GitHub; delete it at https://github.com/settings/keys and run again");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("   delete it at https://github.com/settings/keys (or /settings/ssh signing keys), then press Enter ");
  rl.close();
  state = await showKeys("now");
}

step(3, "Before the oracle runs, the signed spend still passes (needs the USDC in the account)");
console.log(`   execute(): ${await dryRun(sig)}`);

step(4, `CRE workflow syncs ${user.login} on ${c.key}`);
if (flag("skip-sync")) console.log("   skipped (--skip-sync)");
else {
  const cre = process.env.CRE_BIN ?? "cre";
  const payload = JSON.stringify({ githubId: user.id.toString() });
  // cre reads CRE_ETH_PRIVATE_KEY from an env file (default cre/.env, a template placeholder until filled in) and
  // exits 1 without a message if the key there is invalid, so pass our secrets file when there is one.
  const envFile = process.env.CRE_ENV_FILE ?? (existsSync(join(ROOT, ".secrets/cre.env")) ? join(ROOT, ".secrets/cre.env") : undefined);
  const envArgs = envFile ? ["-e", envFile] : [];
  console.log(`   ${cre} workflow simulate github-keys --target ${target} --non-interactive --trigger-index 1 --http-payload '${payload}' --broadcast${envFile ? " -e <env file>" : ""}`);
  const r = spawnSync(cre, ["workflow", "simulate", "github-keys", "--target", target, "--non-interactive", "--trigger-index", "1", "--http-payload", payload, "--broadcast", ...envArgs], {
    cwd: join(ROOT, "cre"),
    stdio: "inherit",
    env: { ...process.env, GITHUB_TOKEN_ALL: process.env.GITHUB_TOKEN_ALL ?? token ?? "" },
  });
  if (r.status !== 0) die(`cre exited with ${r.status}`);
  // Public RPCs are load-balanced; give the write a moment to show up everywhere.
  for (let i = 0; i < 10 && (await firstSeen()) > 0n; i++) await new Promise((res) => setTimeout(res, 2_000));
}
await showKeys("after sync");

step(5, "The same signed spend is now rejected");
const relay = opt("relay");
if (relay) {
  const res = await fetch(`${relay}/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainId: c.chain.id, githubId: user.id.toString(), token: c.usdc, to, amount: amount.toString(), fee: fee.toString(), signature: sig }),
  });
  const out = (await res.json()) as { message?: string; url?: string };
  console.log(`   relayer: ${res.ok ? `paid?! ${out.url}` : `refused: ${out.message}`}`);
} else console.log(`   execute(): ${await dryRun(sig)}`);
