// `ak connect` and `ak native-host`: the browser extension's native helper (extension/EXTENSION_DESIGN.md §3.2).
// connect copies this ak build to ~/.sereno, writes a native messaging host manifest (com.sereno.ak) that admits only
// the Sereno extension, and registers it for Chrome and Edge. native-host speaks Chrome's protocol on stdin/stdout
// (a 4-byte length, then JSON). It signs with ssh-keygen and the user's own key; only the signature goes back.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { EXTENSION_ID, githubKeys, githubUser, HOSTED_GATEWAY_URL, keyHash, SIGNING_NAMESPACE } from "@sereno/shared";

export const HOST_NAME = "com.sereno.ak";
const SSH_KEYGEN = process.env.AK_SSH_KEYGEN ?? "ssh-keygen";
const DIR = join(homedir(), ".sereno");

/// Registers the helper. Returns lines to print.
export function connect(entry: string): string[] {
  mkdirSync(DIR, { recursive: true });
  // From npm (one bundled ESM file, in npx's cache that can be cleared): keep a copy. From the repo (bun + sources):
  // point at the sources.
  const fromSource = entry.endsWith(".ts");
  const self = fromSource ? entry : join(DIR, "ak.mjs");
  if (!fromSource && entry !== self) copyFileSync(entry, self);
  const runtime = fromSource ? "bun" : "node";
  const win = platform() === "win32";
  const launcher = join(DIR, win ? "ak-host.bat" : "ak-host.sh");
  writeFileSync(launcher, win ? `@echo off\r\n${runtime} "${self}" native-host %*\r\n` : `#!/bin/sh\nexec ${runtime} "${self}" native-host "$@"\n`);
  if (!win) chmodSync(launcher, 0o755);
  const manifest = { name: HOST_NAME, description: "Sereno: sign with your own SSH key", path: launcher, type: "stdio", allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] };
  const out = [`helper: ${launcher}`];
  if (win) {
    const file = join(DIR, `${HOST_NAME}.json`);
    writeFileSync(file, JSON.stringify(manifest, null, 2));
    for (const browser of ["Google\\Chrome", "Microsoft\\Edge", "BraveSoftware\\Brave-Browser"]) {
      const r = spawnSync("reg", ["add", `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", file, "/f"], { encoding: "utf8" });
      out.push(`${browser.split("\\").pop()}: ${r.status === 0 ? "registered" : `failed (${(r.stderr || "").trim()})`}`);
    }
  } else {
    const dirs =
      platform() === "darwin"
        ? ["Library/Application Support/Google/Chrome/NativeMessagingHosts", "Library/Application Support/Microsoft Edge/NativeMessagingHosts", "Library/Application Support/Chromium/NativeMessagingHosts"]
        : [".config/google-chrome/NativeMessagingHosts", ".config/chromium/NativeMessagingHosts", ".config/microsoft-edge/NativeMessagingHosts"];
    for (const d of dirs) {
      mkdirSync(join(homedir(), d), { recursive: true });
      writeFileSync(join(homedir(), d, `${HOST_NAME}.json`), JSON.stringify(manifest, null, 2));
      out.push(`registered: ~/${d}`);
    }
  }
  out.push(`allowed extension: ${EXTENSION_ID}`, "Open the Sereno extension → Settings → Use my own SSH key.");
  return out;
}

// ---- the host ----

async function keysOnGithub(login: string): Promise<string[]> {
  const res = await fetch(`${HOSTED_GATEWAY_URL}/lookup/${encodeURIComponent(login)}`).catch(() => null);
  if (res?.ok) return ((await res.json()) as { keys: string[] }).keys;
  return githubKeys((await githubUser(login)).id);
}

/// The key in ~/.ssh whose public half is on the profile (security keys last). A .pub means "use ssh-agent".
function findKey(onGithub: string[]): { file: string; type: string; line: string } | null {
  const dir = join(homedir(), ".ssh");
  const want = new Set(onGithub.map((l) => l.split(" ").slice(0, 2).join(" ")));
  const found: { file: string; type: string; line: string }[] = [];
  for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".pub")) : []) {
    const line = readFileSync(join(dir, f), "utf8").trim();
    const [type = "", blob = ""] = line.split(/\s+/);
    if (!want.has(`${type} ${blob}`)) continue;
    const priv = join(dir, f.slice(0, -4));
    found.push({ file: existsSync(priv) ? priv : join(dir, f), type, line });
  }
  found.sort((a, b) => Number(a.type.startsWith("sk-")) - Number(b.type.startsWith("sk-")));
  return found[0] ?? null;
}

function fingerprint(file: string): string {
  const r = spawnSync(SSH_KEYGEN, ["-lf", file.endsWith(".pub") ? file : `${file}.pub`], { encoding: "utf8" });
  return (r.stdout || "").trim().split(/\s+/)[1] ?? "";
}

function sign(text: string, file: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ak-host-"));
  try {
    const f = join(dir, "message.txt");
    writeFileSync(f, text);
    // stdin closed and stdout captured: stdout is the protocol channel. A phone or security key shows its own
    // prompt (Windows Hello / the QR dialog); a passphrase-protected key must be in ssh-agent.
    let r = spawnSync(SSH_KEYGEN, ["-Y", "sign", "-n", SIGNING_NAMESPACE, "-O", "hashalg=sha256", "-f", file, f], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    if (r.status !== 0 && !existsSync(`${f}.sig`)) r = spawnSync(SSH_KEYGEN, ["-Y", "sign", "-n", SIGNING_NAMESPACE, "-f", file, f], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    if (!existsSync(`${f}.sig`)) throw new Error(`ssh-keygen didn't sign: ${(r.stderr || "").trim().split("\n").pop()}`);
    return readFileSync(`${f}.sig`, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function answer(msg: { op?: string; text?: string; login?: string }): Promise<object> {
  if (msg.op === "ping") return { ok: true };
  const login = msg.login ?? "";
  if (msg.op === "info") {
    if (!login) {
      const keys = existsSync(join(homedir(), ".ssh")) ? readdirSync(join(homedir(), ".ssh")).filter((n) => n.endsWith(".pub")) : [];
      return { keys: keys.length };
    }
    const k = findKey(await keysOnGithub(login));
    return k ? { key: `${k.type} (${k.file.split(/[\\/]/).pop()})`, fingerprint: fingerprint(k.file), keyHash: keyHash(k.line), listed: true } : { error: `no key in ~/.ssh is on ${login}'s GitHub profile` };
  }
  if (msg.op === "sign") {
    if (!msg.text?.startsWith("sereno v1\n")) return { error: "only Sereno texts are signed" };
    const k = findKey(await keysOnGithub(login));
    if (!k) return { error: `no key in ~/.ssh is on ${login}'s GitHub profile` };
    return { signature: sign(msg.text, k.file), key: k.type };
  }
  return { error: `unknown op ${msg.op}` };
}

/// Runs the host until the browser closes stdin.
export async function nativeHost(): Promise<void> {
  let buf = Buffer.alloc(0);
  const write = (o: object) => {
    const body = Buffer.from(JSON.stringify(o), "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32LE(body.length, 0);
    process.stdout.write(Buffer.concat([len, body]));
  };
  process.stdin.on("data", async (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const n = buf.readUInt32LE(0);
      if (buf.length < 4 + n) break;
      const msg = JSON.parse(buf.subarray(4, 4 + n).toString("utf8"));
      buf = buf.subarray(4 + n);
      try {
        write(await answer(msg));
      } catch (e) {
        write({ error: (e as Error).message });
      }
    }
  });
  await new Promise<void>((r) => process.stdin.on("end", () => r()));
}
