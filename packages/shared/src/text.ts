import { getAddress, type Address } from "viem";
import { INTENT_HEADER } from "./constants";

/// A spend. Its text (buildIntent) is what the developer signs; SshAccount.intent() builds the same bytes on-chain.
export interface Intent {
  chainId: number;
  account: Address;
  githubId: bigint;
  nonce: bigint;
  amount: bigint;
  token: Address;
  to: Address;
  fee: bigint;
}

const lower = (a: string) => a.toLowerCase();

export function buildIntent(i: Intent): string {
  return [
    INTENT_HEADER,
    `chain: ${i.chainId}`,
    `account: ${lower(i.account)}`,
    `github-id: ${i.githubId}`,
    `nonce: ${i.nonce}`,
    `send: ${i.amount} of ${lower(i.token)}`,
    `to: ${lower(i.to)}`,
    `relayer-fee: ${i.fee}`,
    "",
  ].join("\n");
}

const INTENT_RE = new RegExp(
  `^${INTENT_HEADER.replace(/\./g, "\\.")}\\nchain: (\\d+)\\naccount: (0x[0-9a-f]{40})\\ngithub-id: (\\d+)\\nnonce: (\\d+)\\nsend: (\\d+) of (0x[0-9a-f]{40})\\nto: (0x[0-9a-f]{40})\\nrelayer-fee: (\\d+)\\n$`,
);

/// Parses an intent (for example a commit message). Returns null unless the text is exactly an intent.
export function parseIntent(text: string): Intent | null {
  const m = INTENT_RE.exec(text);
  if (!m) return null;
  const [, chainId, account, githubId, nonce, amount, token, to, fee] = m as unknown as string[];
  return {
    chainId: Number(chainId),
    account: getAddress(account!),
    githubId: BigInt(githubId!),
    nonce: BigInt(nonce!),
    amount: BigInt(amount!),
    token: getAddress(token!),
    to: getAddress(to!),
    fee: BigInt(fee!),
  };
}

export interface Claim {
  chainId: number;
  label: string;
  parentName: string;
  githubId: bigint;
  account: Address;
}

/// The text a name claim signs (NameRegistrar.claimText builds the same bytes on-chain).
export function buildClaimText(c: Claim): string {
  return [
    INTENT_HEADER,
    `chain: ${c.chainId}`,
    `claim-name: ${c.label}.${c.parentName}`,
    `github-id: ${c.githubId}`,
    `account: ${lower(c.account)}`,
    "",
  ].join("\n");
}
