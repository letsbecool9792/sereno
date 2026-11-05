import { keccak256, toHex, type Hex } from "viem";

const BEGIN = "-----BEGIN SSH SIGNATURE-----";
const END = "-----END SSH SIGNATURE-----";

/// The armored output of `ssh-keygen -Y sign` (or git's gpgsig) to the raw SSHSIG bytes the contracts take.
export function unarmor(armored: string): Hex {
  const body = armored
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== BEGIN && l !== END)
    .join("");
  const raw = Buffer.from(body, "base64");
  if (raw.subarray(0, 6).toString("latin1") !== "SSHSIG") throw new Error("not an SSH signature");
  return toHex(raw);
}

export function armor(sig: Hex): string {
  const b64 = Buffer.from(sig.slice(2), "hex").toString("base64");
  const lines = b64.match(/.{1,70}/g) ?? [];
  return [BEGIN, ...lines, END, ""].join("\n");
}

/// keccak256 of a public key blob: the identifier the key oracle stores. Takes an authorized_keys line or .pub file.
export function keyHash(publicKeyLine: string): Hex {
  const field = publicKeyLine.trim().split(/\s+/)[1];
  if (!field) throw new Error("not an SSH public key line");
  return keccak256(toHex(Buffer.from(field, "base64")));
}
