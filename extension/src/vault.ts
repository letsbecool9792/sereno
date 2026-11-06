// The browser key's vault (EXTENSION_DESIGN.md §3.5). The P-256 private key exists in plaintext only inside
// chrome.storage.session while unlocked (RAM only, cleared when the browser closes, not readable by content scripts).
// At rest it is AES-256-GCM under PBKDF2-SHA256(password, 600 000 iterations). It is never shown or exported.
import { b64, publicBlob, publicKeyLine, unb64 } from "./sshsig";

const ITERATIONS = 600_000;
const MIN_PASSWORD = 10;

export interface VaultFile {
  v: 1;
  publicKey: string; // authorized_keys line
  blob: string; // base64 SSH public key blob
  createdAt: number;
  password: { kdf: "PBKDF2-SHA256"; iterations: number; salt: string; iv: string; ct: string };
}

interface Session {
  pkcs8: string;
  unlockedAt: number;
  activeAt: number;
}

const local = chrome.storage.local;
const session = chrome.storage.session;

export async function vaultFile(): Promise<VaultFile | null> {
  return ((await local.get("vault")).vault as VaultFile | undefined) ?? null;
}

async function wrapKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`;
  if (/^(.)\1+$/.test(p)) return "Too repetitive";
  return null;
}

/// Makes the browser key, encrypts it straight into the vault, and leaves the vault unlocked.
export async function createVault(password: string): Promise<VaultFile> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await wrapKey(password, salt, ITERATIONS), pkcs8));
  const blob = publicBlob(raw);
  const date = new Date().toISOString().slice(0, 10);
  const file: VaultFile = {
    v: 1,
    publicKey: publicKeyLine(blob, `sereno-browser-${date}`),
    blob: b64(blob),
    createdAt: Date.now(),
    password: { kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) },
  };
  await local.set({ vault: file, unlockFails: 0, unlockWaitUntil: 0 });
  await session.set({ unlocked: { pkcs8: b64(pkcs8), unlockedAt: Date.now(), activeAt: Date.now() } satisfies Session });
  pkcs8.fill(0);
  return file;
}

/// Decrypts with the password. After 5 wrong tries each further try waits longer (2^n seconds, up to 10 minutes).
export async function unlock(password: string): Promise<void> {
  const file = await vaultFile();
  if (!file) throw new Error("No browser key yet");
  const { unlockFails = 0, unlockWaitUntil = 0 } = (await local.get(["unlockFails", "unlockWaitUntil"])) as { unlockFails?: number; unlockWaitUntil?: number };
  if (Date.now() < unlockWaitUntil) throw new Error(`Too many tries. Wait ${Math.ceil((unlockWaitUntil - Date.now()) / 1000)} s`);
  try {
    const p = file.password;
    const key = await wrapKey(password, unb64(p.salt), p.iterations);
    const pkcs8 = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(p.iv) }, key, unb64(p.ct)));
    await session.set({ unlocked: { pkcs8: b64(pkcs8), unlockedAt: Date.now(), activeAt: Date.now() } satisfies Session });
    pkcs8.fill(0);
    await local.set({ unlockFails: 0, unlockWaitUntil: 0 });
  } catch {
    const fails = unlockFails + 1;
    const wait = fails >= 5 ? Math.min(600, 2 ** (fails - 4)) * 1000 : 0;
    await local.set({ unlockFails: fails, unlockWaitUntil: Date.now() + wait });
    throw new Error(fails >= 5 ? `Wrong password. Next try in ${wait / 1000} s` : "Wrong password");
  }
}

/// Checks the password without changing the session (re-confirmation for big payments and rule edits).
export async function checkPassword(password: string): Promise<boolean> {
  const file = await vaultFile();
  if (!file) return false;
  try {
    const p = file.password;
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(p.iv) }, await wrapKey(password, unb64(p.salt), p.iterations), unb64(p.ct));
    return true;
  } catch {
    return false;
  }
}

export async function lock(): Promise<void> {
  await session.remove("unlocked");
}

export async function isUnlocked(): Promise<boolean> {
  return !!(await session.get("unlocked")).unlocked;
}

/// Marks activity (resets the idle auto-lock timer).
export async function touch(): Promise<void> {
  const s = (await session.get("unlocked")).unlocked as Session | undefined;
  if (s) await session.set({ unlocked: { ...s, activeAt: Date.now() } });
}

/// Locks when idle longer than `minutes`. Called from a chrome.alarms tick.
export async function autoLock(minutes: number): Promise<boolean> {
  const s = (await session.get("unlocked")).unlocked as Session | undefined;
  if (s && Date.now() - s.activeAt > minutes * 60_000) {
    await lock();
    return true;
  }
  return false;
}

/// The signing key (non-extractable) and its public blob, or throws when locked.
export async function signer(): Promise<{ key: CryptoKey; blob: Uint8Array; publicKey: string }> {
  const file = await vaultFile();
  const s = (await session.get("unlocked")).unlocked as Session | undefined;
  if (!file || !s) throw new Error("Locked");
  const key = await crypto.subtle.importKey("pkcs8", unb64(s.pkcs8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { key, blob: unb64(file.blob), publicKey: file.publicKey };
}

/// Forgets the browser key on this device (the user removes it on GitHub too).
export async function wipe(): Promise<void> {
  await lock();
  await local.remove(["vault", "unlockFails", "unlockWaitUntil"]);
}
