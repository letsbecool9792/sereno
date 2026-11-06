// The WebCrypto P-256 SSHSIG must be accepted by the deployed SshSigVerifier (an eth_call, no transaction) and by
// stock `ssh-keygen -Y verify`. Network and ssh-keygen parts skip themselves when unavailable.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bytesToHex, createPublicClient, toHex } from "viem";
import { buildIntent, CHAINS, CORE, keyHash, SIGNING_NAMESPACE, sshSigVerifierAbi, transportFor, unarmor } from "@sereno/shared";
import { armorSig, blobHash, publicBlob, publicKeyLine, sign } from "./sshsig";

async function freshKey() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { pair, blob: publicBlob(raw) };
}

const intent = buildIntent({
  chainId: 84532,
  account: "0xa82f9cff1f2913527276875829fdf42ea200d4f8",
  githubId: 99113360n,
  nonce: 14n,
  amount: 1_000_000n,
  token: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  to: "0x0d392856ac31df1a2e2e2110dc92bb4192185809",
  fee: 20_000n,
} as never);

describe("P-256 SSHSIG from WebCrypto", () => {
  test("public key line and keyHash agree with @sereno/shared", async () => {
    const { blob } = await freshKey();
    const line = publicKeyLine(blob, "sereno-browser");
    expect(line.startsWith("ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTY")).toBe(true);
    expect(keyHash(line)).toBe(blobHash(blob));
  });

  test("armor round-trips through the shared unarmor", async () => {
    const { pair, blob } = await freshKey();
    const sig = await sign(pair.privateKey, blob, intent);
    expect(unarmor(armorSig(sig))).toBe(bytesToHex(sig));
  });

  test("ssh-keygen -Y verify accepts it", async () => {
    const which = spawnSync("ssh-keygen", ["-?"], { encoding: "utf8" });
    if (which.error) return; // no OpenSSH here
    const { pair, blob } = await freshKey();
    const dir = mkdtempSync(join(tmpdir(), "sereno-sig-"));
    writeFileSync(join(dir, "msg"), intent);
    writeFileSync(join(dir, "sig"), armorSig(await sign(pair.privateKey, blob, intent)));
    writeFileSync(join(dir, "allowed"), `me ${publicKeyLine(blob, "test")}\n`);
    const r = spawnSync("ssh-keygen", ["-Y", "verify", "-f", join(dir, "allowed"), "-I", "me", "-n", SIGNING_NAMESPACE, "-s", join(dir, "sig")], {
      input: intent,
      encoding: "utf8",
    });
    expect(`${r.stdout}${r.stderr}`).toContain("Good");
  });

  test("the deployed SshSigVerifier on Base Sepolia accepts it (several keys, so high-s cases occur)", async () => {
    const pub = createPublicClient({ chain: CHAINS["base-sepolia"].chain, transport: transportFor(CHAINS["base-sepolia"]) });
    for (let i = 0; i < 4; i++) {
      const { pair, blob } = await freshKey();
      const sig = await sign(pair.privateKey, blob, intent);
      const [ok, publicKey] = await pub.readContract({
        address: CORE!.SshSigVerifier,
        abi: sshSigVerifierAbi,
        functionName: "verify",
        args: [toHex(sig), toHex(intent), toHex(SIGNING_NAMESPACE)],
      });
      expect(ok).toBe(true);
      expect(publicKey).toBe(toHex(blob));
    }
  }, 60_000);
});
