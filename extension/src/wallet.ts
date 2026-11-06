// Spending from the Sereno account with the browser key: resolve the payee, pre-check, show the exact signed text,
// sign, and hand it to the relayer (which can only submit or refuse: the text fixes recipient, amount and fee).
import { getAddress, hexToBytes, hexToString, isAddress, parseUnits, toHex, type Address, type Hex } from "viem";
import {
  buildClaimText,
  buildIntent,
  CHAINS,
  ENS_DEPLOYMENT,
  EXTRAS,
  escrowAbi,
  INSTANT_LIMIT,
  NEW_KEY_DELAY_SECONDS,
  sshAccountAbi,
  type ChainKey,
} from "@sereno/shared";
import { lookup, relay, relayGet } from "./api";
import { accountOf, client, keyStatus, nonceOf, usdcBalance } from "./chain";
import { addPending } from "./history";
import { armorSig, blobHash, sign, unb64 } from "./sshsig";
import { getProfile, type Profile } from "./store";
import { signer, vaultFile } from "./vault";

export interface Payee {
  address: Address;
  githubId?: string;
  login?: string;
  name?: string | null;
  avatarUrl?: string;
}

const parent = ENS_DEPLOYMENT?.parentName ?? "sereno.eth";

/// "octocat", "@octocat", "github.com/octocat", "octocat.sereno.eth", a GitHub ID ("#583231") or a 0x address.
export async function resolvePayee(input: string): Promise<Payee> {
  const s = input.trim();
  if (isAddress(s)) return { address: getAddress(s) };
  const id = /^#(\d+)$/.exec(s)?.[1];
  if (id) return { address: await accountOf(BigInt(id)), githubId: id };
  let login = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0]!;
  if (login.toLowerCase().endsWith(`.${parent}`)) login = login.slice(0, -(parent.length + 1));
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login)) throw new Error("Enter a GitHub username, name.sereno.eth or 0x address");
  const p = await lookup(login);
  return { address: await accountOf(BigInt(p.id)), githubId: p.id, login: p.login, name: p.name, avatarUrl: p.avatarUrl };
}

export interface Prepared {
  chain: ChainKey;
  payee: Payee;
  token: Address;
  amount: string; // base units
  fee: string;
  nonce: string;
  text: string;
  balance: string;
  /// Problems that block signing (shown instead of a Confirm button).
  blockers: string[];
  /// Over the user's "confirm again" threshold: Confirm asks for the password.
  needsPassword: boolean;
  /// From automations: skip the password re-check (rules were approved with the password when made).
  ruleId?: string;
}

export async function me(): Promise<Profile> {
  const p = await getProfile();
  if (!p) throw new Error("Connect your GitHub account first");
  return p;
}

/// Builds the payment and runs the checks the contract would, so nothing is signed that would revert.
export async function prepare(req: { to: string | Payee; chain: ChainKey; amount: string; fee: string; confirmAbove?: string }): Promise<Prepared> {
  const profile = await me();
  const c = CHAINS[req.chain];
  const payee = typeof req.to === "string" ? await resolvePayee(req.to) : req.to;
  const amount = parseUnits(req.amount || "0", 6);
  const fee = parseUnits(req.fee || "0", 6);
  if (amount <= 0n) throw new Error("Enter an amount");
  const account = profile.account;
  const [nonce, balance, vault] = await Promise.all([nonceOf(req.chain, account), usdcBalance(req.chain, account), vaultFile()]);
  if (!vault) throw new Error("No browser key yet");
  const kh = blobHash(unb64(vault.blob));
  const firstSeen = (await keyStatus(BigInt(profile.githubId), kh)).find((k) => k.key === req.chain)?.firstSeen ?? 0n;
  const blockers: string[] = [];
  if (payee.address.toLowerCase() === account.toLowerCase()) blockers.push("That's your own account");
  if (balance < amount + fee) blockers.push(`Not enough USDC on ${c.chain.name}: ${(Number(balance) / 1e6).toFixed(2)} for ${(Number(amount + fee) / 1e6).toFixed(2)} (amount + fee)`);
  if (firstSeen === 0n) blockers.push(`This browser key isn't on-chain on ${c.chain.name} yet. Sync your keys`);
  else if (amount > INSTANT_LIMIT && BigInt(Math.floor(Date.now() / 1000)) < firstSeen + BigInt(NEW_KEY_DELAY_SECONDS)) {
    const at = new Date(Number(firstSeen + BigInt(NEW_KEY_DELAY_SECONDS)) * 1000);
    blockers.push(`A key under 72 h old can send up to 50 USDC at once. Available after ${at.toLocaleString()}`);
  }
  // The exact bytes the contract will rebuild: read them from the account when it's deployed.
  const code = await client(req.chain).getCode({ address: account });
  const text =
    code && code !== "0x"
      ? hexToString((await client(req.chain).readContract({ address: account, abi: sshAccountAbi, functionName: "intent", args: [c.usdc, payee.address, amount, fee, nonce] })) as Hex)
      : buildIntent({ chainId: c.chain.id, account, githubId: BigInt(profile.githubId), nonce, amount, token: c.usdc, to: payee.address, fee });
  const needsPassword = req.confirmAbove !== undefined && amount > parseUnits(req.confirmAbove || "0", 6);
  return { chain: req.chain, payee, token: c.usdc, amount: amount.toString(), fee: fee.toString(), nonce: nonce.toString(), text, balance: balance.toString(), blockers, needsPassword };
}

/// Signs the prepared text with the browser key and submits it. Returns the explorer link.
export async function send(p: Prepared, note?: string): Promise<{ url: string; tx?: string }> {
  if (p.blockers.length) throw new Error(p.blockers[0]);
  const profile = await me();
  const { key, blob } = await signer();
  const sig = await sign(key, blob, p.text);
  const c = CHAINS[p.chain];
  const r = await relay<{ url: string; tx?: Hex }>("/intent", {
    chainId: c.chain.id,
    githubId: profile.githubId,
    token: p.token,
    to: p.payee.address,
    amount: p.amount,
    fee: p.fee,
    signature: armorSig(sig),
  });
  await addPending({
    chain: p.chain,
    tx: r.tx,
    url: r.url,
    kind: "sent",
    amount: p.amount,
    fee: p.fee,
    counterparty: p.payee.address,
    label: p.payee.login ? `@${p.payee.login}` : undefined,
    note: note ?? (p.ruleId ? `rule ${p.ruleId}` : undefined),
  });
  return r;
}

/// Claims <login>.sereno.eth for the account (P-256, so it works on Sepolia's verifier).
export async function claimName(): Promise<{ url: string }> {
  const profile = await me();
  if (!ENS_DEPLOYMENT) throw new Error("ENS isn't set up");
  const text = buildClaimText({ chainId: CHAINS.sepolia.chain.id, label: profile.login.toLowerCase(), parentName: parent, githubId: BigInt(profile.githubId), account: profile.account });
  const { key, blob } = await signer();
  return relay("/claim", { label: profile.login.toLowerCase(), githubId: profile.githubId, signature: armorSig(await sign(key, blob, text)) });
}

/// Claims an escrow deposit waiting for this GitHub ID (Escrow.claimText(id), signed, then the relayer submits).
export async function claimEscrow(chain: ChainKey, id: string): Promise<{ url: string }> {
  if (!EXTRAS) throw new Error("The escrow isn't deployed");
  const text = (await client(chain).readContract({ address: EXTRAS.Escrow, abi: escrowAbi, functionName: "claimText", args: [BigInt(id)] })) as Hex;
  const { key, blob } = await signer();
  const sig = await sign(key, blob, hexToBytes(text));
  return relay("/escrow/claim", { chainId: CHAINS[chain].chain.id, id, signature: toHex(sig) });
}

export type SyncState = { state: "queued" | "running" | "done" | "failed" | "unknown"; detail?: string; workerAge?: number | null; cooldown?: number };

/// Asks the relayer to copy this user's GitHub keys on-chain (the CRE workflow, on all three chains).
export const requestSync = (login: string) => relay<SyncState & { githubId: string }>("/sync", { login });
export const syncStatus = (githubId: string) => relayGet<SyncState>(`/sync/status/${githubId}`);
