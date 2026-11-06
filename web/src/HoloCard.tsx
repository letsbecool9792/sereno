import { useRef } from "react";
import type { GithubUser } from "@sereno/shared";
import { Lantern } from "./Lantern";

export type NameCheck = "ok" | "mismatch" | "unresolved";

const CHECK_TEXT: Record<NameCheck, string> = {
  ok: "Name matches account",
  mismatch: "Name and account disagree",
  unresolved: "Name didn't resolve",
};

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/// The developer as a holographic card. The foil and sheen follow the pointer (CSS vars --mx/--my in 0..1), except
/// under reduced motion. A failed name check turns the card itself into a refused card; `received` stamps it after a payment.
export function HoloCard({ user, name, claimed, check, received }: { user: GithubUser; name: string; claimed?: boolean; check?: NameCheck; received?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  function move(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || still()) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", ((e.clientX - r.left) / r.width).toFixed(3));
    el.style.setProperty("--my", ((e.clientY - r.top) / r.height).toFixed(3));
  }
  function leave() {
    ref.current?.style.removeProperty("--mx");
    ref.current?.style.removeProperty("--my");
  }
  const refused = check === "mismatch" || check === "unresolved";
  return (
    <div ref={ref} className={`holo${refused ? " refused" : ""}`} onPointerMove={move} onPointerLeave={leave}>
      <div className="holo-top">
        <span className="holo-brand"><Lantern size={22} />Sereno</span>
        <span className="holo-id">No. {user.id.toString()}</span>
      </div>
      <img className="holo-av" src={user.avatarUrl} alt="" width={88} height={88} />
      <div className="holo-name">@{user.login}</div>
      {user.name && <div className="holo-real">{user.name}</div>}
      <div className="holo-ens">
        {name} {claimed !== undefined && <span className="holo-tag">{claimed ? "claimed" : "wildcard"}</span>}
      </div>
      {check && (
        <div className={`holo-check ${check}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {check === "ok" ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
          </svg>
          {CHECK_TEXT[check]}
        </div>
      )}
      {received && <div className="holo-stamp" role="status">Received {received}</div>}
    </div>
  );
}
