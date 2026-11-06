import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, getAddress, hexToString, isAddress, parseUnits, type Address } from "viem";
import {
  accountFactoryAbi,
  buildIntent,
  CHAINS,
  CORE,
  keyHash,
  keyOracleAbi,
  SIGNING_NAMESPACE,
  sshAccountAbi,
  type ChainKey,
  type GithubUser,
} from "@sereno/shared";
import { clientFor, fetchProfile, PAY_CHAINS, parseCommitLink, relay, RELAYER, short } from "./lib";
import { gsap, prefersReducedMotion, useMotion } from "./motion";
import { CopyButton, Done, Feedback, Icon, PageHead } from "./ui";

interface Prepared {
  chainKey: ChainKey;
  user: GithubUser;
  account: Address;
  balance: bigint;
  nonce: bigint;
  to: Address;
  toLabel: string;
  amount: bigint;
  fee: bigint;
  text: string;
  keys: { type: string; comment: string; listed: boolean; fingerprint: string }[];
}

type Result = { url: string; note?: string } | null;

/// The file name ssh-keygen gives a key of this type by default (in ~/.ssh).
const usualFile = (type: string) =>
  ({
    "ssh-ed25519": "id_ed25519",
    "ecdsa-sha2-nistp256": "id_ecdsa",
    "ssh-rsa": "id_rsa",
    "sk-ecdsa-sha2-nistp256@openssh.com": "id_ecdsa_sk",
    "sk-ssh-ed25519@openssh.com": "id_ed25519_sk",
  })[type] ?? "id_ed25519";

/// OpenSSH's fingerprint of a key blob (base64), as `ssh-keygen -l` and GitHub's settings page print it.
async function fingerprint(blobB64: string): Promise<string> {
  try {
    const bytes = Uint8Array.from(atob(blobB64), (ch) => ch.charCodeAt(0));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return `SHA256:${btoa(String.fromCharCode(...digest)).replace(/=+$/, "")}`;
  } catch {
    return "";
  }
}

function Cmd({ lines }: { lines: string[] }) {
  const text = lines.join("\n");
  return (
    <div className="cmd">
      <pre>{text}</pre>
      <CopyButton text={text} />
    </div>
  );
}

export function Spend() {
  const [me, setMe] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1");
  const [fee, setFee] = useState("0.02");
  const [chainKey, setChainKey] = useState<ChainKey>("base-sepolia");
  const [keyFile, setKeyFile] = useState("~/.ssh/id_ed25519");
  const [mode, setMode] = useState<"sign" | "commit">("sign");
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [sig, setSig] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<Result>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  // Editing the payment after preparing it makes the prepared text stale: start step 2 over.
  useEffect(() => {
    setPrep(null);
    setPaid(null);
    setSig("");
  }, [me, to, amount, fee, chainKey]);
  // Step 2 appears below the fold on most screens: bring it into view.
  useEffect(() => {
    if (prep) root.current?.querySelector(".spend-sign")?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [prep?.text]);
  const root = useRef<HTMLDivElement>(null);

  /// Asks the relayer to have the Chainlink key oracle sync this user's GitHub keys, then waits for it.
  async function syncKeys() {
    if (!prep) return;
    setError(null);
    setSyncMsg("Asking for a key sync…");
    try {
      type SyncReply = { githubId: string; workerAge: number | null; cooldown?: number };
      let r = (await relay("/sync", { login: prep.user.login })) as unknown as SyncReply;
      // A sync finished moments ago: wait, then run a fresh one, so a key just deleted on GitHub is seen.
      while (r.cooldown) {
        setSyncMsg(`Your keys were synced moments ago; syncing again in ${r.cooldown}s…`);
        await new Promise((res) => setTimeout(res, (r.cooldown! + 1) * 1000));
        r = (await relay("/sync", { login: prep.user.login })) as unknown as SyncReply;
      }
      if (r.workerAge === null || r.workerAge > 60) setSyncMsg("Queued. The sync worker looks offline right now, so this may take a while.");
      for (let i = 0; i < 120; i++) {
        const s = (await (await fetch(`${RELAYER}/sync/status/${r.githubId}`)).json()) as { state: string; detail?: string };
        if (s.state === "done") {
          setSyncMsg(null);
          return void prepare();
        }
        if (s.state === "failed") throw new Error(`Key sync failed: ${s.detail ?? "unknown error"}`);
        setSyncMsg(s.state === "running" ? "The Chainlink workflow is reading your GitHub keys and writing them on-chain (about a minute per chain)…" : r.workerAge === null || r.workerAge > 60 ? "Queued; waiting for the sync worker…" : "Queued…");
        await new Promise((res) => setTimeout(res, 5000));
      }
      throw new Error("Key sync is taking too long; try again later.");
    } catch (err) {
      setSyncMsg(null);
      setError((err as Error).message);
    }
  }

  async function prepare(e?: React.FormEvent) {
    e?.preventDefault();
    if (!CORE) return;
    setBusy("Building the payment text…");
    setError(null);
    setPaid(null);
    setPrep(null);
    setSig("");
    try {
      const c = CHAINS[chainKey];
      const pub = clientFor(chainKey);
      const { user, keys: lines } = await fetchProfile(me.trim(), true);
      let toAddr: Address;
      let toLabel: string;
      if (isAddress(to.trim())) {
        toAddr = getAddress(to.trim());
        toLabel = toAddr;
      } else {
        const r = await fetchProfile(to.trim().replace(/^@/, ""));
        toAddr = await pub.readContract({ address: CORE.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [r.user.id] });
        toLabel = `${r.user.login}'s account ${short(toAddr)}`;
      }
      const amt = parseUnits(amount, 6);
      const f = parseUnits(fee || "0", 6);
      const account = await pub.readContract({ address: CORE.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [user.id] });
      const [code, balance] = await Promise.all([
        pub.getCode({ address: account }),
        pub.readContract({ address: c.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
      ]);
      const deployed = !!code && code !== "0x";
      const nonce = deployed ? await pub.readContract({ address: account, abi: sshAccountAbi, functionName: "nonce" }) : 0n;
      // The contract's own text when it exists, so what you sign is byte for byte what it checks.
      const text = deployed
        ? hexToString(await pub.readContract({ address: account, abi: sshAccountAbi, functionName: "intent", args: [c.usdc, toAddr, amt, f, nonce] }))
        : buildIntent({ chainId: c.chain.id, account, githubId: user.id, nonce, amount: amt, token: c.usdc, to: toAddr, fee: f });
      const keys = await Promise.all(
        lines.map(async (line) => {
          const since = await pub.readContract({ address: CORE!.KeyOracle, abi: keyOracleAbi, functionName: "firstSeen", args: [user.id, keyHash(line)] });
          const [type = "", blob = "", comment = ""] = line.split(" ");
          return { type, comment, listed: since > 0n, fingerprint: await fingerprint(blob) };
        }),
      );
      setPrep({ chainKey, user, account, balance, nonce, to: toAddr, toLabel, amount: amt, fee: f, text, keys });
      // Prefill the key file most people sign with: one already on-chain that needs no touch or phone. It only fills
      // `-f` in the commands; the payment is the same whichever listed key signs.
      const best = keys.findIndex((x) => x.listed && !x.type.startsWith("sk-"));
      const guess = keys[best >= 0 ? best : Math.max(0, keys.findIndex((x) => x.listed))];
      setKeyFile(`~/.ssh/${usualFile(guess?.type ?? "ssh-ed25519")}`);
    } catch (err) {
      setError((err as Error).message.includes("not found") ? "GitHub user not found" : (err as Error).message.split("\n")[0]!);
    } finally {
      setBusy(null);
    }
  }

  function download() {
    if (!prep) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([prep.text], { type: "text/plain" }));
    a.download = "intent.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function submitSignature() {
    if (!prep) return;
    setBusy("Submitting through the relayer…");
    setError(null);
    try {
      const r = await relay("/intent", {
        chainId: CHAINS[prep.chainKey].chain.id,
        githubId: prep.user.id.toString(),
        token: CHAINS[prep.chainKey].usdc,
        to: prep.to,
        amount: prep.amount.toString(),
        fee: prep.fee.toString(),
        signature: sig.trim() + "\n",
      });
      setPaid({ url: r.url! });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitCommit(e: React.FormEvent) {
    e.preventDefault();
    const c = parseCommitLink(link);
    if (!c) return setError("Paste a commit link like https://github.com/owner/repo/commit/<sha>");
    setBusy(`Fetching ${c.repo}@${c.sha.slice(0, 7)} from GitHub and submitting…`);
    setError(null);
    setPaid(null);
    try {
      const r = await relay("/commit", c);
      const verified = (r as unknown as { githubVerified?: boolean }).githubVerified;
      setPaid({ url: r.url!, note: verified === undefined ? undefined : verified ? "GitHub shows this commit as Verified." : "GitHub doesn't mark this commit Verified (the key isn't a signing key on GitHub, or the email doesn't match); the contract checked the signature anyway." });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // As a shell argument that works in PowerShell and bash alike: PowerShell doesn't expand `~` for programs and
  // Windows' ssh-keygen doesn't either, but both shells expand "$HOME" inside double quotes.
  const keyPath = keyFile.trim() || "~/.ssh/id_ed25519";
  const k = `"${keyPath.replace(/^~(?=$|[\\/])/, "$HOME")}"`;
  const needed = prep ? prep.amount + prep.fee : 0n;
  const listed = prep?.keys.some((x) => x.listed);

  useMotion(root, () => {
    if (!prep) return;
    gsap.from(".spend-sign", { y: 24, autoAlpha: 0, duration: 0.9 });
    gsap.from(".fromto > *", { y: 12, autoAlpha: 0, duration: 0.7, stagger: 0.06, delay: 0.15 });
  }, [prep?.text]);

  return (
    <div ref={root} className="spend-page">
      <PageHead title="Spend your balance" sub="Sign with the SSH key on your GitHub. Your key never leaves your machine." />

      <div className="column">
        <div className="column-inner">
          <form onSubmit={prepare} className="card form step-card">
            <div className="step-head"><span className="step-num">1</span><h2>Payment</h2></div>
            <div className="row">
              <label>Your GitHub username<input value={me} onChange={(e) => setMe(e.target.value)} placeholder="you" spellCheck={false} autoComplete="off" /></label>
              <label>Pay to<input value={to} onChange={(e) => setTo(e.target.value)} placeholder="username or 0x address" spellCheck={false} autoComplete="off" /></label>
            </div>
            <div className="row">
              <label>Amount (USDC)<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <label>Relayer fee (USDC)<input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
              <label>Network
                <select value={chainKey} onChange={(e) => setChainKey(e.target.value as ChainKey)}>
                  {PAY_CHAINS.map((c) => <option key={c} value={c}>{CHAINS[c].chain.name}</option>)}
                </select>
              </label>
            </div>
            <button disabled={!!busy || !me.trim() || !to.trim() || !(Number(amount) > 0)}>
              {busy && !prep ? <><span className="spin" aria-hidden="true" />{busy}</> : <>Prepare payment {Icon.arrow(16)}</>}
            </button>
          </form>

          {prep && (
            <section className="card step-card spend-sign" aria-labelledby="sign-title">
              <div className="step-head"><span className="step-num">2</span><h2 id="sign-title">Sign and send</h2></div>
              {paid ? (
                <Done
                  title={`Sent ${formatUnits(prep.amount, 6)} USDC`}
                  sub={<>to {prep.toLabel} on {CHAINS[prep.chainKey].chain.name}{paid.note && <><br />{paid.note}</>}</>}
                  url={paid.url}
                  again={() => { setPaid(null); setPrep(null); setSig(""); setLink(""); }}
                  againLabel="New payment"
                />
              ) : (<>
              <div className="fromto">
                <img src={prep.user.avatarUrl} alt="" width={36} height={36} />
                <div>
                  <strong>@{prep.user.login}</strong>
                  <span className="muted">
                    <a href={`${CHAINS[prep.chainKey].explorer}/address/${prep.account}`} target="_blank" rel="noreferrer">{short(prep.account)}</a> · {formatUnits(prep.balance, 6)} USDC on {CHAINS[prep.chainKey].chain.name}
                  </span>
                </div>
                <span className="fromto-arrow" aria-hidden="true">{Icon.arrow(18)}</span>
                <div>
                  <strong>{formatUnits(prep.amount, 6)} USDC</strong>
                  <span className="muted">to {prep.toLabel}</span>
                </div>
              </div>
              {prep.balance < needed && <p className="error">The account holds {formatUnits(prep.balance, 6)} USDC; this needs {formatUnits(needed, 6)} (amount plus fee).</p>}
              {prep.keys.length === 0 ? (
                <p className="error">{prep.user.login} has no SSH keys on GitHub. Add one at github.com/settings/keys, then prepare again.</p>
              ) : (
                prep.keys.some((x) => !x.listed) && (
                  <div className={listed ? "note" : "error"}>
                    {listed
                      ? `${prep.keys.filter((x) => !x.listed).length} of ${prep.user.login}'s GitHub keys isn't on-chain yet.`
                      : `None of ${prep.user.login}'s GitHub keys is on-chain yet, so they can't spend.`}{" "}
                    <button type="button" className="small" onClick={syncKeys} disabled={!!syncMsg}>Sync my keys from GitHub</button>
                    {syncMsg && <div className="busy">{syncMsg}</div>}
                  </div>
                )
              )}

              <div className="substep">
                <h3><span>a</span>Save the text you're signing</h3>
                <div className="cmd stack">
                  <pre className="intent">{prep.text}</pre>
                  <button type="button" className="small secondary" onClick={download}>Download intent.txt</button>
                </div>
                <p className="muted">Download it rather than copying: the signature covers every byte. Run the next commands where it's saved.</p>
              </div>

              <label className="keyfile">
                <span>Your key file</span>
                <input value={keyFile} onChange={(e) => setKeyFile(e.target.value)} spellCheck={false} autoComplete="off" />
              </label>
              {prep.keys.length > 0 && (
                <details className="details small-details">
                  <summary>Which file is which?</summary>
                  <p className="muted">
                    Any key on your GitHub profile works; this only fills <code>-f</code> below. Match a file with <code>ssh-keygen -lf "$HOME/.ssh/&lt;name&gt;.pub"</code>:
                  </p>
                  <ul className="keylist">
                    {prep.keys.map((x, i) => (
                      <li key={i}>
                        <code>{x.type}</code> {x.listed ? <span className="tag ok">on-chain</span> : <span className="tag">not synced</span>}
                        <span className="muted fp">{x.fingerprint}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="segmented wide" role="tablist" aria-label="How to sign">
                <button type="button" role="tab" aria-selected={mode === "sign"} className={mode === "sign" ? "on" : ""} onClick={() => setMode("sign")}>Sign with ssh-keygen</button>
                <button type="button" role="tab" aria-selected={mode === "commit"} className={mode === "commit" ? "on" : ""} onClick={() => setMode("commit")}>Pay with a git commit</button>
              </div>

              {mode === "sign" ? (
                <>
                  <div className="substep">
                    <h3><span>b</span>Sign it</h3>
                    <Cmd lines={[`ssh-keygen -Y sign -n ${SIGNING_NAMESPACE} -O hashalg=sha256 -f ${k} intent.txt`]} />
                  </div>
                  <div className="substep">
                    <h3><span>c</span>Paste intent.txt.sig</h3>
                    <textarea rows={6} value={sig} onChange={(e) => setSig(e.target.value)} placeholder="-----BEGIN SSH SIGNATURE-----" spellCheck={false} />
                    <div className="row between">
                      <label className="file">or pick the file <input type="file" accept=".sig" onChange={(e) => void e.target.files?.[0]?.text().then(setSig)} /></label>
                      <button onClick={submitSignature} disabled={!!busy || !sig.includes("BEGIN SSH SIGNATURE")}>Send payment {Icon.arrow(16)}</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="substep">
                    <h3><span>b</span>Commit it in any public GitHub repo and push</h3>
                    <Cmd lines={["git config gpg.format ssh", `git config user.signingkey ${k}`, "git commit -S --allow-empty --cleanup=verbatim -F intent.txt", "git push"]} />
                    <p className="muted">The commit message is the payment. Add the key on GitHub as a Signing Key too, and GitHub shows it as Verified.</p>
                  </div>
                  <form onSubmit={submitCommit} className="substep">
                    <h3><span>c</span>Paste the pushed commit's link</h3>
                    <div className="row">
                      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://github.com/owner/repo/commit/…" spellCheck={false} aria-label="Commit link" />
                      <button disabled={!!busy || !link.trim()}>Submit commit</button>
                    </div>
                    <p className="muted">Not needed with <code>npx sereno-ak commit-pay --push</code>, or for pushes to the watched demo repo: those are submitted for you.</p>
                  </form>
                </>
              )}
              <Feedback busy={busy} error={error} />
              </>)}
            </section>
          )}

          {!prep && <Feedback error={error} />}
        </div>

        <div className="terminal-row">
          <span className="terminal-row-icon" aria-hidden="true">{Icon.terminal(18)}</span>
          <div>
            <strong>Prefer the terminal?</strong>
            <span className="muted"> The CLI finds your key and sends it for you.</span>
          </div>
          <Cmd lines={[`npx sereno-ak send ${amount || "1"} ${to.trim() || "<to>"} --as ${me.trim() || "<you>"}`]} />
        </div>
      </div>
    </div>
  );
}
