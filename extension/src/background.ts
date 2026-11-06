// Service worker: the vault, signing, automations and every network call. The popup and the GitHub content script
// talk to it with chrome.runtime messages; the pay page may only send a wallet link (externally_connectable), which
// is checked against the wallet's own signature. No web page can ask it to sign anything.
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { CHAINS, HOSTED_PAY_URL, HOSTED_RELAYER_URL, keyHash, type ChainKey } from "@sereno/shared";
import { loginOfId, lookup, relay } from "./api";
import { describeRule, runAutomations } from "./automations";
import { account, accountOf, keyStatus, keysOf } from "./chain";
import { csv, scan } from "./history";
import { nativeInfo, nativeSign } from "./native";
import { blobHash, unb64 } from "./sshsig";
import { getProfile, getRules, getSettings, getWallets, setProfile, setRules, setSettings, setWallets, type Rule, type Settings } from "./store";
import { autoLock, checkPassword, createVault, isUnlocked, lock, passwordProblem, passwordRules, touch, unlock, unlockWaitUntil, vaultFile, wipe } from "./vault";
import { claimEscrow, claimName, prepare, requestSync, resolvePayee, send, syncStatus, type Prepared } from "./wallet";

// ---- JSON-RPC for the content script (public RPCs, with fallbacks) ----
let rpcId = 0;
async function rpc(chain: ChainKey, method: string, params: unknown): Promise<unknown> {
  const c = CHAINS[chain];
  if (!c) throw new Error(`unknown chain ${chain}`);
  let last = "no RPC answered";
  for (const url of [c.rpc, ...c.fallbackRpcs]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params: params ?? [] }),
        signal: AbortSignal.timeout(10_000),
      });
      const j = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (j.error) {
        last = j.error.message ?? "RPC error";
        if (/revert/i.test(last)) throw Object.assign(new Error(last), { final: true });
        continue;
      }
      return j.result;
    } catch (e) {
      if ((e as { final?: boolean }).final) throw e;
      last = (e as Error).message;
    }
  }
  throw new Error(last);
}

/// The popup page, as a small window next to GitHub (used by the content script's buttons).
async function openWindow(route: string) {
  await chrome.windows.create({ url: chrome.runtime.getURL(`popup.html#${route}`), type: "popup", width: 400, height: 680 });
}

const linkText = (githubId: string, account: string, wallet: string) =>
  `Sereno: forward payments from github-id ${githubId} (account ${account.toLowerCase()}) to ${wallet.toLowerCase()}`;

async function requirePassword(password: string | undefined) {
  if (!password || !(await checkPassword(password))) throw new Error("Password needed");
}

async function setMe(login: string, id?: string) {
  const p = await lookup(login, true);
  const githubId = id ?? p.id;
  await setProfile({ login: p.login, githubId, account: await accountOf(BigInt(githubId)), avatarUrl: p.avatarUrl });
}

type Msg = { type: string; [k: string]: unknown };

async function handle(m: Msg): Promise<unknown> {
  switch (m.type) {
    // content script
    case "rpc":
      return rpc(m.chain as ChainKey, m.method as string, m.params);
    case "relayCommit": {
      const res = await fetch(`${HOSTED_RELAYER_URL}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: m.repo, sha: m.sha }),
        signal: AbortSignal.timeout(90_000),
      });
      const out = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok || !out.url) throw new Error(out.message ?? `relayer answered ${res.status}`);
      return { url: out.url };
    }
    case "login":
      return loginOfId(String(m.id));
    case "open":
      return openWindow(String(m.route ?? "home"));
    case "badges":
      return (await getSettings()).badges;
    case "syncLogin":
      // Anyone may ask the oracle to mirror a GitHub user's keys (it only copies GitHub); 60 s cooldown per user.
      return requestSync(String(m.login));
    case "bountyPayout":
      return relay("/bounty", { chainId: Number(m.chainId), repo: String(m.repo), issue: String(m.issue) });
    case "lookup":
      return lookup(String(m.login), true);
    case "keyHash":
      return keyHash(String(m.line));
    case "me":
      return getProfile();

    // popup: state and vault
    case "state": {
      const vault = await vaultFile();
      return {
        hasVault: !!vault,
        unlocked: await isUnlocked(),
        profile: await getProfile(),
        settings: await getSettings(),
        publicKey: vault?.publicKey ?? null,
        keyHash: vault ? blobHash(unb64(vault.blob)) : null,
        extensionId: chrome.runtime.id,
        payUrl: HOSTED_PAY_URL,
        waitUntil: await unlockWaitUntil(),
      };
    }
    case "passwordProblem":
      return passwordProblem(String(m.password ?? ""));
    case "passwordRules":
      return passwordRules(String(m.password ?? ""));
    case "forgetKey":
      // Forgot the password: drop this browser's encrypted key and start over. Nothing is lost (the money belongs to the
      // GitHub ID); the old key should be deleted on GitHub too.
      await wipe();
      await setProfile(null);
      return true;
    case "create":
      return (await createVault(String(m.password))).publicKey;
    case "unlock":
      await unlock(String(m.password));
      void runAutomations();
      return true;
    case "lock":
      await lock();
      return true;
    case "wipe":
      await requirePassword(m.password as string);
      await wipe();
      await setProfile(null);
      return true;

    // connecting GitHub
    case "connectManual":
      await setMe(String(m.login));
      return getProfile();
    case "keyOnGithub": {
      const p = await getProfile();
      const vault = await vaultFile();
      if (!p || !vault) return false;
      const mine = vault.publicKey.split(" ").slice(0, 2).join(" ");
      return (await lookup(p.login, true)).keys.some((k) => k.split(" ").slice(0, 2).join(" ") === mine);
    }
    case "sync": {
      const p = await getProfile();
      if (!p) throw new Error("Connect GitHub first");
      return requestSync(p.login);
    }
    case "syncStatus": {
      const p = await getProfile();
      const vault = await vaultFile();
      if (!p || !vault) return null;
      const [job, chains] = await Promise.all([syncStatus(p.githubId).catch(() => null), keyStatus(BigInt(p.githubId), blobHash(unb64(vault.blob)))]);
      return { job, chains: chains.map((c) => ({ key: c.key, firstSeen: c.firstSeen.toString() })) };
    }

    // home
    case "overview": {
      const p = await getProfile();
      if (!p) return null;
      const vault = await vaultFile();
      const kh = vault ? blobHash(unb64(vault.blob)) : null;
      const [acct, chains, onchain] = await Promise.all([
        account(BigInt(p.githubId)),
        kh ? keyStatus(BigInt(p.githubId), kh) : Promise.resolve([]),
        keysOf("base-sepolia", BigInt(p.githubId)).catch(() => [] as readonly Hex[]),
      ]);
      return {
        address: acct.address,
        balances: acct.balances.map((b) => ({ key: b.key, units: b.units.toString() })),
        browserKey: chains.map((c) => ({ key: c.key, firstSeen: c.firstSeen.toString() })),
        keyCount: onchain.length,
      };
    }
    case "resolve":
      return resolvePayee(String(m.to));
    case "prepare": {
      await touch();
      const s = await getSettings();
      return prepare({ to: String(m.to), chain: m.chain as ChainKey, amount: String(m.amount), fee: String(m.fee ?? s.fee), confirmAbove: s.confirmAbove });
    }
    case "send": {
      await touch();
      const p = m.prepared as Prepared;
      if (p.needsPassword) await requirePassword(m.password as string);
      return send(p);
    }
    case "history": {
      const rows = await scan();
      return m.csv ? csv(rows) : rows;
    }
    case "claimName":
      await touch();
      return claimName();
    case "claimEscrow":
      await touch();
      return claimEscrow(m.chain as ChainKey, String(m.id));

    // settings, wallets, rules (anything that widens what automations can do needs the password)
    case "settings": {
      const patch = (m.patch ?? {}) as Partial<Settings>;
      const cur = await getSettings();
      const widens =
        (patch.automations === true && !cur.automations) ||
        (patch.dailyCap !== undefined && Number(patch.dailyCap) > Number(cur.dailyCap)) ||
        (patch.confirmAbove !== undefined && Number(patch.confirmAbove) > Number(cur.confirmAbove)) ||
        (patch.autoLockMin !== undefined && patch.autoLockMin > cur.autoLockMin);
      if (widens) await requirePassword(m.password as string);
      return setSettings(patch);
    }
    case "wallets":
      return getWallets();
    case "removeWallet": {
      const w = (await getWallets()).filter((x) => x.address.toLowerCase() !== String(m.address).toLowerCase());
      await setWallets(w);
      const rules = (await getRules()).map((r) => (r.type === "sweep" && r.to.toLowerCase() === String(m.address).toLowerCase() ? { ...r, enabled: false } : r));
      await setRules(rules);
      return w;
    }
    case "linkUrl": {
      const p = await getProfile();
      if (!p) throw new Error("Connect GitHub first");
      const q = new URLSearchParams({ ext: chrome.runtime.id, id: p.githubId, account: p.account });
      return `${HOSTED_PAY_URL}/?${q}#link-wallet`;
    }
    case "rules":
      return (await getRules()).map((r) => ({ ...r, summary: describeRule(r) }));
    case "saveRule": {
      await requirePassword(m.password as string);
      const r = m.rule as Rule;
      if (r.type === "sweep" && !(await getWallets()).some((w) => w.address.toLowerCase() === r.to.toLowerCase())) throw new Error("Sweeps only go to a linked wallet");
      const rules = (await getRules()).filter((x) => x.id !== r.id);
      rules.push({ ...r, errors: 0, lastError: undefined });
      await setRules(rules);
      void runAutomations();
      return true;
    }
    case "toggleRule": {
      const rules = await getRules();
      const r = rules.find((x) => x.id === m.id);
      if (!r) throw new Error("No such rule");
      if (!r.enabled) await requirePassword(m.password as string);
      r.enabled = !r.enabled;
      r.errors = 0;
      await setRules(rules);
      void runAutomations();
      return true;
    }
    case "deleteRule":
      await setRules((await getRules()).filter((x) => x.id !== m.id));
      return true;
    case "payee": {
      // For recurring rules: resolve a username to its ID (stored), refusing a recently renamed one.
      const p = await lookup(String(m.login));
      return { githubId: p.id, login: p.login, avatarUrl: p.avatarUrl };
    }

    // native helper (`npx sereno-ak connect`)
    case "nativeInfo":
      return nativeInfo();
    case "nativeSend": {
      await touch();
      const p = m.prepared as Prepared;
      const me = await getProfile();
      if (!me) throw new Error("Connect GitHub first");
      const signature = await nativeSign(p.text, me.login);
      const res = await fetch(`${HOSTED_RELAYER_URL}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: CHAINS[p.chain].chain.id, githubId: me.githubId, token: p.token, to: p.payee.address, amount: p.amount, fee: p.fee, signature }),
      });
      const out = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok || !out.url) throw new Error(out.message ?? `relayer answered ${res.status}`);
      return out;
    }
  }
  throw new Error(`unknown message ${m.type}`);
}

chrome.runtime.onMessage.addListener((m: Msg, _sender, reply) => {
  handle(m).then(
    (result) => reply({ result }),
    (e: Error) => reply({ error: e.message.split("\n")[0] }),
  );
  return true;
});

// The pay page's #link-wallet sends {wallet, signature}; only that origin can (externally_connectable), and the
// signature must be the wallet's over the exact link text for this GitHub ID and account.
chrome.runtime.onMessageExternal.addListener((m: Msg, sender, reply) => {
  void (async () => {
    try {
      const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : "");
      if (origin !== new URL(HOSTED_PAY_URL).origin && !/^http:\/\/localhost:\d+$/.test(origin)) throw new Error("not allowed");
      if (m.type !== "linkWallet" || !isAddress(String(m.wallet))) throw new Error("bad request");
      const p = await getProfile();
      if (!p) throw new Error("Connect GitHub in the extension first");
      const wallet = getAddress(String(m.wallet));
      const ok = await verifyMessage({ address: wallet, message: linkText(p.githubId, p.account, wallet), signature: m.signature as Hex });
      if (!ok) throw new Error("The signature isn't from that wallet");
      const ws = (await getWallets()).filter((w) => w.address !== wallet);
      ws.push({ address: wallet, signature: m.signature as Hex, linkedAt: Date.now() });
      await setWallets(ws);
      reply({ result: { linked: wallet } });
    } catch (e) {
      reply({ error: (e as Error).message });
    }
  })();
  return true;
});

// One alarm a minute: auto-lock when idle, then automations.
chrome.alarms.create("tick", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== "tick") return;
  const s = await getSettings();
  await autoLock(s.autoLockMin);
  await runAutomations();
});
chrome.runtime.onStartup.addListener(() => void lock());
