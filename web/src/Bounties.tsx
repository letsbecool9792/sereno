import { useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { accountFactoryAbi, bountyBoardAbi, CHAINS, CORE, EXTRAS, type ChainKey } from "@sereno/shared";
import { clientFor, connectWallet, PAY_CHAINS, RELAYER, relay, short, useWallets } from "./lib";

/// "https://github.com/o/r/issues/12", "o/r#12" or "o/r/issues/12" → { repo, issue }.
export function parseIssue(s: string): { repo: string; issue: string } | null {
  const m = s.trim().match(/(?:github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\/issues\/|#)(\d+)\/?$/i);
  return m ? { repo: m[1]!.toLowerCase(), issue: m[2]! } : null;
}

interface Info {
  chainKey: ChainKey;
  repo: string;
  issue: string;
  title: string;
  state: string;
  url: string;
  repoHash: Hex;
  winner: bigint;
  winnerLogin: string | null;
  winnerAccount: Address | null;
  pot: bigint;
}

export function Bounties() {
  const [input, setInput] = useState("");
  const [chainKey, setChainKey] = useState<ChainKey>("base-sepolia");
  const [info, setInfo] = useState<Info | null>(null);
  const [amount, setAmount] = useState("1");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; url?: string } | null>(null);
  const wallets = useWallets();
  const [walletName, setWalletName] = useState("");
  const walletChoice = wallets.find((w) => w.name === walletName) ?? wallets.find((w) => /metamask/i.test(w.name)) ?? wallets[0];
  const chain = CHAINS[chainKey];
  const board = EXTRAS ? ({ address: EXTRAS.BountyBoard, abi: bountyBoardAbi } as const) : null;

  async function load(e?: React.FormEvent, key = chainKey): Promise<Info | null> {
    e?.preventDefault();
    const q = parseIssue(input);
    if (!q) {
      setError("Enter an issue link like https://github.com/owner/repo/issues/12, or owner/repo#12");
      return null;
    }
    if (!board || !CORE) return null;
    setBusy("Looking up the issue…");
    setError(null);
    try {
      const res = await fetch(`https://api.github.com/repos/${q.repo}/issues/${q.issue}`, { headers: { Accept: "application/vnd.github+json" } });
      if (res.status === 404) throw new Error(`No issue ${q.repo}#${q.issue} on GitHub`);
      if (!res.ok) throw new Error(`GitHub answered ${res.status}${res.status === 403 ? " (rate limit; try again in a while)" : ""}`);
      const gh = (await res.json()) as { title: string; state: string; html_url: string; pull_request?: unknown };
      if (gh.pull_request) throw new Error(`${q.repo}#${q.issue} is a pull request; bounties go on issues`);
      const pub = clientFor(key);
      const repoHash = await pub.readContract({ ...board, functionName: "repoHashOf", args: [q.repo] });
      const [winner, pot] = await Promise.all([
        pub.readContract({ ...board, functionName: "winnerOf", args: [await pub.readContract({ ...board, functionName: "issueKey", args: [repoHash, BigInt(q.issue)] })] }),
        pub.readContract({ ...board, functionName: "potOf", args: [await pub.readContract({ ...board, functionName: "potKey", args: [repoHash, BigInt(q.issue), CHAINS[key].usdc] })] }),
      ]);
      let winnerLogin: string | null = null;
      let winnerAccount: Address | null = null;
      if (winner !== 0n) {
        winnerAccount = await pub.readContract({ address: CORE.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [winner] });
        winnerLogin = await fetch(`https://api.github.com/user/${winner}`).then((r) => (r.ok ? r.json() : null)).then((u) => (u as { login?: string } | null)?.login ?? null).catch(() => null);
      }
      const i: Info = { chainKey: key, ...q, title: gh.title, state: gh.state, url: gh.html_url, repoHash, winner, winnerLogin, winnerAccount, pot };
      setInfo(i);
      return i;
    } catch (err) {
      setInfo(null);
      setError((err as Error).message.split("\n")[0]!);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function withWallet(what: string, f: (w: Awaited<ReturnType<typeof connectWallet>>) => Promise<Hex | void>) {
    if (!walletChoice) return setError("No browser wallet found. Install MetaMask, Rabby or Phantom.");
    setError(null);
    setDone(null);
    try {
      const w = await connectWallet(walletChoice, chainKey, setBusy);
      const hash = await f(w);
      if (hash) {
        setBusy("Waiting for the transaction…");
        await clientFor(chainKey).waitForTransactionReceipt({ hash });
        setDone({ text: what, url: `${chain.explorer}/tx/${hash}` });
      }
      await load(undefined, chainKey);
    } catch (err) {
      const msg = (err as Error).message.split("\n")[0] ?? "failed";
      setError(/rejected|denied/i.test(msg) ? "The request was rejected in the wallet." : msg);
    } finally {
      setBusy(null);
    }
  }

  const fund = () =>
    withWallet(`Funded ${info!.repo}#${info!.issue}.`, async ({ wallet, from }) => {
      const amt = parseUnits(amount, 6);
      const pub = clientFor(chainKey);
      const allowance = await pub.readContract({ address: chain.usdc, abi: erc20Abi, functionName: "allowance", args: [from, board!.address] });
      if (allowance < amt) {
        setBusy(`Approve ${amount} USDC for the bounty board in ${walletChoice!.name}…`);
        const h = await wallet.writeContract({ account: from, chain: chain.chain, address: chain.usdc, abi: erc20Abi, functionName: "approve", args: [board!.address, amt] });
        setBusy("Waiting for the approval…");
        await pub.waitForTransactionReceipt({ hash: h });
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.max(1, Number(days) || 30) * 86_400);
      setBusy(`Confirm the bounty in ${walletChoice!.name}…`);
      return wallet.writeContract({ account: from, chain: chain.chain, ...board!, functionName: "fund", args: [info!.repo, BigInt(info!.issue), chain.usdc, amt, deadline] });
    });

  const refund = () =>
    withWallet("Refunded your contribution.", async ({ wallet, from }) => {
      const pub = clientFor(chainKey);
      const pot = await pub.readContract({ ...board!, functionName: "potKey", args: [info!.repoHash, BigInt(info!.issue), chain.usdc] });
      const [amt, deadline] = await pub.readContract({ ...board!, functionName: "contributions", args: [pot, from] });
      if (amt === 0n) throw new Error(`${short(from)} has no USDC in this bounty on ${chain.chain.name}`);
      if (BigInt(Math.floor(Date.now() / 1000)) < deadline) throw new Error(`Your deadline is ${new Date(Number(deadline) * 1000).toLocaleString()}; you can take it back after that`);
      setBusy(`Confirm the refund in ${walletChoice!.name}…`);
      return wallet.writeContract({ account: from, chain: chain.chain, ...board!, functionName: "refund", args: [info!.repoHash, BigInt(info!.issue), chain.usdc] });
    });

  /// Asks the relayer to have the Chainlink bounty workflow check GitHub and settle; it then pays the pot out.
  async function settle() {
    if (!info) return;
    setError(null);
    setDone(null);
    setBusy("Asking the relayer…");
    try {
      const body = { chainId: chain.chain.id, repo: info.repo, issue: info.issue };
      let r = (await relay("/bounty", body)) as unknown as { state: string; detail?: string; paid?: string; workerAge?: number | null };
      const offline = r.workerAge === null || (r.workerAge ?? 0) > 60;
      for (let i = 0; i < 120 && (r.state === "queued" || r.state === "running"); i++) {
        setBusy(
          r.state === "running"
            ? "Chainlink's bounty workflow is asking GitHub whether a merged PR closed this issue…"
            : offline
              ? "Queued; waiting for the workflow runner (it looks offline right now)…"
              : "Queued…",
        );
        await new Promise((res) => setTimeout(res, 5000));
        r = await fetch(`${RELAYER}/bounty/status?${new URLSearchParams(body as unknown as Record<string, string>)}`).then((x) => x.json());
      }
      if (r.state === "failed") throw new Error(r.detail ?? "the bounty workflow failed");
      if (r.state !== "done") throw new Error("This is taking too long; try again later.");
      setDone({ text: r.paid ? "Settled and paid to the PR author's account." : `Settled. ${r.detail ?? ""}`, url: r.paid });
      await load(undefined, chainKey);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className="lead">
        Put USDC on any GitHub issue. When a merged pull request closes it, a Chainlink workflow confirms it on GitHub and the PR's author is paid into their
        Sereno account, by GitHub ID. They don't need to have signed up or shared an address.
      </p>

      <form onSubmit={(e) => void load(e)} className="search">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://github.com/owner/repo/issues/12" spellCheck={false} />
        <select value={chainKey} onChange={(e) => { const k = e.target.value as ChainKey; setChainKey(k); if (info) void load(undefined, k); }}>
          {PAY_CHAINS.map((k) => <option key={k} value={k}>{CHAINS[k].chain.name}</option>)}
        </select>
        <button disabled={!!busy || !input.trim() || !board}>Find</button>
      </form>
      {!board && <p className="error">The bounty board isn't deployed yet.</p>}

      {busy && <p className="busy">{busy}</p>}
      {error && <p className="error">{error}</p>}
      {done && (
        <p className="ok-msg">
          {done.text} {done.url && <a href={done.url} target="_blank" rel="noreferrer">View transaction</a>}
        </p>
      )}

      {info && (
        <section className="card">
          <div className="login">
            <a href={info.url} target="_blank" rel="noreferrer">{info.repo}#{info.issue}</a> {info.title}
          </div>
          <dl>
            <dt>Issue</dt>
            <dd>{info.state === "closed" ? <span className="tag ok">closed</span> : <span className="tag">open</span>}</dd>
            <dt>Bounty on {chain.chain.name}</dt>
            <dd>{formatUnits(info.pot, 6)} USDC {info.winner !== 0n && info.pot === 0n && <span className="muted">(paid out)</span>}</dd>
            <dt>Winner</dt>
            <dd>
              {info.winner === 0n ? (
                <span className="muted">not settled yet</span>
              ) : (
                <>
                  {info.winnerLogin ? <a href={`https://github.com/${info.winnerLogin}`} target="_blank" rel="noreferrer">@{info.winnerLogin}</a> : `GitHub ${info.winner}`}{" "}
                  <span className="muted">
                    account <a href={`${chain.explorer}/address/${info.winnerAccount}`} target="_blank" rel="noreferrer">{short(info.winnerAccount!)}</a>
                  </span>
                </>
              )}
            </dd>
          </dl>

          {info.winner === 0n && (
            <>
              <h3>Fund it</h3>
              <div className="pay">
                {wallets.length > 1 && (
                  <select value={walletChoice?.name} onChange={(e) => setWalletName(e.target.value)}>
                    {wallets.map((w) => <option key={w.name}>{w.name}</option>)}
                  </select>
                )}
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span>USDC, refundable after</span>
                <input type="number" min="1" step="1" value={days} onChange={(e) => setDays(e.target.value)} />
                <span>days</span>
                <button onClick={fund} disabled={!!busy || !(Number(amount) > 0)}>Fund bounty</button>
              </div>
              <p className="muted">Two wallet steps the first time: approve USDC, then fund. If nobody earns it by your deadline, take it back with Refund.</p>
            </>
          )}

          <h3>Settle</h3>
          <div className="row">
            <button onClick={settle} disabled={!!busy || (info.winner !== 0n && info.pot === 0n) || (info.winner === 0n && info.pot === 0n)}>
              {info.winner !== 0n ? "Pay out" : "Check GitHub and pay the PR author"}
            </button>
            {info.winner === 0n && info.pot > 0n && (
              <button type="button" className="secondary" onClick={refund} disabled={!!busy}>Refund my contribution</button>
            )}
          </div>
          <p className="muted">
            Anyone can press it once the fixing PR is merged. The workflow pays only if the issue's latest close came from a merged PR in this repo, and pays
            that PR's author.
          </p>
        </section>
      )}
    </>
  );
}
