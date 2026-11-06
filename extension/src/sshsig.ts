// SSHSIG (OpenSSH PROTOCOL.sshsig) for an ecdsa-sha2-nistp256 key held as a WebCrypto CryptoKey. The signature is
// what `ssh-keygen -Y sign -n sereno@v1 -O hashalg=sha256` would produce with the same key, so the account contract's
// SshSigVerifier accepts it (P-256 goes through the 0x100 precompile: about 189k gas per payment).
import { bytesToHex, keccak256, type Hex } from "viem";
import { SIGNING_NAMESPACE } from "@sereno/shared";

const enc = new TextEncoder();
/// The P-256 group order; signatures are normalized to low-s.
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const KEY_TYPE = "ecdsa-sha2-nistp256";

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
/// SSH `string`: uint32 length, then the bytes.
const str = (b: Uint8Array | string) => {
  const bytes = typeof b === "string" ? enc.encode(b) : b;
  return concat(u32(bytes.length), bytes);
};
/// SSH `mpint` of a non-negative big-endian integer: minimal bytes, with a 0x00 prefix when the top bit is set.
function mpint(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  let v: Uint8Array = b.slice(i);
  if (v.length === 1 && v[0] === 0) v = new Uint8Array(0);
  if (v.length && v[0]! & 0x80) v = concat(new Uint8Array([0]), v);
  return str(v);
}
const toBig = (b: Uint8Array) => BigInt(bytesToHex(b));
const to32 = (n: bigint) => {
  const h = n.toString(16).padStart(64, "0");
  return Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
};
export const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/// The SSH public key blob for an uncompressed P-256 point (0x04 ‖ X ‖ Y).
export function publicBlob(raw: Uint8Array): Uint8Array {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("expected an uncompressed P-256 point");
  return concat(str(KEY_TYPE), str("nistp256"), str(raw));
}

/// The authorized_keys line GitHub takes: `ecdsa-sha2-nistp256 AAAA… <comment>`.
export const publicKeyLine = (blob: Uint8Array, comment: string) => `${KEY_TYPE} ${b64(blob)} ${comment}`;

/// keccak256 of the blob: the KeyOracle's keyHash (same as keyHash() in @sereno/shared).
export const blobHash = (blob: Uint8Array): Hex => keccak256(blob);

/// Signs `message` and returns the binary SSHSIG.
export async function sign(key: CryptoKey, blob: Uint8Array, message: Uint8Array | string, namespace = SIGNING_NAMESPACE): Promise<Uint8Array> {
  const msg = typeof message === "string" ? enc.encode(message) : message;
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", msg as BufferSource));
  const signed = concat(enc.encode("SSHSIG"), str(namespace), str(""), str("sha256"), str(h));
  // WebCrypto hashes `signed` with SHA-256 itself and returns r ‖ s (32 bytes each).
  const rs = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signed as BufferSource));
  const r = rs.slice(0, 32);
  let s = toBig(rs.slice(32));
  if (s > N / 2n) s = N - s;
  const sig = concat(str(KEY_TYPE), str(concat(mpint(r), mpint(to32(s)))));
  return concat(enc.encode("SSHSIG"), u32(1), str(blob), str(namespace), str(""), str("sha256"), str(sig));
}

/// ASCII armor, as ssh-keygen writes it (and as the relayer accepts).
export function armorSig(sig: Uint8Array): string {
  const lines = b64(sig).match(/.{1,70}/g)!.join("\n");
  return `-----BEGIN SSH SIGNATURE-----\n${lines}\n-----END SSH SIGNATURE-----\n`;
}
