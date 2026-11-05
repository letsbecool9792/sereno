import { describe, expect, test } from "bun:test";
import { decodeAbiParameters, encodeFunctionData, encodePacked, keccak256, namehash, parseAbi, recoverAddress, toHex } from "viem";
import { packetToBytes } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";
import { dnsDecode, handle, type Lookups } from "./resolve";

const signer = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000005161");
const resolver = "0x8ea21d6c3dc1983a1fcf2d8cf40dd9134b4e1d69";
const parent = "sereno.eth";
const account = "0xA22f7e55C2eF953D16607636c9ba48D60e78E402";
const lookups: Lookups = {
  githubId: async (login) => (login === "letsbecool9792" ? 99113360n : null),
  accountOf: async () => account,
};
const abi = parseAbi([
  "function resolve(bytes name, bytes data) view returns (bytes)",
  "function addr(bytes32 node) view returns (address)",
  "function addr(bytes32 node, uint256 coinType) view returns (bytes)",
  "function text(bytes32 node, string key) view returns (string)",
]);
const request = (name: string, inner: `0x${string}`) =>
  encodeFunctionData({ abi, functionName: "resolve", args: [toHex(packetToBytes(name)), inner] });

describe("gateway", () => {
  test("decodes DNS-encoded names", () => {
    expect(dnsDecode(toHex(packetToBytes("letsbecool9792.sereno.eth")))).toEqual(["letsbecool9792", "sereno", "eth"]);
  });

  test("answers addr with the account, signed in the resolver's scheme", async () => {
    const name = "LetsBeCool9792.sereno.eth";
    const callData = request(name, encodeFunctionData({ abi, functionName: "addr", args: [namehash(name)] }));
    const out = await handle(resolver, callData, { resolver, parent, signer, lookups, now: 1_000_000_000_000 });
    const [result, expires, sig] = decodeAbiParameters([{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }], out);
    expect(decodeAbiParameters([{ type: "address" }], result)[0]).toBe(account);
    expect(expires).toBe(1_000_000_300n);
    const digest = keccak256(encodePacked(["bytes2", "address", "uint64", "bytes32", "bytes32"], ["0x1900", resolver, expires, keccak256(callData), keccak256(result)]));
    expect(await recoverAddress({ hash: digest, signature: sig })).toBe(signer.address);
  });

  test("answers every EVM coin type with the same account, nothing for others", async () => {
    const name = "letsbecool9792.sereno.eth";
    for (const [coinType, expected] of [[0x80000000n | 84532n, account.toLowerCase() as `0x${string}`], [0n, "0x" as const]] as const) {
      const callData = request(name, encodeFunctionData({ abi, functionName: "addr", args: [namehash(name), coinType] }));
      const [result] = decodeAbiParameters([{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }], await handle(resolver, callData, { resolver, parent, signer, lookups }));
      expect(decodeAbiParameters([{ type: "bytes" }], result)[0]).toBe(expected);
    }
  });

  test("text records point at the GitHub profile", async () => {
    const name = "letsbecool9792.sereno.eth";
    const callData = request(name, encodeFunctionData({ abi, functionName: "text", args: [namehash(name), "url"] }));
    const [result] = decodeAbiParameters([{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }], await handle(resolver, callData, { resolver, parent, signer, lookups }));
    expect(decodeAbiParameters([{ type: "string" }], result)[0]).toBe("https://github.com/letsbecool9792");
  });

  test("refuses unknown users, foreign names and other resolvers", async () => {
    const inner = encodeFunctionData({ abi, functionName: "addr", args: [namehash("x")] });
    await expect(handle(resolver, request("nobody.sereno.eth", inner), { resolver, parent, signer, lookups })).rejects.toThrow("no GitHub user");
    await expect(handle(resolver, request("a.b.sereno.eth", inner), { resolver, parent, signer, lookups })).rejects.toThrow("not a <user>");
    await expect(handle(resolver, request("x.other.eth", inner), { resolver, parent, signer, lookups })).rejects.toThrow("not a <user>");
    await expect(handle(account, request("x.sereno.eth", inner), { resolver, parent, signer, lookups })).rejects.toThrow("unknown resolver");
  });
});
