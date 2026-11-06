// Popup helpers: messages to the background worker, formatting, and the small visual pieces (the mark, icons).
import { useEffect, useState, type ReactNode } from "react";
import { CHAINS, type ChainKey } from "@sereno/shared";
import type { Profile, Settings } from "../store";

export async function call<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const r = (await chrome.runtime.sendMessage({ type, ...payload })) as { result?: T; error?: string };
  if (r?.error !== undefined) throw new Error(r.error);
  return r?.result as T;
}

export interface State {
  hasVault: boolean;
  unlocked: boolean;
  profile: Profile | null;
  settings: Settings;
  publicKey: string | null;
  keyHash: string | null;
  extensionId: string;
  payUrl: string;
}

export const usdc = (units: string | bigint, digits = 2) => {
  const n = Number(units) / 1e6;
  return n.toLocaleString(undefined, { minimumFractionDigits: n % 1 === 0 && digits > 0 ? 0 : Math.min(2, digits), maximumFractionDigits: digits === 2 ? 6 : digits });
};
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const chainName = (k: ChainKey) => CHAINS[k].chain.name.replace(" Sepolia", "");
export const ago = (ms?: number) => {
  if (!ms) return "";
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
};
export const openTab = (url: string) => chrome.tabs.create({ url });
export const copy = (t: string) => navigator.clipboard.writeText(t);

/// sereno's mark: a lantern whose flame is a keyhole (same shape as web/src/Lantern.tsx).
export function Lantern({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`lantern ${className}`} aria-hidden="true">
      <path className="lantern-line" d="M13.4 6.2a2.6 2.6 0 0 1 5.2 0" />
      <path className="lantern-line" d="M10.5 9.2h11l-1.6-3h-7.8z" />
      <path className="lantern-line" d="M10 9.2h12v13.3a3.5 3.5 0 0 1-3.5 3.5h-5a3.5 3.5 0 0 1-3.5-3.5z" />
      <path className="lantern-line" d="M12.5 28.5h7" />
      <path className="flame" d="M16 12.8a2.4 2.4 0 0 1 1.2 4.48L17.8 21.5h-3.6l.6-4.22A2.4 2.4 0 0 1 16 12.8z" />
    </svg>
  );
}

const paths: Record<string, ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  send: <path d="M5 12h13M13 6l6 6-6 6" />,
  history: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4.5l3 2" /></>,
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  in: <path d="M12 5v14M6 13l6 6 6-6" />,
  out: <path d="M12 19V5M6 11l6-6 6 6" />,
  gift: <><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M12 9v11M4 13h16M12 9c-2-4-6-4-6-1.5S10 9 12 9c2 0 6-.5 6-1.5S14 5 12 9z" /></>,
  sync: <><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></>,
  ext: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.4 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.5 4.3-1.2" /><path d="M3 3l18 18M9.9 10a3 3 0 0 0 4.2 4.2" /></>,
};
export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Steps({ items }: { items: { label: string; state: "done" | "now" | "todo" }[] }) {
  return (
    <div className="steps">
      {items.map((s) => (
        <div key={s.label} className={`step ${s.state}`}>
          <span className="tick">{s.state === "done" && <Icon name="check" size={12} />}</span>
          {s.label}
        </div>
      ))}
    </div>
  );
}

/// A small spinning ring for buttons and status lines.
export const Spinner = ({ size = 14 }: { size?: number }) => <span className="spin" style={{ width: size, height: size }} aria-hidden="true" />;

// Toasts: short confirmations ("Copied", "Saved", "Claimed") at the bottom of the popup.
type ToastItem = { id: number; text: string; tone: "ok" | "err" | "info" };
const listeners = new Set<(t: ToastItem[]) => void>();
let toasts: ToastItem[] = [];
let toastId = 0;
export function toast(text: string, tone: ToastItem["tone"] = "ok") {
  const t = { id: ++toastId, text, tone };
  toasts = [...toasts, t];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l(toasts));
  }, tone === "err" ? 5000 : 2600);
}
export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => void listeners.delete(setItems);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.tone === "ok" && <Icon name="check" size={14} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
export const copyToast = (text: string, what = "Copied") => copy(text).then(() => toast(what));

/// A password field with a show/hide toggle.
export function PasswordInput({ value, onChange, autoFocus, placeholder }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw">
      <input type={show ? "text" : "password"} autoFocus={autoFocus} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      <button type="button" className="pw-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide" : "Show"}>
        <Icon name={show ? "eyeOff" : "eye"} size={16} />
      </button>
    </span>
  );
}

export function Err({ e }: { e: string | null }) {
  return e ? <div className="notice err">{e}</div> : null;
}
