import { useEffect, useState } from "react";
import { ENS_DEPLOYMENT, INSTANT_LIMIT, NEW_KEY_DELAY_SECONDS, type ChainKey } from "@sereno/shared";
import type { Row } from "../history";
import { call, chainName, copyToast, Err, Icon, openTab, short, Spinner, toast, usdc, type State } from "./lib";
import { Sync } from "./Onboard";

type Overview = { address: string; balances: { key: ChainKey; units: string }[]; browserKey: { key: ChainKey; firstSeen: string }[]; keyCount: number };

export function Home({ state, go }: { state: State; go: (route: string) => void }) {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Row[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimErr, setClaimErr] = useState<string | null>(null);
  const p = state.profile!;
  const name = `${p.login.toLowerCase()}.${ENS_DEPLOYMENT?.parentName ?? "sereno.eth"}`;
  useEffect(() => {
    call<Overview>("overview").then(setO, (e: Error) => setErr(e.message));
    call<Row[]>("history").then((rows) => setWaiting(rows.filter((r) => r.kind === "escrow-waiting" && !r.note)), () => {});
  }, []);
  const total = o?.balances.reduce((s, b) => s + BigInt(b.units), 0n) ?? null;
  const synced = o?.browserKey.filter((k) => k.firstSeen !== "0") ?? [];
  const first = synced.length ? Math.min(...synced.map((k) => Number(k.firstSeen))) : 0;
  const coolingUntil = first ? (first + NEW_KEY_DELAY_SECONDS) * 1000 : 0;

  async function claimEscrow(r: Row) {
    setClaimErr(null);
    setClaiming(r.id);
    try {
      const out = await call<{ url: string }>("claimEscrow", { chain: r.chain, id: r.escrowId });
      setWaiting((w) => w.filter((x) => x.id !== r.id));
      toast(`Claimed ${usdc(r.amount)} USDC`);
      openTab(out.url);
    } catch (e) {
      setClaimErr((e as Error).message);
    } finally {
      setClaiming(null);
    }
  }

  return (
    <main>
      <div className="card brass">
        <div className="between">
          <span className="name">{name}</span>
          <button className="ghost sm" title="Copy the account address" onClick={() => o && copyToast(o.address, "Address copied")}>
            <span className="addr">{o ? short(o.address) : "…"}</span> <Icon name="copy" size={13} />
          </button>
        </div>
        {total === null ? <div className="skel" style={{ height: 34, width: 140 }} /> : <div className="big">{usdc(total)}<small>USDC</small></div>}
        <div className="chips">
          {o?.balances.map((b) => (
            <span key={b.key} className="chip">{chainName(b.key)} {usdc(b.units)}</span>
          ))}
        </div>
      </div>
      <Err e={err} />
      <div className="row">
        <button className="grow" onClick={() => go("send")}><Icon name="send" /> Send</button>
        <button className="secondary grow" onClick={() => openTab(`${state.payUrl}/?user=${encodeURIComponent(p.login)}#pay`)}>Top up</button>
      </div>

      {waiting.length > 0 && (
        <div className="card">
          <span className="eyebrow">Waiting for you</span>
          {waiting.map((r) => (
            <div key={r.id} className="between">
              <span>{usdc(r.amount)} USDC escrow on {chainName(r.chain)}</span>
              <button className="sm" onClick={() => claimEscrow(r)} disabled={!!claiming}>{claiming === r.id ? <><Spinner /> Claiming…</> : "Claim"}</button>
            </div>
          ))}
          <Err e={claimErr} />
        </div>
      )}

      <div className="card">
        <div className="between">
          <span className="eyebrow">This browser key</span>
          <span className="chip">{o ? `${o.keyCount} key${o.keyCount === 1 ? "" : "s"} on-chain` : "…"}</span>
        </div>
        {o && synced.length === o.browserKey.length ? (
          <p className="small muted">
            On-chain on every chain.{" "}
            {Date.now() < coolingUntil ? <>Up to {usdc(INSTANT_LIMIT)} USDC per payment until {new Date(coolingUntil).toLocaleString()}.</> : "No limits."}
          </p>
        ) : (
          o && <Sync state={state} next={() => {}} compact />
        )}
      </div>
    </main>
  );
}
