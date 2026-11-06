// First run: make the browser key behind a password, put it on the GitHub profile as a signing key, and have the
// Chainlink oracle copy it on-chain. Also the lock screen.
import { useEffect, useState } from "react";
import { call, chainName, copy, Err, Icon, Lantern, openTab, PasswordInput, Steps, type State } from "./lib";

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

export function Lock({ state, onDone }: { state: State; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(state.waitUntil);
  const [now, setNow] = useState(Date.now());
  const [forget, setForget] = useState(false);
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waitUntil]);
  const wait = Math.max(0, Math.ceil((waitUntil - now) / 1000));
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await call("unlock", { password: pw });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
      const s = await call<State>("state").catch(() => null);
      if (s?.waitUntil) setWaitUntil(s.waitUntil);
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <form className="center" onSubmit={go}>
        <Lantern size={64} className="hero-mark" />
        <h2>Welcome back</h2>
        <p className="muted">Unlock to pay. Balances and history work while locked.</p>
        <PasswordInput autoFocus placeholder="Password" value={pw} onChange={setPw} />
        {wait > 0 ? <div className="notice amber">Too many wrong tries. Try again in {wait} s.</div> : <Err e={err} />}
        <button className="block" disabled={busy || !pw || wait > 0}>{busy ? "Unlocking…" : wait > 0 ? `Wait ${wait} s` : "Unlock"}</button>
      </form>
      {!forget ? (
        <button className="ghost" onClick={() => setForget(true)}>Forgot it? Start over with a new key</button>
      ) : (
        <div className="card stack">
          <p className="small">This removes the key from this browser. Your money stays in your account (it belongs to your GitHub ID). Make a new key, and delete the old one at github.com/settings/keys.</p>
          <div className="row">
            <button className="secondary grow" onClick={() => setForget(false)}>Cancel</button>
            <button className="danger grow" onClick={async () => { await call("forgetKey"); onDone(); }}>Start over</button>
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
        <Lantern size={76} className="hero-mark" />
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
        <Err e={err} />
        <button className="block" disabled={busy || !ready}>{busy ? "Making the key…" : "Create key"}</button>
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
          <Err e={err} />
          <button className="block" disabled={busy || !login}>{busy ? "Looking up…" : "Continue"}</button>
        </form>
      ) : (
        <div className="stack">
          <p className="muted small">Add it as a <strong style={{ color: "var(--ink)" }}>Signing Key</strong> (it can't push code or open SSH sessions).</p>
          <div className="pubkey">{state.publicKey}</div>
          <div className="row">
            <button className="secondary grow" onClick={() => copy(state.publicKey ?? "")}><Icon name="copy" /> Copy key</button>
            <button className="grow" onClick={() => { openTab("https://github.com/settings/ssh/new"); setManual("waiting"); }}>Open GitHub <Icon name="ext" /></button>
          </div>
          {manual === "waiting" && <div className="notice amber">Watching your profile for the key…</div>}
          {manual === "added" && <button className="ghost" onClick={() => setManual("waiting")}>I've added it</button>}
        </div>
      )}
    </main>
  );
}

type SyncInfo = { job: { state: string; detail?: string; workerAge?: number | null } | null; chains: { key: "base-sepolia" | "arbitrum-sepolia" | "sepolia"; firstSeen: string }[] };

export function Sync({ state, next, compact }: { state: State; next: () => void; compact?: boolean }) {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = await call<SyncInfo>("syncStatus").catch(() => null);
      if (alive && s) setInfo(s);
    };
    void tick();
    const t = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const all = !!info && info.chains.every((c) => c.firstSeen !== "0");
  useEffect(() => {
    if (all && !compact) setTimeout(next, 900);
  }, [all, compact, next]);
  async function go() {
    setErr(null);
    setAsked(true);
    try {
      await call("sync");
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  const running = info?.job?.state === "queued" || info?.job?.state === "running";
  const Wrap = compact ? "div" : "main";
  return (
    <Wrap className={compact ? "stack" : undefined}>
      {!compact && <span className="eyebrow">Step 3 of 3</span>}
      {!compact && <h2>Put it on-chain</h2>}
      {!compact && <p className="muted small">Chainlink's oracle copies @{state.profile?.login}'s GitHub keys to each chain.</p>}
      <Steps
        items={(info?.chains ?? [{ key: "base-sepolia", firstSeen: "0" }, { key: "arbitrum-sepolia", firstSeen: "0" }, { key: "sepolia", firstSeen: "0" }]).map((c) => ({
          label: c.key === "sepolia" ? "Sepolia (names)" : chainName(c.key),
          state: c.firstSeen !== "0" ? "done" : running || asked ? "now" : "todo",
        }))}
      />
      {info?.job?.state === "failed" && <div className="notice err">{info.job.detail ?? "The sync failed"}</div>}
      {/* Only when the relayer says the worker hasn't asked for jobs in 2 minutes (null = never) and the job still waits.
          "running" means a worker already took it. */}
      {info?.job?.state === "queued" && (info.job.workerAge === null || (info.job.workerAge ?? 0) > 120) && (
        <div className="notice amber">Queued. The sync worker hasn't checked in for a while; it runs when it's back.</div>
      )}
      <Err e={err} />
      {!all && <button className={compact ? "secondary block" : "block"} onClick={go} disabled={running}>{running ? "Syncing…" : "Sync my keys"}</button>}
    </Wrap>
  );
}
