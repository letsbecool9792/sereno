// CCIP-read (EIP-3668) answers for <github-login>.<parent>. Pure apart from the injected lookups, so it is testable.
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodePacked,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

const resolverAbi = parseAbi(["function resolve(bytes name, bytes data) view returns (bytes)"]);
const recordAbi = parseAbi([
  "function addr(bytes32 node) view returns (address)",
  "function addr(bytes32 node, uint256 coinType) view returns (bytes)",
  "function text(bytes32 node, string key) view returns (string)",
]);

export interface Lookups {
  /// GitHub login -> numeric ID (null if no such user).
  githubId(login: string): Promise<bigint | null>;
  /// numeric ID -> account address (the same on every chain).
  accountOf(githubId: bigint): Promise<Address>;
  /// If the login changed owner recently and is quarantined, the error to show (see moves.ts); null otherwise.
  moved(login: string, githubId: bigint): Promise<string | null>;
}

export class GatewayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/// DNS wire format (ENSIP-10) to labels.
export function dnsDecode(name: Hex): string[] {
  const b = Buffer.from(name.slice(2), "hex");
  const labels: string[] = [];
  for (let i = 0; i < b.length && b[i] !== 0; ) {
    const len = b[i]!;
    labels.push(b.subarray(i + 1, i + 1 + len).toString("utf8"));
    i += len + 1;
  }
  return labels;
}

/// Is this coin type an EVM chain (ENSIP-11)? 60 = Ethereum; 0x80000000 | chainId for others.
const isEvmCoinType = (c: bigint) => c === 60n || (c & 0x80000000n) !== 0n;

/// Answers the inner record call for `login`, ABI-encoded as the resolver would return it.
export async function answer(labels: string[], parent: string, inner: Hex, lookups: Lookups): Promise<Hex> {
  const parentLabels = parent.split(".");
  const sub = labels.slice(0, labels.length - parentLabels.length);
  if (labels.slice(sub.length).join(".") !== parent || sub.length !== 1) {
    throw new GatewayError(404, `not a <user>.${parent} name`);
  }
  const login = sub[0]!.toLowerCase();
  const call = decodeFunctionData({ abi: recordAbi, data: inner });

  if (call.functionName === "text") {
    const key = call.args[1];
    const values: Record<string, string> = {
      url: `https://github.com/${login}`,
      avatar: `https://github.com/${login}.png`,
      "com.github": login,
      description: `${login} on GitHub. Pays to the account their GitHub SSH keys control.`,
    };
    return encodeAbiParameters([{ type: "string" }], [values[key] ?? ""]);
  }

  const id = await lookups.githubId(login);
  if (id === null) throw new GatewayError(404, `no GitHub user ${login}`);
  const moved = await lookups.moved(login, id);
  if (moved) throw new GatewayError(409, moved);
  const account = await lookups.accountOf(id);
  if (call.args.length === 1) return encodeAbiParameters([{ type: "address" }], [account]);
  const coinType = call.args[1] as bigint;
  return encodeAbiParameters([{ type: "bytes" }], [isEvmCoinType(coinType) ? account : "0x"]);
}

/// Full CCIP-read response for `callData` = resolve(name, data) sent to resolver `sender`.
export async function handle(
  sender: Address,
  callData: Hex,
  opts: { resolver: Address; parent: string; signer: PrivateKeyAccount; lookups: Lookups; ttl?: number; now?: number },
): Promise<Hex> {
  if (sender.toLowerCase() !== opts.resolver.toLowerCase()) throw new GatewayError(400, "unknown resolver");
  const { functionName, args } = decodeFunctionData({ abi: resolverAbi, data: callData });
  if (functionName !== "resolve") throw new GatewayError(400, "expected resolve(bytes,bytes)");
  const result = await answer(dnsDecode(args[0]), opts.parent, args[1], opts.lookups);
  const expires = BigInt(Math.floor((opts.now ?? Date.now()) / 1000) + (opts.ttl ?? 300));
  const digest = keccak256(
    encodePacked(["bytes2", "address", "uint64", "bytes32", "bytes32"], ["0x1900", sender, expires, keccak256(callData), keccak256(result)]),
  );
  const sig = await opts.signer.sign({ hash: digest });
  return encodeAbiParameters([{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }], [result, expires, sig]);
}
