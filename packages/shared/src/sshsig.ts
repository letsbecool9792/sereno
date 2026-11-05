import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";

// Web-standard base64 (atob/btoa) so this works in browsers as well as Bun/Node.
const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const BEGIN = "-----BEGIN SSH SIGNATURE-----";
const END = "-----END SSH SIGNATURE-----";

/// The armored output of `ssh-keygen -Y sign` (or git's gpgsig) to the raw SSHSIG bytes the contracts take.
export function unarmor(armored: string): Hex {
  const body = armored
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== BEGIN && l !== END)
    .join("");
  const raw = fromBase64(body);
  if (String.fromCharCode(...raw.subarray(0, 6)) !== "SSHSIG") throw new Error("not an SSH signature");
  return bytesToHex(raw);
}

export function armor(sig: Hex): string {
  const lines = toBase64(hexToBytes(sig)).match(/.{1,70}/g) ?? [];
  return [BEGIN, ...lines, END, ""].join("\n");
}

/// keccak256 of a public key blob: the identifier the key oracle stores. Takes an authorized_keys line or .pub file.
export function keyHash(publicKeyLine: string): Hex {
  const field = publicKeyLine.trim().split(/\s+/)[1];
  if (!field) throw new Error("not an SSH public key line");
  return keccak256(fromBase64(field));
}
