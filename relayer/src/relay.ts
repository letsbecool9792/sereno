// Submits SSH-signed spends, signed commits and name claims. The signed texts fix recipient, amount and fee, so the
// relayer can only submit or refuse; anyone can run one, or users can submit themselves.
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  accountFactoryAbi,
  bountyBoardAbi,
  chainById,
  CHAINS,
  CORE,
  ENS_DEPLOYMENT,
  EXTRAS,
  fromGithubVerification,
  githubGet,
  nameRegistrarAbi,
  parseIntent,
  sshAccountAbi,
  unarmor,
  type ChainConfig,
  type SignedCommit,
} from "@sereno/shared";

export class RelayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/// A pushed commit, read from GitHub's API: verification.payload is exactly the signed bytes.
export async function commitFromGithub(repo: string, sha: string, token?: string) {
  const c = await githubGet<{ commit: { verification: { payload: string | null; signature: string | null; verified: boolean; reason: string } } }>(
    `/repos/${repo}/commits/${sha}`,
    token,
  );
  const v = c.commit.verification;
  if (!v.payload || !v.signature) throw new RelayError(400, "commit is not signed");
  return { commit: fromGithubVerification(v.payload, v.signature), githubVerified: v.verified, reason: v.reason };
}

export interface Relayed {
  chain: string;
  account: Address;
  tx: Hex;
  url: string;
  gasUsed: string;
}

// Sepolia's base fee is a few wei; default fee estimation overpays by orders of magnitude there.
const feesFor = (c: ChainConfig) => (c.key === "sepolia" ? { maxFeePerGas: 5000n, maxPriorityFeePerGas: 100n } : {});

export function makeRelayer(key: Hex) {
  if (!CORE) throw new Error("core contracts not deployed; run `bun run sync`");
  const core = CORE;
  const signer = privateKeyToAccount(key);
  const clients = new Map<number, { pub: ReturnType<typeof createPublicClient>; wallet: ReturnType<typeof createWalletClient> }>();
  const clientsFor = (c: ChainConfig) => {
    let x = clients.get(c.chain.id);
    if (!x) {
      const transport = http(c.rpc, { retryCount: 3 });
      x = { pub: createPublicClient({ chain: c.chain, transport }), wallet: createWalletClient({ account: signer, chain: c.chain, transport }) };
      clients.set(c.chain.id, x);
    }
    return x;
  };

  /// Simulate (to surface the contract's error by name), then send and wait.
  async function submit(c: ChainConfig, req: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) {
    const { pub, wallet } = clientsFor(c);
    try {
      const { request } = await pub.simulateContract({ account: signer, ...req } as never);
      const gas = await pub.estimateContractGas({ account: signer, ...req } as never);
      const hash = await wallet.writeContract({ ...(request as object), gas: (gas * 13n) / 10n, ...feesFor(c) } as never);
      const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (r.status !== "success") throw new RelayError(502, `reverted on-chain: ${c.explorer}/tx/${hash}`);
      return { tx: hash, url: `${c.explorer}/tx/${hash}`, gasUsed: r.gasUsed.toString() };
    } catch (e) {
      if (e instanceof RelayError) throw e;
      const reverted = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
      if (reverted instanceof ContractFunctionRevertedError) {
        const name = reverted.data?.errorName ?? reverted.reason ?? "reverted";
        throw new RelayError(400, `${name}${reverted.data?.args?.length ? ` ${reverted.data.args.join(", ")}` : ""}`);
      }
      throw e;
    }
  }

  async function ensureAccount(c: ChainConfig, githubId: bigint): Promise<Address> {
    const { pub } = clientsFor(c);
    const account = await pub.readContract({ address: core.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [githubId] });
    const code = await pub.getCode({ address: account });
    if (!code || code === "0x") await submit(c, { address: core.AccountFactory, abi: accountFactoryAbi, functionName: "deploy", args: [githubId] });
    return account;
  }

  return {
    address: signer.address,

    /// A spend signed with `ssh-keygen -Y sign -n sereno@v1` over the intent text.
    async intent(p: { chainId: number; githubId: bigint; token: Address; to: Address; amount: bigint; fee: bigint; signature: string }): Promise<Relayed> {
      const c = chainById(p.chainId);
      const account = await ensureAccount(c, p.githubId);
      const sig = p.signature.startsWith("0x") ? (p.signature as Hex) : unarmor(p.signature);
      const r = await submit(c, { address: account, abi: sshAccountAbi, functionName: "execute", args: [p.token, p.to, p.amount, p.fee, sig] });
      return { chain: c.key, account, ...r };
    },

    /// A signed git commit whose message is exactly an intent.
    async commit(commit: SignedCommit): Promise<Relayed> {
      const i = parseIntent(commit.message);
      if (!i) throw new RelayError(400, "commit message is not a payment intent");
      const c = chainById(i.chainId);
      const account = await ensureAccount(c, i.githubId);
      if (account.toLowerCase() !== i.account.toLowerCase()) throw new RelayError(400, "intent names a different account than its GitHub ID's");
      const r = await submit(c, {
        address: account,
        abi: sshAccountAbi,
        functionName: "executeCommit",
        args: [i.token, i.to, i.amount, i.fee, `0x${Buffer.from(commit.headers, "utf8").toString("hex")}`, unarmor(commit.signature)],
      });
      return { chain: c.key, account, ...r };
    },

    /// A bounty's state on `chainId`: the winner's GitHub ID (0 = unsettled) and the unpaid USDC pot.
    async bounty(chainId: number, repo: string, issue: bigint) {
      if (!EXTRAS) throw new RelayError(503, "the bounty board isn't deployed yet");
      const c = chainById(chainId);
      const { pub } = clientsFor(c);
      const board = { address: EXTRAS.BountyBoard, abi: bountyBoardAbi } as const;
      const repoHash = await pub.readContract({ ...board, functionName: "repoHashOf", args: [repo] });
      const [winner, pot] = await Promise.all([
        pub.readContract({ ...board, functionName: "winnerOf", args: [await pub.readContract({ ...board, functionName: "issueKey", args: [repoHash, issue] })] }),
        pub.readContract({ ...board, functionName: "potOf", args: [await pub.readContract({ ...board, functionName: "potKey", args: [repoHash, issue, c.usdc] })] }),
      ]);
      return { chain: c.key, repoHash, winner, pot };
    },

    /// Pays a settled bounty's USDC pot to the winner's account (BountyBoard.payout is permissionless; we pay the gas).
    async bountyPayout(chainId: number, repo: string, issue: bigint): Promise<Relayed | null> {
      const b = await this.bounty(chainId, repo, issue);
      if (b.winner === 0n || b.pot === 0n) return null;
      const c = chainById(chainId);
      const r = await submit(c, { address: EXTRAS!.BountyBoard, abi: bountyBoardAbi, functionName: "payout", args: [b.repoHash, issue, c.usdc] });
      const account = await clientsFor(c).pub.readContract({ address: core.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [b.winner] });
      return { chain: c.key, account, ...r };
    },

    /// A name claim (ENS lives on Sepolia).
    async claim(p: { label: string; githubId: bigint; signature: string }): Promise<Relayed> {
      if (!ENS_DEPLOYMENT) throw new RelayError(503, "ENS not set up");
      const c = CHAINS.sepolia;
      const sig = p.signature.startsWith("0x") ? (p.signature as Hex) : unarmor(p.signature);
      const r = await submit(c, { address: ENS_DEPLOYMENT.nameRegistrar, abi: nameRegistrarAbi, functionName: "claim", args: [p.label.toLowerCase(), p.githubId, sig] });
      const account = await clientsFor(c).pub.readContract({ address: core.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [p.githubId] });
      return { chain: c.key, account, ...r };
    },
  };
}
