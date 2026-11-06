import { useEffect, useState } from "react";
import type { Row } from "../history";
import { ago, call, chainName, Icon, openTab, short, Spinner, toast, usdc } from "./lib";

const LABEL: Record<Row["kind"], string> = { sent: "Sent", received: "Received", bounty: "Bounty won", "escrow-waiting": "Escrow waiting" };

export function History() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = () => {
    setErr(null);
    setLoading(true);
    call<Row[]>("history")
      .then(setRows, (e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  async function exportCsv() {
    const text = await call<string>("history", { csv: true });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = "sereno-history.csv";
    a.click();
    toast("History exported");
  }
  return (
    <main>
      <div className="between">
        <h2>History</h2>
        <div className="row">
          <button className="ghost sm" onClick={load} title="Refresh" disabled={loading}>{loading ? <Spinner /> : <Icon name="sync" />}</button>
          <button className="ghost sm" onClick={exportCsv} disabled={!rows?.length}>CSV</button>
        </div>
      </div>
      {err && <div className="notice err">{err}</div>}
      {!rows && !err && (
        <div className="stack">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 40 }} />)}
          <p className="small faint">Reading the chain since 5 Nov…</p>
        </div>
      )}
      {rows?.length === 0 && <p className="muted">Nothing yet. Payments to and from your account show up here.</p>}
      <div className="list">
        {rows?.map((r) => {
          const incoming = r.kind !== "sent";
          return (
            <div key={r.id} className="item">
              <div className={`dot ${r.kind === "bounty" ? "gold" : incoming ? "in" : "out"}`}>
                <Icon name={r.kind === "bounty" ? "gift" : incoming ? "in" : "out"} size={14} />
              </div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {LABEL[r.kind]}
                  {r.viaCommit && <span className="chip" style={{ marginLeft: 6, minHeight: 18 }}>commit</span>}
                </div>
                <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.label ?? (r.counterparty ? short(r.counterparty) : r.note ?? "")} · {chainName(r.chain)} · {r.status === "submitted" ? "submitted" : ago(r.time)}
                </div>
              </div>
              <span className={`amt ${incoming ? "in" : ""}`}>{incoming ? "+" : "−"}{usdc(r.amount)}</span>
              {r.url && (
                <button className="ghost sm" onClick={() => openTab(r.url!)} title="Open in the explorer"><Icon name="ext" size={13} /></button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
