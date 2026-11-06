// Small shared pieces: icons, the step tracker, skeleton placeholders and the copy button.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "./motion";

const svg = (path: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

export const Icon = {
  arrow: (s?: number) => svg(<path d="M5 12h14M13 6l6 6-6 6" />, s),
  check: (s?: number) => svg(<path d="M20 6 9 17l-5-5" />, s),
  copy: (s?: number) => svg(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>, s),
  external: (s?: number) => svg(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />, s),
  key: (s?: number) => svg(<><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14.5 8.5l2 2" /></>, s),
  terminal: (s?: number) => svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></>, s),
  merge: (s?: number) => svg(<><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 7v10M6 9c0 4 4 3 10 3" /></>, s),
  link: (s?: number) => svg(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />, s),
  chain: (s?: number) => svg(<><rect x="3" y="8" width="8" height="8" rx="2" /><rect x="13" y="8" width="8" height="8" rx="2" /><path d="M11 12h2" /></>, s),
  user: (s?: number) => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>, s),
  github: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  ),
};

/// A horizontal progress tracker: steps before `at` are done, `at` is in progress. `at` past the end means all done.
export function Stepper({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className={i < at ? "done" : i === at ? "active" : ""} aria-current={i === at ? "step" : undefined}>
          <span className="stepper-dot">{i < at ? Icon.check(13) : i + 1}</span>
          <span className="stepper-label">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function Skeleton({ h = 16, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="small secondary copy"
      onClick={() => void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}
    >
      {done ? Icon.check(14) : Icon.copy(14)}
      <span>{done ? "Copied" : label}</span>
    </button>
  );
}

/// Progress, error and success for an action, rendered right after the button that fired it. It's always mounted so
/// screen readers hear changes, and it scrolls itself into view so a click never seems to do nothing.
/// `wallet`: the busy step waits on a browser wallet, so show WalletHint when it takes long.
export function Feedback({ busy, error, wallet, children }: { busy?: string | null; error?: string | null; wallet?: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = !!(busy || error || children);
  useEffect(() => {
    if (shown) ref.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [shown, busy, error]);
  return (
    <div ref={ref} className="feedback" aria-live="polite">
      {busy && <p className="busy"><span className="spin" aria-hidden="true" />{busy}</p>}
      {wallet && <WalletHint busy={busy ?? null} />}
      {error && <p className="error" role="alert">{error}</p>}
      {children}
    </div>
  );
}

/// The "it worked" panel: a check, what happened, and the receipt.
export function Done({ title, sub, url, again, againLabel = "Send again" }: { title: string; sub?: ReactNode; url?: string; again?: () => void; againLabel?: string }) {
  return (
    <div className="done" role="status">
      <span className="done-ring" aria-hidden="true" />
      <span className="done-ck" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <strong>{title}</strong>
      {sub && <span className="muted">{sub}</span>}
      <div className="done-actions">
        {url && <a className="button-link" href={url} target="_blank" rel="noreferrer">View receipt {Icon.external(15)}</a>}
        {again && <button type="button" className="secondary" onClick={again}>{againLabel}</button>}
      </div>
    </div>
  );
}

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}

/// While a wallet step has waited more than 12 s: where the request is. Wallet windows often open behind the browser or
/// queue behind an earlier request.
export function WalletHint({ busy }: { busy: string | null }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    setLate(false);
    if (!busy) return;
    const t = setTimeout(() => setLate(true), 12_000);
    return () => clearTimeout(t);
  }, [busy]);
  if (!busy || !late) return null;
  const waitingOnChain = /waiting for the (transaction|approval)/i.test(busy);
  return (
    <p className="wallet-hint">
      {waitingOnChain
        ? "Still confirming on-chain. Testnets can take a minute; this page keeps checking."
        : "Don't see it? Click your wallet's icon in the browser toolbar: the request is waiting there (it may have opened behind this window)."}
    </p>
  );
}
