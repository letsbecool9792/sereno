#!/usr/bin/env bun
// ak: pay and spend with the SSH key already on your GitHub profile. Runs under Bun (bun cli/src/main.ts) or, bundled
// by cli/scripts/pack.ts, under Node as the npm package `sereno-ak` (npx sereno-ak ...).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, erc20Abi, formatUnits, getAddress, http, isAddress, parseUnits, type Address, type Hex } from "viem";
import {
  accountFactoryAbi,
  bountyBoardAbi,
  buildIntent,
  CHAINS,
  chainByKey,
  CORE,
  DEFAULT_CHAIN,
  ENS_DEPLOYMENT,
  EXTRAS,
  githubKeys,
  githubUser,
  keyHash,
  keyOracleAbi,
  nameRegistrarAbi,
  parseCommitObject,
  SIGNING_NAMESPACE,
  sshAccountAbi,
  type ChainConfig,
  type GithubUser,
  HOSTED_GATEWAY_URL,
  HOSTED_RELAYER_URL,
} from "@sereno/shared";

const USAGE = `ak: pay and spend with the SSH key already on your GitHub profile.

  ak account <github-user> [--chain base-sepolia|arbitrum-sepolia]
  ak send <amount> <to> --as <github-user> --key <ssh key> [--chain ...] [--fee 0.02]
  ak commit-pay <amount> <to> --as <github-user> --key <ssh key> [--repo .] [--push] [--relay]
  ak claim --as <github-user> --key <ssh key>
  ak sync <github-user>          have the Chainlink key oracle copy the user's GitHub SSH keys on-chain
  ak bounty <issue> [--chain ...] [--settle]
                                 an issue bounty (fund it on the pay page); --settle has the Chainlink
                                 workflow check for a merged PR that closed it and pays its author

<to> is a 0x address or a GitHub username. Amounts are in USDC. --key is your SSH private key file
(for example ~/.ssh/id_ed25519; a .pub file works when the key is in ssh-agent).
commit-pay makes a signed commit whose message is the payment; --push pushes it and has the relayer
pay it from GitHub, --relay submits the local commit directly.
Env: GITHUB_TOKEN (ask GitHub directly instead of our gateway), AK_RELAYER, AK_GATEWAY (other hosts),
AK_SSH_KEYGEN (another ssh-keygen, e.g. Win32-OpenSSH 10.x for a phone key on Windows).`;

const RELAYER = process.env.AK_RELAYER ?? HOSTED_RELAYER_URL;
const GATEWAY = process.env.AK_GATEWAY ?? HOSTED_GATEWAY_URL;
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

/// A GitHub user and their SSH keys. Without GITHUB_TOKEN, GitHub allows 60 requests an hour per IP, so ask our gateway
/// first (it has a token and caches), and GitHub directly only with a token or when the gateway is unreachable.
async function profile(login: string): Promise<{ user: GithubUser; keys: string[] }> {
  if (!TOKEN) {
    const res = await fetch(`${GATEWAY}/lookup/${encodeURIComponent(login)}`).catch(() => null);
    if (res?.status === 404) die(`no GitHub user "${login}"`);
    if (res?.ok) {
      const p = (await res.json()) as { login: string; id: string; name: string | null; avatarUrl: string; keys: string[] };
      return { user: { login: p.login, id: BigInt(p.id), name: p.name, avatarUrl: p.avatarUrl }, keys: p.keys };
    }
  }
  const user = await githubUser(login, TOKEN);
  return { user, keys: await githubKeys(user.id, TOKEN) };
}
const userOf = async (login: string) => (await profile(login)).user;

const client = (c: ChainConfig) => createPublicClient({ chain: c.chain, transport: http(c.rpc, { retryCount: 3 }) });

async function accountOf(c: ChainConfig, githubId: bigint): Promise<Address> {
  return client(c).readContract({ address: core.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [githubId] });
}

async function recipient(c: ChainConfig, to: string): Promise<{ address: Address; label: string }> {
  if (isAddress(to)) return { address: getAddress(to), label: to };
  const u = await userOf(to);
  return { address: await accountOf(c, u.id), label: `${u.login} (GitHub ${u.id})` };
}

/// The key file as an absolute path. Expands a leading `~` ourselves: PowerShell passes it through literally, and
/// Windows' ssh-keygen doesn't expand it either.
function keyFile(key: string): string {
  const p = resolve(key.replace(/^~(?=$|[\\/])/, homedir()));
  if (!existsSync(p)) {
    const pub = existsSync(`${p}.pub`) ? "" : " (use the private key file, or its .pub when the key is in ssh-agent)";
    die(`no SSH key file at ${p}${pub}. List yours with: ls ${join(homedir(), ".ssh")}`);
  }
  return p;
}

/// Signs `text` with ssh-keygen in our namespace (SHA-256 message hash) and returns the armored signature.
function sshSign(text: string, key: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ak-"));
  try {
    const f = join(dir, "message.txt");
    writeFileSync(f, text);
    const r = spawnSync(SSH_KEYGEN, ["-Y", "sign", "-n", SIGNING_NAMESPACE, "-O", "hashalg=sha256", "-f", keyFile(key), f], { stdio: ["inherit", "inherit", "inherit"] });
    if (r.error) die(`couldn't run ${SSH_KEYGEN}: ${r.error.message}`);
    if (r.status !== 0) die("ssh-keygen didn't sign (see its message above)");
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

async function nonceOf(c: ChainConfig, account: Address): Promise<bigint> {
  const code = await client(c).getCode({ address: account });
  return code && code !== "0x" ? client(c).readContract({ address: account, abi: sshAccountAbi, functionName: "nonce" }) : 0n;
}
const parseIntentNonce = (text: string) => BigInt(text.match(/^nonce: (\d+)$/m)?.[1] ?? "0");

function showText(what: string, text: string) {
  console.log(`\n${what} (exactly what you sign):\n${text.replace(/^/gm, "  │ ")}`);
}

async function cmdAccount(login: string, c: ChainConfig) {
  const { user: u, keys } = await profile(login);
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
  for (const line of keys) {
    const since = await pub.readContract({ address: core.KeyOracle, abi: keyOracleAbi, functionName: "firstSeen", args: [u.id, keyHash(line)] });
    const [type, , comment] = line.split(" ");
    console.log(`  ${type} ${comment ?? ""} -> ${since > 0n ? `listed since ${new Date(Number(since) * 1000).toISOString()}` : `not yet (ak sync ${u.login})`}`);
  }
}

async function cmdSend(pos: string[], opts: Record<string, string | true>, c: ChainConfig, asCommit: boolean) {
  const [amountStr, toStr] = [need(pos[1], "<amount>"), need(pos[2], "<to>")];
  const key = need(opts.key, "--key <ssh key file>");
  const me = await userOf(need(opts.as, "--as <your GitHub user>"));
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
    // Same relative path from cli/src/main.ts and from the bundled ak.js in the npm package.
    const wrapper = join(dirname(fileURLToPath(import.meta.url)), "../bin/sha256-sign.sh").replace(/\\/g, "/");
    const git = (...args: string[]) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
    const r = git("-c", "gpg.format=ssh", "-c", `user.signingkey=${keyFile(key)}`, "-c", `gpg.ssh.program=${wrapper}`, "commit", "-S", "--allow-empty", "--cleanup=verbatim", "-F", msg);
    if (r.status !== 0) die("git commit failed");
    const raw = git("cat-file", "commit", "HEAD").stdout;
    const commit = parseCommitObject(raw);
    if (commit.message !== text) die("git changed the commit message; nothing was paid");
    console.log(`\nsigned commit ${git("rev-parse", "--short", "HEAD").stdout.trim()} in ${repo}`);
    if (opts.push) {
      if (git("push").status !== 0) die("git push failed");
      const sha = git("rev-parse", "HEAD").stdout.trim();
      const slug = git("remote", "get-url", "origin").stdout.trim().match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1];
      if (!slug) {
        console.log(`pushed ${sha.slice(0, 7)}; origin isn't a GitHub repo, so submit it with --relay`);
        return;
      }
      console.log(`pushed: https://github.com/${slug}/commit/${sha}`);
      // The relayer fetches the commit from GitHub (that's the broadcast). A relayer watching this repo may beat it to it.
      const res = await fetch(`${RELAYER}/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo: slug, sha }) });
      const out = (await res.json()) as Record<string, string>;
      if (res.ok) return console.log(`paid: ${out.url}${out.githubVerified ? " (GitHub shows the commit as Verified)" : ""}`);
      // Refused: maybe because a watching relayer's transaction for the same nonce is already in flight.
      for (let i = 0; i < 6; i++) {
        if ((await nonceOf(c, account)) > parseIntentNonce(text)) return console.log("paid: a relayer watching this repo already submitted it");
        await new Promise((r) => setTimeout(r, 3000));
      }
      die(`relayer refused: ${out.message}`);
    }
    if (opts.relay) console.log(`paid: ${(await post("/commit", { raw })).url}`);
    if (!opts.relay) console.log("push it (--push) or submit it directly (--relay); or paste the pushed commit's link on the pay page's Spend tab");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cmdSync(login: string) {
  let r = await post("/sync", { login });
  // A sync finished moments ago: wait, then run a fresh one (a key deleted since then must be seen).
  while (r.cooldown) {
    console.log(`last sync for ${r.login} was moments ago; syncing again in ${r.cooldown}s`);
    await new Promise((res) => setTimeout(res, (Number(r.cooldown) + 1) * 1000));
    r = await post("/sync", { login });
  }
  console.log(`key sync for ${r.login} (GitHub ${r.githubId}) ${r.state}`);
  for (let i = 0, last = ""; i < 120; i++) {
    const s = (await (await fetch(`${RELAYER}/sync/status/${r.githubId}`)).json()) as Record<string, string>;
    if (s.state !== last) console.log(`  ${(last = s.state!)}${s.detail ? `: ${s.detail}` : ""}`);
    if (s.state === "done") return;
    if (s.state === "failed") die("key sync failed");
    await new Promise((res) => setTimeout(res, 5000));
  }
  die("key sync still pending; check later with `ak account`");
}

async function cmdBounty(ref: string, c: ChainConfig, settle: boolean) {
  if (!EXTRAS) die("the bounty board isn't deployed yet");
  const m = ref.trim().match(/(?:github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\/issues\/|#)(\d+)\/?$/i);
  if (!m) die("expected an issue link (https://github.com/owner/repo/issues/12) or owner/repo#12");
  const [repo, issue] = [m![1]!.toLowerCase(), m![2]!];
  const pub = client(c);
  const board = { address: EXTRAS!.BountyBoard, abi: bountyBoardAbi } as const;
  const show = async () => {
    const repoHash = await pub.readContract({ ...board, functionName: "repoHashOf", args: [repo] });
    const [winner, pot] = await Promise.all([
      pub.readContract({ ...board, functionName: "winnerOf", args: [await pub.readContract({ ...board, functionName: "issueKey", args: [repoHash, BigInt(issue)] })] }),
      pub.readContract({ ...board, functionName: "potOf", args: [await pub.readContract({ ...board, functionName: "potKey", args: [repoHash, BigInt(issue), c.usdc] })] }),
    ]);
    console.log(`${repo}#${issue} on ${c.key}: ${formatUnits(pot, DECIMALS)} USDC unpaid; ${winner === 0n ? "not settled" : `won by GitHub ${winner} (account ${await accountOf(c, winner)})`}`);
  };
  await show();
  if (!settle) return;
  let r = await post("/bounty", { chainId: c.chain.id, repo, issue });
  for (let i = 0, last = ""; i < 120; i++) {
    if (r.state !== last) console.log(`  ${(last = r.state!)}${r.detail ? `: ${r.detail}` : ""}${r.paid ? `: paid ${r.paid}` : ""}`);
    if (r.state === "done") return show();
    if (r.state === "failed") die("the bounty wasn't settled");
    await new Promise((res) => setTimeout(res, 5000));
    r = (await (await fetch(`${RELAYER}/bounty/status?${new URLSearchParams({ chainId: String(c.chain.id), repo, issue })}`)).json()) as Record<string, string>;
  }
  die("still pending; check again later with `ak bounty`");
}

async function cmdClaim(opts: Record<string, string | true>) {
  if (!ENS_DEPLOYMENT) die("ENS not set up");
  const me = await userOf(need(opts.as, "--as <your GitHub user>"));
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

process.on("unhandledRejection", (e) => {
  const msg = (e as Error).message ?? String(e);
  die(/GitHub (403|429)/.test(msg) ? `${msg}: GitHub's rate limit (60 requests an hour without a token). Set GITHUB_TOKEN, or try again later.` : msg.split("\n")[0]!);
});

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
  case "bounty":
    await cmdBounty(need(pos[1], "<issue link or owner/repo#N>"), chain, !!opts.settle);
    break;
  case "sync":
    await cmdSync(need(pos[1], "<github-user>"));
    break;
  default:
    console.log(USAGE);
}
