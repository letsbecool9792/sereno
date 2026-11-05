import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { chainByKey, type ChainKey } from "@sereno/shared";

export const ROOT = join(import.meta.dir, "../../..");
export const SECRETS = join(ROOT, ".secrets");

/// Reads a key from .secrets/<name>.key (git-ignored), creating it if `create` is set.
export function secretKey(name: string, create = false): Hex {
  const p = join(SECRETS, `${name}.key`);
  if (!existsSync(p)) {
    if (!create) throw new Error(`missing ${p}`);
    mkdirSync(SECRETS, { recursive: true });
    writeFileSync(p, generatePrivateKey());
  }
  const k = readFileSync(p, "utf8").trim();
  return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
}

export function clients(chain: ChainKey, key: Hex) {
  const c = chainByKey(chain);
  const account = privateKeyToAccount(key);
  const transport = http(c.rpc, { retryCount: 3 });
  return {
    config: c,
    account,
    pub: createPublicClient({ chain: c.chain, transport }),
    wallet: createWalletClient({ account, chain: c.chain, transport }),
  };
}

/// Foundry artifact (abi + creation bytecode) from contracts/out.
export function artifact(file: string, name: string): { abi: unknown[]; bytecode: Hex } {
  const j = JSON.parse(readFileSync(join(ROOT, "contracts/out", file, `${name}.json`), "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

export const readJson = <T>(p: string, fallback: T): T => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
export const writeJson = (p: string, v: unknown) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
