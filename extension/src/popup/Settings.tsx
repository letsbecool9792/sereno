import { useEffect, useState } from "react";
import { ENS_DEPLOYMENT } from "@sereno/shared";
import { call, copy, Err, Icon, openTab, type State } from "./lib";

export function Settings({ state, refresh }: { state: State; refresh: () => void }) {
  const [native, setNative] = useState<{ connected: boolean; key?: string; fingerprint?: string; error?: string } | null>(null);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const s = state.settings;
  const p = state.profile!;
  const name = `${p.login.toLowerCase()}.${ENS_DEPLOYMENT?.parentName ?? "sereno.eth"}`;
  useEffect(() => {
    call<typeof native>("nativeInfo").then(setNative, () => {});
  }, []);

  async function setting(patch: Record<string, unknown>) {
    setErr(null);
    try {
      await call("settings", { patch, password: pw });
      refresh();
    } catch (e) {
      setErr((e as Error).message === "Password needed" ? "Raising a limit needs your password (below)" : (e as Error).message);
    }
  }
  async function allowNative() {
    const ok = await chrome.permissions.request({ permissions: ["nativeMessaging"] });
    if (ok) setNative(await call("nativeInfo"));
  }
  async function claim() {
    setErr(null);
    setMsg(`Claiming ${name}…`);
    try {
      const r = await call<{ url: string }>("claimName");
      setMsg(null);
      openTab(r.url);
    } catch (e) {
      setMsg(null);
      setErr((e as Error).message);
    }
  }
  async function remove() {
    setErr(null);
    try {
      await call("wipe", { password: pw });
      openTab("https://github.com/settings/keys");
      refresh();
    } catch (e) {
      setErr((e as Error).message === "Password needed" ? "Enter your password below to remove the key" : (e as Error).message);
    }
  }

  return (
    <main>
      <h2>Settings</h2>
      <div className="card">
        <label className="toggle">
          Badges on GitHub pages
          <input type="checkbox" checked={s.badges} onChange={(e) => setting({ badges: e.target.checked })} />
        </label>
        <p className="small muted">Bounties, balances and payment status as you browse. Off: nothing is looked up until you click.</p>
        <div className="row">
          <label className="grow">Confirm again over (USDC)<input type="number" min="0" defaultValue={s.confirmAbove} onBlur={(e) => e.target.value !== s.confirmAbove && setting({ confirmAbove: e.target.value })} /></label>
          <label className="grow">Default fee (USDC)<input type="number" min="0" step="0.01" defaultValue={s.fee} onBlur={(e) => e.target.value !== s.fee && setting({ fee: e.target.value })} /></label>
        </div>
        <label>Auto-lock after (minutes)<input type="number" min="1" defaultValue={s.autoLockMin} onBlur={(e) => Number(e.target.value) !== s.autoLockMin && setting({ autoLockMin: Number(e.target.value) })} /></label>
      </div>

      <div className="card">
        <span className="eyebrow">Your name</span>
        <div className="between"><span className="name">{name}</span><button className="sm" onClick={claim}>Claim</button></div>
        <p className="small muted">Makes it a real ENSv2 name owned by your account. Signed with this browser key.</p>
        {msg && <div className="notice">{msg}</div>}
      </div>

      <div className="card">
        <span className="eyebrow">Use my own SSH key</span>
        {native?.connected && native.key ? (
          <p className="small ok"><Icon name="check" size={13} /> {native.key} <span className="faint mono">{native.fingerprint}</span></p>
        ) : native?.error === "permission" ? (
          <button className="secondary sm" onClick={allowNative}>Allow the helper</button>
        ) : (
          <>
            <p className="small muted">Laptop key, security key or phone (Windows). Run once, then reopen:</p>
            <div className="row"><code className="pubkey grow">npx sereno-ak connect</code><button className="ghost sm" onClick={() => copy("npx sereno-ak connect")}><Icon name="copy" /></button></div>
            {native?.error && native.error !== "permission" && <span className="small faint">{native.error}</span>}
          </>
        )}
      </div>

      <div className="card">
        <span className="eyebrow">This browser key</span>
        <div className="pubkey">{state.publicKey}</div>
        <div className="row">
          <button className="secondary sm grow" onClick={() => copy(state.publicKey ?? "")}><Icon name="copy" /> Copy</button>
          <button className="danger sm grow" onClick={remove}>Remove</button>
        </div>
        <p className="small muted">Lost this computer? Delete "Sereno browser key" at github.com/settings/keys; the next sync stops it.</p>
      </div>
      <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <Err e={err} />
      <p className="small faint">Open source (MIT). No analytics. Testnet: Base and Arbitrum Sepolia.</p>
    </main>
  );
}
