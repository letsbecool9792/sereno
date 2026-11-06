import { useEffect, useRef, useState } from "react";
import {
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  getAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  accountFactoryAbi,
  CHAINS,
  CORE,
  ENS,
  ENS_DEPLOYMENT,
  keyHash,
  keyOracleAbi,
  type ChainKey,
  type GithubUser,
} from "@sereno/shared";
import { clientFor, fetchProfile, PAY_CHAINS, short, useWallets, type Moved } from "./lib";
import { Boot, BOOT_REVEAL } from "./Boot";
import { LinkWallet } from "./LinkWallet";
import { Bounties } from "./Bounties";
import { HoloCard } from "./HoloCard";
import { Landing } from "./Landing";
import { Lantern } from "./Lantern";
import { gsap, prefersReducedMotion, useMotion } from "./motion";
import { Spend } from "./Spend";
import { CopyButton, Icon, PageHead, Skeleton, Stepper } from "./ui";

const ensClient = clientFor("sepolia");
const REPO = "https://github.com/letsbecool9792/sereno";

interface Lookup {
  user: GithubUser;
  name: string;
  ensAddress: Address | null;
  factoryAddress: Address;
  claimed: boolean;
  deployed: boolean;
  balance: bigint;
  keys: { type: string; comment: string; listed: boolean }[];
}

function Pay() {
  const [login, setLogin] = useState("");
  const [chainKey, setChainKey] = useState<ChainKey>("base-sepolia");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [amount, setAmount] = useState(() => cleanAmount(new URLSearchParams(window.location.search).get("amount")) ?? "1");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<{ name: string; message: string; fromLogin: string | null } | null>(null);
  const [paid, setPaid] = useState<string | null>(null);
  const chain = CHAINS[chainKey];
  const wallets = useWallets();
  const [walletName, setWalletName] = useState<string>("");
  const walletChoice =
    wallets.find((w) => w.name === walletName) ?? wallets.find((w) => /metamask/i.test(w.name)) ?? wallets[0];
  const root = useRef<HTMLDivElement>(null);

  // ?user=<login> deep link: prefill and look up once on load.
  useEffect(() => {
    const u = cleanLogin(new URLSearchParams(window.location.search).get("user") ?? "");
    if (u) {
      setLogin(u);
      void find(undefined, chainKey, u);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function find(e?: React.FormEvent, key = chainKey, who = cleanLogin(login)) {
    e?.preventDefault();
    if (!who || !CORE || !ENS_DEPLOYMENT) return;
    setBusy(`Looking up ${who} on GitHub…`);
    setError(null);
    setMoved(null);
    setPaid(null);
    setLookup(null);
    try {
      const { user, keys: lines } = await fetchProfile(who);
      const name = `${user.login.toLowerCase()}.${ENS_DEPLOYMENT.parentName}`;
      const c = CHAINS[key];
      const pub = clientFor(key);
      const [ensAddress, resolver, factoryAddress] = await Promise.all([
        ensClient.getEnsAddress({ name, coinType: c.coinType, universalResolverAddress: ENS.universalResolver, gatewayUrls: ["x-batch-gateway:true"] }).catch(() => null),
        ensClient.getEnsResolver({ name, universalResolverAddress: ENS.universalResolver }).catch(() => null),
        pub.readContract({ address: CORE.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [user.id] }),
      ]);
      const [code, balance] = await Promise.all([
        pub.getCode({ address: factoryAddress }),
        pub.readContract({ address: c.usdc, abi: erc20Abi, functionName: "balanceOf", args: [factoryAddress] }),
      ]);
      const keys = await Promise.all(
        lines.map(async (line) => {
          const since = await pub.readContract({ address: CORE!.KeyOracle, abi: keyOracleAbi, functionName: "firstSeen", args: [user.id, keyHash(line)] });
          const [type = "", , comment = ""] = line.split(" ");
          return { type, comment, listed: since > 0n };
        }),
      );
      setLookup({
        user,
        name,
        ensAddress: ensAddress ? getAddress(ensAddress) : null,
        factoryAddress,
        claimed: !!resolver && resolver.toLowerCase() !== ENS_DEPLOYMENT.resolver.toLowerCase(),
        deployed: !!code && code !== "0x",
        balance,
        keys,
      });
    } catch (err) {
      const mv = (err as { moved?: Moved }).moved;
      if (mv) setMoved({ name: `${who.toLowerCase()}.${ENS_DEPLOYMENT.parentName}`, message: (err as Error).message, fromLogin: mv.fromLogin });
      else setError((err as Error).message.includes("not found") ? `No GitHub user "${who}". Check the spelling.` : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!lookup?.ensAddress) return;
    if (!walletChoice) return setError("No browser wallet found. Install MetaMask, Rabby or Phantom.");
    setError(null);
    setPaid(null);
    let step = "connect";
    try {
      const wallet = createWalletClient({ chain: chain.chain, transport: custom(walletChoice.provider) });
      setBusy(`Connecting ${walletChoice.name}…`);
      await wallet.requestAddresses();
      step = "switch network";
      if ((await wallet.getChainId()) !== chain.chain.id) {
        setBusy(`Asking ${walletChoice.name} to switch to ${chain.chain.name}…`);
        try {
          await wallet.switchChain({ id: chain.chain.id });
        } catch (e) {
          // 4902 = the wallet doesn't know this chain yet
          if ((e as { code?: number }).code === 4902 || /unrecognized|not been added|4902/i.test(String((e as Error).message))) {
            await wallet.addChain({ chain: chain.chain });
            await wallet.switchChain({ id: chain.chain.id });
          } else throw e;
        }
        // Some wallets report success without switching; check before sending anything.
        for (let i = 0; i < 10 && (await wallet.getChainId()) !== chain.chain.id; i++) await new Promise((r) => setTimeout(r, 300));
        const now = await wallet.getChainId();
        if (now !== chain.chain.id) {
          throw new Error(`${walletChoice.name} is still on chain ${now}. Switch it to ${chain.chain.name} (chain id ${chain.chain.id}) yourself, then press Pay again.`);
        }
      }
      // Wallets that authorize sites per network (newer MetaMask) need access granted again on this network, and the
      // account to send from is whichever one the wallet returns now.
      step = "authorize account";
      const [from] = await wallet.requestAddresses();
      if (!from) throw new Error(`${walletChoice.name} returned no account`);
      step = "send";
      setBusy(`Confirm the payment in ${walletChoice.name}…`);
      const hash: Hex = await wallet.writeContract({
        account: from,
        address: chain.usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [lookup.ensAddress, parseUnits(amount, 6)],
      });
      setBusy("Waiting for the transaction…");
      await clientFor(chainKey).waitForTransactionReceipt({ hash });
      // Refresh first: find() clears `paid`, so set it after.
      await find(undefined, chainKey, lookup.user.login);
      setPaid(`${chain.explorer}/tx/${hash}`);
    } catch (err) {
      const code = (err as { code?: number; cause?: { code?: number } }).code ?? (err as { cause?: { code?: number } }).cause?.code;
      const msg = (err as Error).message.split("\n")[0] ?? "payment failed";
      const hint =
        code === 4100 || /not been authorized/i.test(msg)
          ? ` Open ${walletChoice.name}: connect this site, allow it on ${chain.chain.name}, and select the connected account.`
          : code === 4001 || /rejected/i.test(msg)
            ? " The request was rejected in the wallet."
            : "";
      setError(`${walletChoice.name}, step "${step}": ${msg}${hint}`);
    } finally {
      setBusy(null);
    }
  }

  const mismatch = !!lookup?.ensAddress && lookup.ensAddress !== lookup.factoryAddress;
  const listedKeys = lookup?.keys.filter((k) => k.listed).length ?? 0;
  // Where a payment is, read from the status the flow above reports.
  const payStep = !lookup || !busy ? -1 : /^(Connecting|Asking)/.test(busy) ? 0 : /^Confirm/.test(busy) ? 1 : /^Waiting/.test(busy) ? 2 : -1;

  useMotion(root, () => {
    if (!lookup) return;
    gsap.from(".payflow-card", { y: 40, rotateX: 12, autoAlpha: 0, duration: 1.2 });
    gsap.from(".payflow-panel > *", { y: 20, autoAlpha: 0, duration: 0.8, stagger: 0.07, delay: 0.15 });
  }, [lookup?.user.login, lookup?.factoryAddress]);

  useMotion(root, () => {
    if (!paid) return;
    gsap.from(".done", { y: 18, autoAlpha: 0, duration: 0.8 });
    gsap.from(".done-ring", { scale: 0.5, autoAlpha: 0, duration: 1.1, delay: 0.05 });
    gsap.fromTo(".done-ck path", { strokeDashoffset: 24 }, { strokeDashoffset: 0, duration: 0.7, delay: 0.25, ease: "power2.out" });
  }, [paid]);

  const pick = (who: string) => {
    setLogin(who);
    void find(undefined, chainKey, who);
  };

  return (
    <div ref={root} className="pay-page">
      <PageHead title="Pay a developer" sub="By GitHub username. They don't need an account yet." />

      <form onSubmit={find} className="search">
        <span className="at">github.com/</span>
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="username or name.sereno.eth" autoFocus spellCheck={false} aria-label="GitHub username or sereno.eth name" autoComplete="off" />
        <button disabled={!!busy || !cleanLogin(login)}>Find</button>
      </form>

      {!lookup && !busy && !error && !moved && (
        <div className="try">
          <span className="muted">Try</span>
          {["torvalds", "octocat", "letsbecool9792"].map((who) => (
            <button type="button" key={who} className="chip" onClick={() => pick(who)}>@{who}</button>
          ))}
        </div>
      )}

      {busy && !lookup && (
        <div className="payflow" aria-busy="true">
          <div className="payflow-card"><div className="skeleton-card"><Skeleton h={88} w={88} r={44} /><Skeleton h={26} w="60%" /><Skeleton h={14} w="45%" /></div></div>
          <div className="payflow-panel"><div className="paybox"><p className="busy"><span className="spin" aria-hidden="true" />{busy}</p><Skeleton h={56} w="50%" /><Skeleton h={14} /><Skeleton h={14} w="80%" /><Skeleton h={48} r={999} /></div></div>
        </div>
      )}
      {error && !lookup && <p className="error">{error}</p>}
      {moved && (
        <div className="error moved" role="alert">
          <strong>Not paying: {moved.name} changed owner.</strong>
          <p>{moved.message}</p>
          {moved.fromLogin && (
            <button type="button" className="secondary" onClick={() => { setLogin(moved.fromLogin!); void find(undefined, chainKey, moved.fromLogin!); }}>
              Look up @{moved.fromLogin} instead
            </button>
          )}
        </div>
      )}

      {lookup && (
        <section className="payflow" aria-label={`Pay @${lookup.user.login}`}>
          <div className="payflow-card">
            <HoloCard
              user={lookup.user}
              name={lookup.name}
              claimed={lookup.claimed}
              check={!lookup.ensAddress ? "unresolved" : mismatch ? "mismatch" : "ok"}
              received={paid ? `${amount} USDC` : undefined}
            />
            {mismatch && <p className="error">The name points to {short(lookup.ensAddress!)} but {lookup.user.login}'s account is {short(lookup.factoryAddress)}. Not paying.</p>}
            {!lookup.ensAddress && <p className="error">The name didn't resolve; the name gateway may be down. Try again in a minute. Not paying.</p>}
          </div>

          <div className="payflow-panel">
            {paid ? (
              <div className="done" role="status">
                <span className="done-ring" aria-hidden="true" />
                <span className="done-ck" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                <strong>Sent {amount} USDC</strong>
                <span className="muted">to @{lookup.user.login} on {chain.chain.name}</span>
                <div className="done-actions">
                  <a className="button-link" href={paid} target="_blank" rel="noreferrer">View receipt {Icon.external(15)}</a>
                  <button type="button" className="secondary" onClick={() => setPaid(null)}>Send again</button>
                </div>
              </div>
            ) : (
              <div className="paybox">
                <div className="paybox-top">
                  <span className="label">You send</span>
                  <div className="segmented" role="radiogroup" aria-label="Network">
                    {PAY_CHAINS.map((k) => (
                      <button
                        type="button"
                        key={k}
                        role="radio"
                        aria-checked={chainKey === k}
                        className={chainKey === k ? "on" : ""}
                        disabled={!!busy}
                        onClick={() => { if (k === chainKey) return; setChainKey(k); void find(undefined, k, lookup.user.login); }}
                      >
                        {CHAINS[k].chain.name.replace(" Sepolia", "")}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="amount">
                  <span className="sr-only">Amount in USDC</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: `${Math.max(1, amount.length) + 0.2}ch` }} />
                  <span>USDC</span>
                </label>
                <div className="quick" role="group" aria-label="Quick amounts">
                  {["1", "5", "10", "25"].map((q) => (
                    <button type="button" key={q} className={amount === q ? "on" : ""} onClick={() => setAmount(q)}>{q}</button>
                  ))}
                </div>
                <dl className="summary">
                  <div><dt>To</dt><dd>@{lookup.user.login}</dd></div>
                  <div><dt>Network</dt><dd>{chain.chain.name}</dd></div>
                  <div><dt>Arrives</dt><dd>In seconds</dd></div>
                  <div><dt>Network fee</dt><dd>Shown in your wallet</dd></div>
                </dl>
                {wallets.length > 1 && (
                  <label className="field">
                    <span>Pay with</span>
                    <select aria-label="Wallet" value={walletChoice?.name} onChange={(e) => setWalletName(e.target.value)}>
                      {wallets.map((w) => (
                        <option key={w.name}>{w.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <button className="primary pay-btn" onClick={pay} disabled={!!busy || !lookup.ensAddress || mismatch || !(Number(amount) > 0)}>
                  {busy ? <><span className="spin" aria-hidden="true" />{busy}</> : <>Pay @{lookup.user.login} {Icon.arrow(18)}</>}
                </button>
                {payStep >= 0 && <Stepper steps={["Connect", "Approve", "Confirm", "Sent"]} at={payStep} />}
                {error && <p className="error">{error}</p>}
                <p className="fine">Your wallet opens only when you press Pay.</p>
              </div>
            )}

            <details className="details">
              <summary>Account details</summary>
              <dl className="facts">
                <dt>Account</dt>
                <dd>
                  <a className="mono" href={`${chain.explorer}/address/${lookup.factoryAddress}`} target="_blank" rel="noreferrer">{short(lookup.factoryAddress)}</a>
                  <span className="muted"> on {chain.chain.name} · {lookup.deployed ? "active" : "new, it can already receive"}</span>
                </dd>
                <dt>Balance</dt>
                <dd className="mono">{formatUnits(lookup.balance, 6)} USDC</dd>
                <dt>Keys that can spend</dt>
                <dd>
                  {lookup.keys.length === 0 ? (
                    <span className="muted">No SSH keys on this profile yet; the money waits until they add one.</span>
                  ) : (
                    <>
                      <span className="muted">{listedKeys} of {lookup.keys.length} on-chain</span>
                      <ul className="keylist">
                        {lookup.keys.map((k, i) => (
                          <li key={i}>
                            <code>{k.type}</code> {k.comment && <span className="muted">{k.comment}</span>}
                            {k.listed ? <span className="tag ok">on-chain</span> : <span className="tag">not synced yet</span>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </dd>
              </dl>
            </details>
          </div>
        </section>
      )}
    </div>
  );
}

/// A positive decimal amount from a deep link (`?amount=5`), or null.
function cleanAmount(s: string | null): string | null {
  return s && /^\d{1,9}(\.\d{1,6})?$/.test(s) && Number(s) > 0 ? s : null;
}

/// "octocat", "@octocat", "https://github.com/octocat" or "octocat.sereno.eth" → "octocat".
function cleanLogin(s: string): string {
  const login = s.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0]!;
  const suffix = ENS_DEPLOYMENT ? `.${ENS_DEPLOYMENT.parentName}` : null;
  return suffix && login.toLowerCase().endsWith(suffix) ? login.slice(0, -suffix.length) : login;
}

type Page = "home" | "pay" | "spend" | "bounties" | "link-wallet";
// `?user=` and `#pay` open Pay; `#spend` and `#bounties` keep the links the README and the log already use.
const pageFromLocation = (): Page => {
  const h = window.location.hash;
  if (h === "#spend") return "spend";
  if (h === "#bounties") return "bounties";
  if (h === "#link-wallet") return "link-wallet";
  if (h === "#pay" || new URLSearchParams(window.location.search).has("user")) return "pay";
  return "home";
};

const NAV: [Exclude<Page, "home" | "link-wallet">, string][] = [
  ["pay", "Pay"],
  ["spend", "Spend"],
  ["bounties", "Bounties"],
];

export function App() {
  const [page, setPage] = useState<Page>(pageFromLocation);
  // The lantern-lighting intro plays once, on a first visit to the landing page.
  const [booting, setBooting] = useState(() => pageFromLocation() === "home" && !prefersReducedMotion());
  const [introDelay] = useState(() => (booting ? BOOT_REVEAL : 0));
  const shell = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setPage(pageFromLocation());
    window.addEventListener("hashchange", on);
    window.addEventListener("popstate", on);
    return () => {
      window.removeEventListener("hashchange", on);
      window.removeEventListener("popstate", on);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = page === "home" ? "sereno: pay any developer by GitHub username" : `${NAV.find(([p]) => p === page)?.[1]} · sereno`;
  }, [page]);

  function go(p: Page) {
    history.pushState(null, "", p === "home" ? window.location.pathname : `${window.location.pathname}#${p}`);
    setPage(p);
  }
  function payUser(login: string) {
    history.pushState(null, "", `${window.location.pathname}?user=${encodeURIComponent(login)}#pay`);
    setPage("pay");
  }

  // The lantern's keyhole flame breathes, slowly, wherever the mark appears.
  useMotion(shell, () => {
    gsap.to(".lantern .flame", { opacity: 0.7, scale: 0.92, svgOrigin: "16 17", duration: 1.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
    if (introDelay) gsap.from(".nav", { yPercent: -100, autoAlpha: 0, duration: 1, delay: introDelay + 0.2 });
  });
  useMotion(view, () => {
    if (page !== "home") gsap.from(view.current, { y: 16, autoAlpha: 0, duration: 0.7 });
  }, [page]);

  return (
    <>
    {booting && <Boot onDone={() => setBooting(false)} />}
    <div ref={shell} className="shell">
      <a className="skip" href="#content">Skip to content</a>
      <header className="nav">
        <div className="nav-inner">
          <a className="brand" href={window.location.pathname} aria-label="sereno home" onClick={(e) => { e.preventDefault(); go("home"); }}>
            <Lantern size={30} />
            <span>sereno</span>
          </a>
          <nav aria-label="Main">
            <ul className="nav-links">
              {NAV.map(([p, label]) => (
                <li key={p}>
                  <a href={`#${p}`} aria-current={page === p ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(p); }}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <a className="nav-gh" href={REPO} target="_blank" rel="noreferrer" aria-label="sereno on GitHub">{Icon.github(20)}</a>
        </div>
      </header>

      <main id="content" className={page === "home" ? "main main-home" : "main"}>
        <div key={page} ref={view}>
          {page === "home" ? <Landing onPay={payUser} go={go} introDelay={introDelay} /> : page === "spend" ? <Spend /> : page === "bounties" ? <Bounties /> : page === "link-wallet" ? <LinkWallet /> : <Pay />}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-about">
              <a className="brand" href={window.location.pathname} aria-label="sereno home" onClick={(e) => { e.preventDefault(); go("home"); }}>
                <Lantern size={30} />
                <span>sereno</span>
              </a>
              <p>
                In old Spanish towns the <em>sereno</em> walked the streets at night with a lantern and the keys to every door,
                calling out the hour and that all was calm. Your keys already open your servers; now they hold your money.
              </p>
            </div>
            <nav className="footer-col" aria-label="Product">
              <h2>Product</h2>
              <ul>
                {NAV.map(([p, label]) => (
                  <li key={p}><a href={`#${p}`} onClick={(e) => { e.preventDefault(); go(p); }}>{label === "Bounties" ? "Issue bounties" : label === "Spend" ? "Spend your balance" : "Pay a developer"}</a></li>
                ))}
              </ul>
            </nav>
            <nav className="footer-col" aria-label="Developers">
              <h2>Developers</h2>
              <ul>
                <li><CopyButton text="npx sereno-ak" label="npx sereno-ak" /></li>
                <li><a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a></li>
                <li><a href={`${REPO}#readme`} target="_blank" rel="noreferrer">How to run it</a></li>
              </ul>
            </nav>
            <div className="footer-col">
              <h2>Network</h2>
              <ul>
                {PAY_CHAINS.map((k) => <li key={k}>{CHAINS[k].chain.name}</li>)}
                <li>ENS on Sepolia</li>
                <li>Circle USDC (testnet)</li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>MIT licensed · no trackers · testnet only</span>
            <span>Built at ETHGlobal Mumbai 2026</span>
          </div>
        </div>
        <div className="footer-word" aria-hidden="true">sereno</div>
      </footer>
    </div>
    </>
  );
}
