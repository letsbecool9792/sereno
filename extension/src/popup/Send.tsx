import { useEffect, useState } from "react";
import type { ChainKey } from "@sereno/shared";
import type { Prepared } from "../wallet";
import { call, chainName, Err, Icon, openTab, PasswordInput, short, usdc, type State } from "./lib";

/// Send → Review (the exact signed text) → Sent. `initial` comes from a GitHub button (#send?to=octocat&amount=5).
export function Send({ state, initial, done }: { state: State; initial: URLSearchParams; done: () => void }) {
  const [to, setTo] = useState(initial.get("to") ?? "");
  const [chain, setChain] = useState<ChainKey>((initial.get("chain") as ChainKey) || "base-sepolia");
  const [amount, setAmount] = useState(initial.get("amount") ?? "1");
  const [fee, setFee] = useState(state.settings.fee);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<{ url: string } | null>(null);
  const [native, setNative] = useState(false);
  const [signWith, setSignWith] = useState<"browser" | "native">("browser");
  useEffect(() => {
    call<{ connected: boolean; key?: string }>("nativeInfo").then((n) => setNative(n.connected && !!n.key), () => {});
  }, []);

  async function review(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy("Checking…");
    try {
      setPrep(await call<Prepared>("prepare", { to, chain, amount, fee }));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function confirm() {
    if (!prep) return;
    setErr(null);
    setBusy(signWith === "native" ? "Approve on your key…" : "Signing and sending…");
    try {
      setSent(await call<{ url: string }>(signWith === "native" ? "nativeSend" : "send", { prepared: prep, password: pw }));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (sent)
    return (
      <main>
        <div className="center">
          <div className="check"><Icon name="check" size={28} /></div>
          <h2>Sent</h2>
          <p className="muted">{usdc(prep!.amount)} USDC to {prep!.payee.login ? `@${prep!.payee.login}` : short(prep!.payee.address)}</p>
          <button className="secondary" onClick={() => openTab(sent.url)}>View transaction <Icon name="ext" /></button>
          <button className="ghost" onClick={done}>Done</button>
        </div>
      </main>
    );

  if (prep) {
    const p = prep.payee;
    return (
      <main>
        <span className="eyebrow">Review</span>
        <div className="card brass">
          <div className="row">
            {p.avatarUrl ? <img className="avatar lg" src={p.avatarUrl} alt="" /> : <div className="dot"><Icon name="wallet" /></div>}
            <div className="grow">
              <h3>{p.login ? `@${p.login}` : short(p.address)}</h3>
              <span className="small muted">{p.name ?? ""}{p.githubId ? ` · GitHub #${p.githubId}` : ""}</span>
            </div>
          </div>
          <div className="big">{usdc(prep.amount)}<small>USDC on {chainName(prep.chain)}</small></div>
          <span className="small muted">Relayer fee {usdc(prep.fee)} · to {short(p.address)}</span>
        </div>
        <label>You sign exactly this<pre className="signed">{prep.text}</pre></label>
        {prep.blockers.map((b) => (
          <div key={b} className="notice err">{b}</div>
        ))}
        {native && !prep.blockers.length && (
          <div className="segmented">
            <button type="button" className={signWith === "browser" ? "on" : ""} onClick={() => setSignWith("browser")}>Browser key</button>
            <button type="button" className={signWith === "native" ? "on" : ""} onClick={() => setSignWith("native")}>My SSH key</button>
          </div>
        )}
        {prep.needsPassword && signWith === "browser" && !prep.blockers.length && (
          <label>Over {state.settings.confirmAbove} USDC: password again<PasswordInput value={pw} onChange={setPw} /></label>
        )}
        <Err e={err} />
        <div className="row">
          <button className="secondary" onClick={() => setPrep(null)} disabled={!!busy}>Back</button>
          <button className="grow" onClick={confirm} disabled={!!busy || prep.blockers.length > 0 || (prep.needsPassword && signWith === "browser" && !pw)}>{busy ?? "Confirm and send"}</button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <form className="stack" onSubmit={review}>
        <h2>Send</h2>
        <label>To<input autoFocus placeholder="GitHub username, name.sereno.eth or 0x…" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} /></label>
        <div className="segmented">
          {(["base-sepolia", "arbitrum-sepolia"] as ChainKey[]).map((k) => (
            <button type="button" key={k} className={chain === k ? "on" : ""} onClick={() => setChain(k)}>{chainName(k)}</button>
          ))}
        </div>
        <label>Amount (USDC)<input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <div className="chips">
          {["1", "5", "10", "25"].map((q) => (
            <button type="button" key={q} className={`chip ${amount === q ? "on" : ""}`} onClick={() => setAmount(q)}>{q}</button>
          ))}
        </div>
        <details>
          <summary>Relayer fee: {fee} USDC</summary>
          <input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} style={{ marginTop: 8 }} />
        </details>
        <Err e={err} />
        <button className="block" disabled={!!busy || !to.trim() || !(Number(amount) > 0)}>{busy ?? "Review"}</button>
        <button type="button" className="ghost" onClick={() => openTab(`${state.payUrl}/?user=${encodeURIComponent(to.replace(/^@/, ""))}${amount ? `&amount=${amount}` : ""}#pay`)}>
          Pay from another wallet instead <Icon name="ext" size={13} />
        </button>
      </form>
    </main>
  );
}
