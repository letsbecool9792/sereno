#!/usr/bin/env bun
// ak: pay and spend with the SSH key already on your GitHub profile.
//
//   ak account <github-user>
//   ak send <amount> <to> --as <github-user> --key <ssh key> [--chain base-sepolia] [--fee 0.02]
//   ak commit-pay <amount> <to> --as <github-user> --key <ssh key> [--repo .] [--push] [--relay]
//   ak claim --as <github-user> --key <ssh key>
//
// <to> is a 0x address or a GitHub username. Amounts are in USDC. The relayer is our hosted one unless
// AK_RELAYER names another (e.g. http://localhost:8788). AK_SSH_KEYGEN picks the ssh-keygen binary (for a phone key on Windows: Win32-OpenSSH 10.x).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, erc20Abi, formatUnits, getAddress, http, isAddress, parseUnits, type Address, type Hex } from "viem";
import {
  accountFactoryAbi,
  buildIntent,
  CHAINS,
  chainByKey,
  CORE,
  DEFAULT_CHAIN,
  ENS_DEPLOYMENT,
  githubKeys,
  githubUser,
  keyHash,
  keyOracleAbi,
  nameRegistrarAbi,
  parseCommitObject,
  SIGNING_NAMESPACE,
  sshAccountAbi,
  type ChainConfig,
  HOSTED_RELAYER_URL,
} from "@sereno/shared";

const RELAYER = process.env.AK_RELAYER ?? HOSTED_RELAYER_URL;
const SSH_KEYGEN = process.env.AK_SSH_KEYGEN ?? "ssh-keygen";
const TOKEN = process.env.GITHUB_TOKEN;
const DECIMALS = 6;

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const opts: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) opts[a.slice(2)] = true;
      else opts[a.slice(2)] = argv[++i]!;
    } else pos.push(a);
  }
  return { pos, opts };
}

const die = (msg: string): never => {
  console.error(`ak: ${msg}`);
  process.exit(1);
};
const need = (v: string | true | undefined, what: string) => (typeof v === "string" ? v : die(`missing ${what}`));

if (!CORE) die("contracts not deployed (run `bun run sync`)");
const core = CORE!;

const client = (c: ChainConfig) => createPublicClient({ chain: c.chain, transport: http(c.rpc, { retryCount: 3 }) });

async function accountOf(c: ChainConfig, githubId: bigint): Promise<Address> {
  return client(c).readContract({ address: core.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [githubId] });
}

async function recipient(c: ChainConfig, to: string): Promise<{ address: Address; label: string }> {
  if (isAddress(to)) return { address: getAddress(to), label: to };
  const u = await githubUser(to, TOKEN);
  return { address: await accountOf(c, u.id), label: `${u.login} (GitHub ${u.id})` };
}

/// Signs `text` with ssh-keygen in our namespace (SHA-256 message hash) and returns the armored signature.
function sshSign(text: string, key: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ak-"));
  try {
    const f = join(dir, "message.txt");
    writeFileSync(f, text);
    const r = spawnSync(SSH_KEYGEN, ["-Y", "sign", "-n", SIGNING_NAMESPACE, "-O", "hashalg=sha256", "-f", resolve(key), f], { stdio: ["inherit", "inherit", "inherit"] });
    if (r.status !== 0) die(`ssh-keygen failed (exit ${r.status})`);
    return readFileSync(`${f}.sig`, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${RELAYER}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json()) as Record<string, string>;
  if (!res.ok) die(`relayer refused: ${out.message}`);
  return out;
}

/// The exact text for the next spend: from the contract when deployed, otherwise built identically offline.
async function nextIntent(c: ChainConfig, githubId: bigint, to: Address, amount: bigint, fee: bigint) {
  const account = await accountOf(c, githubId);
  const pub = client(c);
  const code = await pub.getCode({ address: account });
  const deployed = !!code && code !== "0x";
  const nonce = deployed ? await pub.readContract({ address: account, abi: sshAccountAbi, functionName: "nonce" }) : 0n;
  const text = deployed
    ? Buffer.from((await pub.readContract({ address: account, abi: sshAccountAbi, functionName: "intent", args: [c.usdc, to, amount, fee, nonce] })).slice(2), "hex").toString("utf8")
    : buildIntent({ chainId: c.chain.id, account, githubId, nonce, amount, token: c.usdc, to, fee });
  return { account, text };
}

function showText(what: string, text: string) {
  console.log(`\n${what} (exactly what you sign):\n${text.replace(/^/gm, "  │ ")}`);
}

async function cmdAccount(login: string, c: ChainConfig) {
  const u = await githubUser(login, TOKEN);
  const account = await accountOf(c, u.id);
  const pub = client(c);
  const code = await pub.getCode({ address: account });
  const deployed = !!code && code !== "0x";
  const balance = await pub.readContract({ address: c.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] });
  const nonce = deployed ? await pub.readContract({ address: account, abi: sshAccountAbi, functionName: "nonce" }) : 0n;
  console.log(`${u.login}  GitHub ID ${u.id}`);
  console.log(`account   ${account} on ${c.key} (${deployed ? "deployed" : "not deployed yet; it can already receive"})`);
  console.log(`balance   ${formatUnits(balance, DECIMALS)} USDC   nonce ${nonce}`);
  if (ENS_DEPLOYMENT) console.log(`name      ${u.login.toLowerCase()}.${ENS_DEPLOYMENT.parentName}`);
  console.log("keys on GitHub (auth + signing) -> listed on-chain by the oracle?");
  for (const line of await githubKeys(u.id, TOKEN)) {
    const since = await pub.readContract({ address: core.KeyOracle, abi: keyOracleAbi, functionName: "firstSeen", args: [u.id, keyHash(line)] });
    const [type, , comment] = line.split(" ");
    console.log(`  ${type} ${comment ?? ""} -> ${since > 0n ? `listed since ${new Date(Number(since) * 1000).toISOString()}` : "not yet (run the CRE workflow)"}`);
  }
}

async function cmdSend(pos: string[], opts: Record<string, string | true>, c: ChainConfig, asCommit: boolean) {
  const [amountStr, toStr] = [need(pos[1], "<amount>"), need(pos[2], "<to>")];
  const key = need(opts.key, "--key <ssh key file>");
  const me = await githubUser(need(opts.as, "--as <your GitHub user>"), TOKEN);
  const to = await recipient(c, toStr);
  const amount = parseUnits(amountStr, DECIMALS);
  const fee = parseUnits(typeof opts.fee === "string" ? opts.fee : "0.02", DECIMALS);
  const { account, text } = await nextIntent(c, me.id, to.address, amount, fee);
  console.log(`from ${me.login}'s account ${account} on ${c.key}: ${amountStr} USDC to ${to.label}, relayer fee ${formatUnits(fee, DECIMALS)} USDC`);
  showText(asCommit ? "Commit message" : "Payment", text);

  if (!asCommit) {
    const signature = sshSign(text, key);
    const r = await post("/intent", { chainId: c.chain.id, githubId: me.id.toString(), token: c.usdc, to: to.address, amount: amount.toString(), fee: fee.toString(), signature });
    console.log(`\npaid: ${r.url}`);
    return;
  }

  const repo = resolve(typeof opts.repo === "string" ? opts.repo : ".");
  const dir = mkdtempSync(join(tmpdir(), "ak-"));
  try {
    const msg = join(dir, "message.txt");
    writeFileSync(msg, text);
    const wrapper = join(import.meta.dir, "../bin/sha256-sign.sh").replace(/\\/g, "/");
    const git = (...args: string[]) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
    const r = git("-c", "gpg.format=ssh", "-c", `user.signingkey=${resolve(key)}`, "-c", `gpg.ssh.program=${wrapper}`, "commit", "-S", "--allow-empty", "--cleanup=verbatim", "-F", msg);
    if (r.status !== 0) die("git commit failed");
    const raw = git("cat-file", "commit", "HEAD").stdout;
    const commit = parseCommitObject(raw);
    if (commit.message !== text) die("git changed the commit message; nothing was paid");
    console.log(`\nsigned commit ${git("rev-parse", "--short", "HEAD").stdout.trim()} in ${repo}`);
    if (opts.push) {
      if (git("push").status !== 0) die("git push failed");
      console.log("pushed: a relayer watching this repo pays it (WATCH_REPOS)");
    }
    if (opts.relay) console.log(`paid: ${(await post("/commit", { raw })).url}`);
    if (!opts.push && !opts.relay) console.log("push it (--push) for a watching relayer, or --relay to submit it directly");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cmdClaim(opts: Record<string, string | true>) {
  if (!ENS_DEPLOYMENT) die("ENS not set up");
  const me = await githubUser(need(opts.as, "--as <your GitHub user>"), TOKEN);
  const label = me.login.toLowerCase();
  const pub = client(CHAINS.sepolia);
  const text = Buffer.from(
    (await pub.readContract({ address: ENS_DEPLOYMENT!.nameRegistrar, abi: nameRegistrarAbi, functionName: "claimText", args: [label, me.id] })).slice(2),
    "hex",
  ).toString("utf8");
  showText("Name claim", text);
  const signature = sshSign(text, need(opts.key, "--key <ssh key file>"));
  const r = await post("/claim", { label, githubId: me.id.toString(), signature });
  console.log(`\nclaimed ${label}.${ENS_DEPLOYMENT!.parentName}: ${r.url}`);
  console.log(`see it: https://sepolia.app.ens.domains/${label}.${ENS_DEPLOYMENT!.parentName}`);
}

const { pos, opts } = parseArgs(process.argv.slice(2));
const chain = chainByKey(typeof opts.chain === "string" ? opts.chain : DEFAULT_CHAIN);
switch (pos[0]) {
  case "account":
    await cmdAccount(need(pos[1], "<github-user>"), chain);
    break;
  case "send":
    await cmdSend(pos, opts, chain, false);
    break;
  case "commit-pay":
    await cmdSend(pos, opts, chain, true);
    break;
  case "claim":
    await cmdClaim(opts);
    break;
  default:
    console.log(readFileSync(import.meta.path, "utf8").split("\n").slice(1, 10).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
