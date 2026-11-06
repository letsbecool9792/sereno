// Automations: sweep to a linked wallet, recurring payments by GitHub ID. Anything that widens what runs unattended
// asks for the password.
import { useEffect, useState } from "react";
import type { ChainKey } from "@sereno/shared";
import type { LinkedWallet, Rule } from "../store";
import { call, chainName, Err, Icon, openTab, PasswordInput, short, Spinner, toast, type State } from "./lib";

type ShownRule = Rule & { summary: string };

export function Auto({ state, refresh }: { state: State; refresh: () => void }) {
  const [rules, setRules] = useState<ShownRule[]>([]);
  const [wallets, setWallets] = useState<LinkedWallet[]>([]);
  const [adding, setAdding] = useState<null | "sweep" | "recurring">(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    call<ShownRule[]>("rules").then(setRules, () => {});
    call<LinkedWallet[]>("wallets").then(setWallets, () => {});
  };
  useEffect(load, []);
  const s = state.settings;

  async function setting(patch: Record<string, unknown>) {
    setErr(null);
    try {
      await call("settings", { patch, password: pw });
      toast(patch.automations === true ? "Automations on" : patch.automations === false ? "Automations off" : "Saved");
      refresh();
    } catch (e) {
      setErr((e as Error).message === "Password needed" ? "Enter your password below first" : (e as Error).message);
    }
  }
  async function toggle(r: ShownRule) {
    setErr(null);
    try {
      await call("toggleRule", { id: r.id, password: pw });
      toast(r.enabled ? "Rule paused" : "Rule on");
      load();
    } catch (e) {
      setErr((e as Error).message === "Password needed" ? "Enter your password below to turn a rule on" : (e as Error).message);
    }
  }

  if (adding) return <RuleForm kind={adding} wallets={wallets} done={() => { setAdding(null); load(); }} />;

  return (
    <main>
      <h2>Automations</h2>
      <div className="card">
        <label className="toggle">
          Run automations
          <input type="checkbox" checked={s.automations} onChange={(e) => setting({ automations: e.target.checked })} />
        </label>
        <p className="small muted">They sign while this browser runs and the vault is unlocked (auto-lock: {s.autoLockMin} min). Daily cap {s.dailyCap} USDC.</p>
        <div className="row">
          <label className="grow">Daily cap (USDC)<input type="number" min="0" defaultValue={s.dailyCap} onBlur={(e) => e.target.value !== s.dailyCap && setting({ dailyCap: e.target.value })} /></label>
          <label className="grow">Auto-lock (min)<input type="number" min="1" defaultValue={s.autoLockMin} onBlur={(e) => Number(e.target.value) !== s.autoLockMin && setting({ autoLockMin: Number(e.target.value) })} /></label>
        </div>
      </div>

      <div className="card">
        <div className="between">
          <span className="eyebrow">Linked wallets</span>
          <button className="ghost sm" onClick={async () => openTab(await call<string>("linkUrl"))}><Icon name="wallet" /> Link a wallet</button>
        </div>
        {wallets.length === 0 && <p className="small muted">Link MetaMask (or any wallet) by signing a message from it on the pay page. Sweeps only go to linked wallets.</p>}
        {wallets.map((w) => (
          <div key={w.address} className="between">
            <span className="addr">{short(w.address)}</span>
            <button className="ghost sm" onClick={async () => { await call("removeWallet", { address: w.address }); toast("Wallet unlinked"); load(); }}><Icon name="x" size={13} /></button>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="between">
          <span className="eyebrow">Rules</span>
          <div className="row">
            <button className="ghost sm" onClick={() => setAdding("sweep")} disabled={!wallets.length} title={wallets.length ? "" : "Link a wallet first"}>+ Sweep</button>
            <button className="ghost sm" onClick={() => setAdding("recurring")}>+ Recurring</button>
          </div>
        </div>
        {rules.length === 0 && <p className="small muted">No rules yet.</p>}
        {rules.map((r) => (
          <div key={r.id} className="stack" style={{ gap: 4 }}>
            <div className="between">
              <span style={{ fontWeight: 500 }}>{r.summary}</span>
              <label className="toggle"><input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} /></label>
            </div>
            {r.lastError && <span className="small err">{(r.errors ?? 0) >= 3 ? "Stopped after 3 errors: " : ""}{r.lastError}</span>}
            <div className="row">
              <span className="small faint grow">{r.type === "recurring" ? `${r.runs} run${r.runs === 1 ? "" : "s"}${r.enabled ? `, next ${new Date(r.nextRun).toLocaleString()}` : ""}` : r.lastRun ? `checked ${new Date(r.lastRun).toLocaleTimeString()}` : ""}</span>
              <button className="ghost sm" onClick={async () => { await call("deleteRule", { id: r.id }); toast("Rule deleted"); load(); }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      <label>Password (to turn things on or raise limits)<PasswordInput value={pw} onChange={setPw} /></label>
      <Err e={err} />
    </main>
  );
}

function RuleForm({ kind, wallets, done }: { kind: "sweep" | "recurring"; wallets: LinkedWallet[]; done: () => void }) {
  const [chain, setChain] = useState<ChainKey>("base-sepolia");
  const [to, setTo] = useState(wallets[0]?.address ?? "");
  const [keep, setKeep] = useState("0");
  const [min, setMin] = useState("1");
  const [login, setLogin] = useState("");
  const [amount, setAmount] = useState("5");
  const [every, setEvery] = useState(kind === "sweep" ? "15" : "43200");
  const [maxRuns, setMaxRuns] = useState("12");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const id = crypto.randomUUID().slice(0, 8);
      let rule: Rule;
      if (kind === "sweep") rule = { id, type: "sweep", chain, to: to as `0x${string}`, keep, minAmount: min, everyMin: Number(every), enabled: true };
      else {
        const payee = await call<{ githubId: string; login: string }>("payee", { login: login.replace(/^@/, "") });
        rule = { id, type: "recurring", chain, toGithubId: payee.githubId, toLogin: payee.login, amount, everyMin: Number(every), maxRuns: Number(maxRuns) || undefined, runs: 0, nextRun: Date.now(), enabled: true };
      }
      await call("saveRule", { rule, password: pw });
      toast("Rule saved");
      done();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <form className="stack" onSubmit={save}>
        <h2>{kind === "sweep" ? "Sweep to my wallet" : "Recurring payment"}</h2>
        <div className="segmented">
          {(["base-sepolia", "arbitrum-sepolia"] as ChainKey[]).map((k) => (
            <button type="button" key={k} className={chain === k ? "on" : ""} onClick={() => setChain(k)}>{chainName(k)}</button>
          ))}
        </div>
        {kind === "sweep" ? (
          <>
            <label>To (a linked wallet)<select value={to} onChange={(e) => setTo(e.target.value)}>{wallets.map((w) => <option key={w.address} value={w.address}>{w.address}</option>)}</select></label>
            <div className="row">
              <label className="grow">Keep (USDC)<input type="number" min="0" value={keep} onChange={(e) => setKeep(e.target.value)} /></label>
              <label className="grow">At least (USDC)<input type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} /></label>
            </div>
            <label>Check every (minutes)<input type="number" min="1" value={every} onChange={(e) => setEvery(e.target.value)} /></label>
          </>
        ) : (
          <>
            <label>To (GitHub username; stored by ID)<input value={login} onChange={(e) => setLogin(e.target.value.trim())} placeholder="octocat" /></label>
            <div className="row">
              <label className="grow">Amount (USDC)<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <label className="grow">Times<input type="number" min="1" value={maxRuns} onChange={(e) => setMaxRuns(e.target.value)} /></label>
            </div>
            <div className="chips">
              {[["Daily", "1440"], ["Weekly", "10080"], ["Monthly", "43200"], ["Every 5 min (demo)", "5"]].map(([l, v]) => (
                <button type="button" key={v} className={`chip ${every === v ? "on" : ""}`} onClick={() => setEvery(v!)}>{l}</button>
              ))}
            </div>
          </>
        )}
        <label>Password<PasswordInput value={pw} onChange={setPw} /></label>
        <div className="row">
          <button type="button" className="ghost" onClick={done}>Cancel</button>
          <button className="grow" disabled={busy || !pw || (kind === "recurring" && !login)}>{busy ? <><Spinner /> Saving…</> : "Save rule"}</button>
        </div>
        <Err e={err} />
      </form>
    </main>
  );
}
