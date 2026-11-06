// Automations (EXTENSION_DESIGN.md §5): sweeps to a linked wallet and recurring payments. They sign without the user
// present, so they run only while the vault is unlocked and the browser runs; each run is a fresh signature over the
// current nonce. Guardrails are enforced here, not on-chain: allowlisted destinations, a per-rule amount, a daily cap,
// a 3-error stop. Missed runs execute once, not once per missed interval.
import { formatUnits, parseUnits } from "viem";
import { CHAINS, INSTANT_LIMIT, NEW_KEY_DELAY_SECONDS } from "@sereno/shared";
import { accountOf, keyStatus, usdcBalance } from "./chain";
import { blobHash, unb64 } from "./sshsig";
import { addSpent, getProfile, getRules, getSettings, getWallets, setRules, spentToday, type Rule } from "./store";
import { isUnlocked, vaultFile } from "./vault";
import { prepare, send } from "./wallet";

const MAX_ERRORS = 3;

async function badge() {
  const rules = await getRules();
  const s = await getSettings();
  const active = s.automations && rules.some((r) => r.enabled);
  const broken = rules.some((r) => (r.errors ?? 0) >= MAX_ERRORS);
  const locked = !(await isUnlocked());
  const text = broken ? "!" : active && locked ? "off" : "";
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: broken ? "#ff8b80" : "#2b59ff" });
}

/// One pass over the rules. Called from the minute alarm.
export async function runAutomations(): Promise<void> {
  const s = await getSettings();
  await badge();
  if (!s.automations || !(await isUnlocked())) return;
  const profile = await getProfile();
  const vault = await vaultFile();
  if (!profile || !vault) return;
  const rules = await getRules();
  const wallets = new Set((await getWallets()).map((w) => w.address.toLowerCase()));
  const cap = parseUnits(s.dailyCap || "0", 6);
  const fee = parseUnits(s.fee || "0.02", 6);
  const now = Date.now();
  let changed = false;

  for (const r of rules) {
    if (!r.enabled || (r.errors ?? 0) >= MAX_ERRORS) continue;
    try {
      if (r.type === "sweep") {
        if (r.lastRun && now - r.lastRun < r.everyMin * 60_000) continue;
        r.lastRun = now;
        changed = true;
        if (!wallets.has(r.to.toLowerCase())) throw new Error("destination isn't a linked wallet");
        const balance = await usdcBalance(r.chain, profile.account);
        const keep = parseUnits(r.keep || "0", 6);
        let amount = balance - keep - fee;
        if (amount < parseUnits(r.minAmount || "0", 6) || amount <= 0n) continue;
        // A key under 72 h old moves at most 50 USDC per payment; the rest goes on the next runs.
        const firstSeen = (await keyStatus(BigInt(profile.githubId), blobHash(unb64(vault.blob)))).find((k) => k.key === r.chain)?.firstSeen ?? 0n;
        if (BigInt(Math.floor(now / 1000)) < firstSeen + BigInt(NEW_KEY_DELAY_SECONDS) && amount > INSTANT_LIMIT) amount = INSTANT_LIMIT;
        const left = cap - (await spentToday());
        if (left <= 0n) throw new Error("daily cap reached");
        if (amount > left) amount = left;
        const p = await prepare({ to: { address: r.to }, chain: r.chain, amount: formatUnits(amount, 6), fee: formatUnits(fee, 6) });
        p.ruleId = r.id;
        await send(p, `sweep to ${r.to.slice(0, 6)}…${r.to.slice(-4)}`);
        await addSpent(amount + fee);
      } else {
        if (now < r.nextRun) continue;
        if ((r.until && now > r.until) || (r.maxRuns && r.runs >= r.maxRuns)) {
          r.enabled = false;
          changed = true;
          continue;
        }
        const amount = parseUnits(r.amount, 6);
        if ((await spentToday()) + amount + fee > cap) throw new Error("daily cap reached");
        // Pay the ID (never the name), so a rename can't redirect it.
        const to = await accountOf(BigInt(r.toGithubId));
        const p = await prepare({ to: { address: to, githubId: r.toGithubId, login: r.toLogin }, chain: r.chain, amount: r.amount, fee: formatUnits(fee, 6) });
        p.ruleId = r.id;
        await send(p, `every ${r.everyMin >= 1440 ? `${Math.round(r.everyMin / 1440)} d` : `${r.everyMin} min`} to @${r.toLogin}`);
        await addSpent(amount + fee);
        r.runs += 1;
        // Missed intervals run once: the next run is a full period from now.
        r.nextRun = now + r.everyMin * 60_000;
        changed = true;
      }
      if (r.errors) {
        r.errors = 0;
        r.lastError = undefined;
        changed = true;
      }
    } catch (e) {
      r.errors = (r.errors ?? 0) + 1;
      r.lastError = (e as Error).message.split("\n")[0]!.slice(0, 160);
      changed = true;
    }
  }
  if (changed) await setRules(rules);
  await badge();
}

export function describeRule(r: Rule): string {
  const every = r.everyMin >= 1440 ? `${Math.round(r.everyMin / 1440)} d` : r.everyMin >= 60 ? `${Math.round(r.everyMin / 60)} h` : `${r.everyMin} min`;
  return r.type === "sweep"
    ? `Sweep ${CHAINS[r.chain].chain.name} to ${r.to.slice(0, 6)}…${r.to.slice(-4)} every ${every}`
    : `${r.amount} USDC to @${r.toLogin} every ${every}`;
}
