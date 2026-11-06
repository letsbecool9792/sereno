import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { accountFactoryAbi, bountyBoardAbi, CHAINS, CORE, EXTRAS, type ChainKey } from "@sereno/shared";
import { clientFor, connectWallet, PAY_CHAINS, RELAYER, relay, short, useWallets } from "./lib";
import { gsap, useMotion } from "./motion";
import { Icon, PageHead } from "./ui";

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
  const root = useRef<HTMLDivElement>(null);

  // ?issue=owner/repo/issues/12 deep link (the browser extension's "Fund a bounty"): prefill and look it up once.
  useEffect(() => {
    const i = new URLSearchParams(window.location.search).get("issue");
    if (i && parseIssue(i)) {
      setInput(i);
      void load(undefined, chainKey, i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(e?: React.FormEvent, key = chainKey, text = input): Promise<Info | null> {
    e?.preventDefault();
    const q = parseIssue(text);
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

  useMotion(root, () => {
    if (!info) return;
    gsap.from(".bounty-issue", { y: 28, autoAlpha: 0, duration: 1 });
    gsap.from(".bounty-actions > *", { y: 20, autoAlpha: 0, duration: 0.8, stagger: 0.08, delay: 0.12 });
  }, [info?.repo, info?.issue, info?.chainKey]);

  const settled = info ? info.winner !== 0n : false;

  return (
    <div ref={root} className="bounties-page">
      <PageHead title="Issue bounties" sub="Fund an issue. Whoever merges the fix gets paid." />

      <form onSubmit={(e) => void load(e)} className="search">
        <span className="at">{Icon.github(16)}</span>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="owner/repo#12 or an issue link" spellCheck={false} aria-label="GitHub issue" autoComplete="off" />
        <select aria-label="Network" value={chainKey} onChange={(e) => { const k = e.target.value as ChainKey; setChainKey(k); if (info) void load(undefined, k); }}>
          {PAY_CHAINS.map((k) => <option key={k} value={k}>{CHAINS[k].chain.name}</option>)}
        </select>
        <button disabled={!!busy || !input.trim() || !board}>Find</button>
      </form>
      {!board && <p className="error">The bounty board isn't deployed yet.</p>}

      {busy && <p className="busy"><span className="spin" aria-hidden="true" />{busy}</p>}
      {error && <p className="error">{error}</p>}
      {done && (
        <p className="ok-msg">
          {Icon.check(16)} {done.text} {done.url && <a href={done.url} target="_blank" rel="noreferrer">View receipt</a>}
        </p>
      )}

      {info && (
        <div className="split">
          <section className="card bounty-issue split-main" aria-label={`${info.repo}#${info.issue}`}>
            <div className="issue-head">
              <a className="issue-ref mono" href={info.url} target="_blank" rel="noreferrer">{info.repo}#{info.issue} {Icon.external(14)}</a>
              {info.state === "closed" ? <span className="tag ok">closed</span> : <span className="tag">open</span>}
            </div>
            <h2 className="issue-title">{info.title}</h2>
            <div className="pot">
              <span className="label">Bounty on {chain.chain.name}</span>
              <span className="pot-amount">{formatUnits(info.pot, 6)} <span>USDC</span></span>
              {settled && info.pot === 0n && <span className="muted">Paid out</span>}
            </div>
            <dl className="summary">
              <div>
                <dt>Winner</dt>
                <dd>
                  {!settled ? (
                    <span className="muted">Not settled yet</span>
                  ) : (
                    <>
                      {info.winnerLogin ? <a href={`https://github.com/${info.winnerLogin}`} target="_blank" rel="noreferrer">@{info.winnerLogin}</a> : `GitHub ${info.winner}`}{" "}
                      <a className="muted mono" href={`${chain.explorer}/address/${info.winnerAccount}`} target="_blank" rel="noreferrer">{short(info.winnerAccount!)}</a>
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <aside className="split-side bounty-actions">
            {!settled && (
              <div className="card">
                <h2 className="h3">Fund it</h2>
                <div className="row">
                  <label>Amount (USDC)<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                  <label>Refundable after (days)<input type="number" min="1" step="1" value={days} onChange={(e) => setDays(e.target.value)} /></label>
                </div>
                {wallets.length > 1 && (
                  <label className="field">
                    <span>Pay with</span>
                    <select aria-label="Wallet" value={walletChoice?.name} onChange={(e) => setWalletName(e.target.value)}>
                      {wallets.map((w) => <option key={w.name}>{w.name}</option>)}
                    </select>
                  </label>
                )}
                <button className="block" onClick={fund} disabled={!!busy || !(Number(amount) > 0)}>Fund bounty {Icon.arrow(16)}</button>
                <p className="muted">First time: approve USDC, then fund. Take it back after your deadline if nobody earns it.</p>
              </div>
            )}
            <div className="card">
              <h2 className="h3">Settle</h2>
              <p className="muted">Once the fixing PR is merged, anyone can press this. Chainlink checks GitHub and pays the PR's author.</p>
              <button className="block" onClick={settle} disabled={!!busy || (settled && info.pot === 0n) || (!settled && info.pot === 0n)}>
                {settled ? "Pay out" : "Check GitHub and pay"} {Icon.arrow(16)}
              </button>
              {!settled && info.pot > 0n && (
                <button type="button" className="secondary block" onClick={refund} disabled={!!busy}>Refund my contribution</button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
