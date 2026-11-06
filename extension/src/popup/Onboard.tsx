// First run: make the browser key behind a password, put it on the GitHub profile as a signing key, and have the
// Chainlink oracle copy it on-chain. Also the lock screen.
import { useEffect, useState } from "react";
import { call, chainName, copyToast, Err, Icon, Mark, openTab, PasswordInput, Spinner, Steps, toast, type State } from "./lib";

/// "Badges on GitHub pages": reachable before setup and while locked (it needs no key).
export function BadgesToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    call<{ settings: { badges: boolean } }>("state").then((s) => setOn(s.settings.badges), () => {});
  }, []);
  if (on === null) return null;
  return (
    <label className="toggle card" style={{ padding: "10px 14px" }}>
      <span>
        Show sereno info on GitHub
        <span className="small muted" style={{ display: "block", fontWeight: 400 }}>Bounties, balances, payment status. Off: only when you click Check</span>
      </span>
      <input type="checkbox" checked={on} onChange={async (e) => { const v = e.target.checked; setOn(v); await call("settings", { patch: { badges: v } }); }} />
    </label>
  );
}

export function Lock({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forget, setForget] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await call("unlock", { password: pw });
      toast("Unlocked");
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <form className="center" onSubmit={go}>
        <Mark size={72} />
        <h2>Welcome back</h2>
        <p className="muted">Unlock to pay. Balances and history work while locked.</p>
        <PasswordInput autoFocus placeholder="Password" value={pw} onChange={(v) => { setPw(v); setErr(null); }} />
        <button className="block" disabled={busy || !pw}>{busy ? <><Spinner /> Unlocking…</> : "Unlock"}</button>
        <Err e={err} />
      </form>
      {!forget ? (
        <button className="ghost" onClick={() => setForget(true)}>Forgot it? Start over with a new key</button>
      ) : (
        <div className="card stack">
          <p className="small">This deletes the key in this browser and makes you a new one. Your money stays in your account (it belongs to your GitHub ID). You'll add the new key to GitHub and sync it; delete the old one at github.com/settings/keys.</p>
          <div className="row">
            <button className="ghost grow" onClick={() => setForget(false)}>Cancel</button>
            <button className="danger grow" onClick={async () => { await call("forgetKey"); toast("Old key removed. Make a new one"); onDone(); }}>Start over</button>
          </div>
        </div>
      )}
      <BadgesToggle />
    </main>
  );
}

export function Onboard({ state, onDone }: { state: State; onDone: () => void }) {
  const stage = !state.hasVault ? "welcome" : !state.profile ? "connect" : "sync";
  const [step, setStep] = useState<"welcome" | "password" | "connect" | "sync">(stage);
  // Stay on the password form only until the key exists; then follow the state (connect, then sync).
  useEffect(() => setStep((s) => (s === "password" && !state.hasVault ? s : stage)), [stage, state.hasVault]);
  return step === "welcome" ? (
    <Welcome state={state} next={() => setStep("password")} />
  ) : step === "password" ? (
    <Password next={() => { setStep("connect"); onDone(); }} />
  ) : step === "connect" ? (
    <Connect state={state} next={onDone} />
  ) : (
    <Sync state={state} next={onDone} />
  );
}

function Welcome({ state, next }: { state: State; next: () => void }) {
  return (
    <main>
      <div className="center">
        <Mark size={88} />
        <h1 style={{ fontSize: 28 }}>Your GitHub is the wallet</h1>
        <p className="muted">Get paid by username. Spend with a key this browser keeps for you.</p>
      </div>
      <div className="card stack">
        <div className="row small muted"><Icon name="key" /> A signing-only key, encrypted with your password</div>
        <div className="row small muted"><Icon name="sync" /> Nothing to back up: the money belongs to your GitHub ID</div>
        <div className="row small muted"><Icon name="lock" /> You confirm the exact text before every payment</div>
      </div>
      <button className="block" onClick={next}>Create a browser key <Icon name="send" /></button>
      <button className="secondary block" onClick={() => openTab(state.payUrl)}>Pay from another wallet</button>
      <BadgesToggle />
    </main>
  );
}

function Password({ next }: { next: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [rules, setRules] = useState<{ label: string; ok: boolean }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call<{ label: string; ok: boolean }[]>("passwordRules", { password: pw }).then(setRules, () => {});
  }, [pw]);
  const all = [...rules, { label: "Both entries match", ok: pw.length > 0 && pw === pw2 }];
  const ready = all.length > 1 && all.every((r) => r.ok);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      await call("create", { password: pw });
      next();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }
  return (
    <main>
      <form className="stack" onSubmit={go}>
        <span className="eyebrow">Step 1 of 3</span>
        <h2>Set a password</h2>
        <p className="muted small">It encrypts the key on this computer. Forgot it? Make a new key; your money stays put.</p>
        <label>Password<PasswordInput autoFocus value={pw} onChange={setPw} /></label>
        <label>Again<PasswordInput value={pw2} onChange={setPw2} /></label>
        <ul className="rules">
          {all.map((r) => (
            <li key={r.label} className={r.ok ? "ok" : ""}>
              <span className="tick">{r.ok && <Icon name="check" size={11} />}</span>
              {r.label}
            </li>
          ))}
        </ul>
        <button className="block" disabled={busy || !ready}>{busy ? <><Spinner /> Making the key…</> : "Create key"}</button>
        <Err e={err} />
      </form>
    </main>
  );
}

function Connect({ state, next }: { state: State; next: () => void }) {
  const [login, setLogin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<null | "added" | "waiting">(null);

  // Manual: watch the profile for the key.
  useEffect(() => {
    if (manual !== "waiting") return;
    const t = setInterval(async () => {
      if (await call<boolean>("keyOnGithub").catch(() => false)) next();
    }, 5000);
    return () => clearInterval(t);
  }, [manual, next]);

  async function useLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await call("connectManual", { login });
      setManual("added");
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <span className="eyebrow">Step 2 of 3</span>
      <h2>Put the key on GitHub</h2>
      {!manual ? (
        <form className="stack" onSubmit={useLogin}>
          <label>Your GitHub username<input autoFocus placeholder="octocat" value={login} onChange={(e) => setLogin(e.target.value.trim())} /></label>
          <button className="block" disabled={busy || !login}>{busy ? <><Spinner /> Looking up…</> : "Continue"}</button>
          <Err e={err} />
        </form>
      ) : (
        <div className="stack">
          <p className="muted small">Add it as a <strong style={{ color: "var(--ink)" }}>Signing Key</strong> (it can't push code or open SSH sessions).</p>
          <div className="pubkey">{state.publicKey}</div>
          <div className="row">
            <button className="secondary grow" onClick={() => copyToast(state.publicKey ?? "", "Key copied")}><Icon name="copy" /> Copy key</button>
            <button className="grow" onClick={() => { openTab("https://github.com/settings/ssh/new"); setManual("waiting"); }}>Open GitHub <Icon name="ext" /></button>
          </div>
          {manual === "waiting" && <div className="status busy"><Spinner /> Watching your GitHub profile for the key (it can take a minute)…</div>}
          {manual === "added" && <button className="ghost" onClick={() => setManual("waiting")}>I've added it</button>}
        </div>
      )}
    </main>
  );
}

type Chain = "base-sepolia" | "arbitrum-sepolia" | "sepolia";
type SyncInfo = { job: { state: string; detail?: string; workerAge?: number | null } | null; chains: { key: Chain; firstSeen: string }[] };
const CHAIN_ORDER: Chain[] = ["base-sepolia", "arbitrum-sepolia", "sepolia"];

/// Putting this browser key on-chain, with every step visible: is the key on GitHub, is the job queued or running
/// (with a timer), which chains are done, and what to do when something's missing.
export function Sync({ state, next, compact }: { state: State; next: () => void; compact?: boolean }) {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [onGithub, setOnGithub] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [s, g] = await Promise.all([call<SyncInfo>("syncStatus").catch(() => null), call<boolean>("keyOnGithub").catch(() => null)]);
      if (!alive) return;
      if (s) setInfo(s);
      if (g !== null) setOnGithub(g);
      setNow(Date.now());
    };
    void tick();
    const t = setInterval(tick, 3000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(c);
    };
  }, []);

  const chains = CHAIN_ORDER.map((k) => ({ key: k, done: (info?.chains.find((c) => c.key === k)?.firstSeen ?? "0") !== "0" }));
  const all = !!info && chains.every((c) => c.done);
  const job = info?.job?.state;
  const active = requesting || job === "queued" || job === "running";
  const finished = !active && startedAt !== null && (job === "done" || job === "failed");
  useEffect(() => {
    if (all && startedAt !== null) toast("On-chain on every chain");
    if (all && !compact) setTimeout(next, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);

  async function go() {
    setErr(null);
    setRequesting(true);
    setStartedAt(Date.now());
    try {
      const r = await call<{ state: string; cooldown?: number }>("sync");
      if (r.cooldown) toast(`Synced a moment ago; the next sync can start in ${r.cooldown} s`, "info");
      else toast("Sync queued");
    } catch (x) {
      setErr((x as Error).message);
      setStartedAt(null);
    } finally {
      setRequesting(false);
    }
  }

  const secs = startedAt ? Math.round((now - startedAt) / 1000) : 0;
  const Wrap = compact ? "div" : "main";
  return (
    <Wrap className={compact ? "stack" : undefined}>
      {!compact && <span className="eyebrow">Step 3 of 3</span>}
      {!compact && <h2>Put it on-chain</h2>}
      {!compact && <p className="muted small">Chainlink's oracle copies @{state.profile?.login}'s GitHub keys to each chain.</p>}

      {onGithub === false && !all && (
        <div className="notice todo stack" style={{ gap: 8 }}>
          <span>This browser key isn't on your GitHub profile yet, so a sync can't copy it. Add it as a <strong>Signing Key</strong>, then sync.</span>
          <div className="row">
            <button className="secondary sm grow" onClick={() => copyToast(state.publicKey ?? "", "Key copied")}><Icon name="copy" /> Copy key</button>
            <button className="sm grow" onClick={() => openTab("https://github.com/settings/ssh/new")}>Open GitHub <Icon name="ext" size={13} /></button>
          </div>
          <span className="small faint">Choose "Signing Key" as the key type. GitHub can take up to a minute to show it here.</span>
        </div>
      )}

      <Steps items={chains.map((c) => ({ label: c.key === "sepolia" ? "Sepolia (names)" : chainName(c.key), state: c.done ? "done" : active ? "now" : "todo" }))} />

      {active && (
        <div className="status busy" aria-live="polite">
          <Spinner />
          <span className="grow">
            {requesting ? "Asking the relayer…" : job === "queued" ? "Queued: waiting for the sync worker…" : "Chainlink is copying your keys on-chain (about 20 s per chain)…"}
          </span>
          {startedAt && <span className="mono small">{secs} s</span>}
        </div>
      )}
      {job === "queued" && (info?.job?.workerAge === null || (info?.job?.workerAge ?? 0) > 120) && (
        <div className="notice todo">The sync worker hasn't checked in for a while. The job runs when it's back.</div>
      )}
      {finished && job === "failed" && <div className="notice err">The sync failed: {info?.job?.detail ?? "unknown error"}. Try again.</div>}
      {finished && job === "done" && !all && (
        <div className="notice">{onGithub === false ? "The sync ran, but this key wasn't on your GitHub profile yet. Add it (above), then sync again." : "The sync ran; some chains don't show the key yet. Try again in a minute."}</div>
      )}
      {all && <div className="status" style={{ color: "var(--ok)" }}><Icon name="check" /> This key can pay on every chain.</div>}
      {!all && (
        <button className={compact ? "secondary block" : "block"} onClick={go} disabled={active}>
          {active ? <><Spinner /> Syncing…</> : finished ? "Sync again" : "Sync my keys"}
        </button>
      )}
      <Err e={err} />
    </Wrap>
  );
}
