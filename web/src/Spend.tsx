import { useState } from "react";
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
import { clientFor, fetchProfile, PAY_CHAINS, parseCommitLink, relay, short } from "./lib";

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
  keys: { type: string; comment: string; listed: boolean }[];
}

type Result = { url: string; note?: string } | null;

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="small" onClick={() => void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); })}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Cmd({ lines }: { lines: string[] }) {
  const text = lines.join("\n");
  return (
    <div className="cmd">
      <pre>{text}</pre>
      <Copy text={text} />
    </div>
  );
}

export function Spend() {
  const [me, setMe] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1");
  const [fee, setFee] = useState("0.02");
  const [chainKey, setChainKey] = useState<ChainKey>("base-sepolia");
  const [keyPath, setKeyPath] = useState("~/.ssh/id_ed25519");
  const [mode, setMode] = useState<"sign" | "commit">("sign");
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [sig, setSig] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<Result>(null);

  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    if (!CORE) return;
    setBusy("Building the payment text…");
    setError(null);
    setPaid(null);
    setPrep(null);
    setSig("");
    try {
      const c = CHAINS[chainKey];
      const pub = clientFor(chainKey);
      const { user, keys: lines } = await fetchProfile(me.trim());
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
          const [type = "", , comment = ""] = line.split(" ");
          return { type, comment, listed: since > 0n };
        }),
      );
      setPrep({ chainKey, user, account, balance, nonce, to: toAddr, toLabel, amount: amt, fee: f, text, keys });
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

  const k = keyPath.trim() || "~/.ssh/id_ed25519";
  const needed = prep ? prep.amount + prep.fee : 0n;
  const listed = prep?.keys.some((x) => x.listed);

  return (
    <>
      <p className="lead">
        Spend from your account with the SSH key on your GitHub profile. You sign a short text with the <code>ssh-keygen</code> or <code>git</code> you already
        have; nothing to install, and your key never touches this page.
      </p>

      <form onSubmit={prepare} className="card form">
        <label>Your GitHub username<input value={me} onChange={(e) => setMe(e.target.value)} placeholder="you" spellCheck={false} /></label>
        <label>Pay to (GitHub username or 0x address)<input value={to} onChange={(e) => setTo(e.target.value)} placeholder="alice or 0x…" spellCheck={false} /></label>
        <div className="row">
          <label>Amount (USDC)<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>Relayer fee (USDC)<input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
          <label>Chain
            <select value={chainKey} onChange={(e) => setChainKey(e.target.value as ChainKey)}>
              {PAY_CHAINS.map((c) => <option key={c} value={c}>{CHAINS[c].chain.name}</option>)}
            </select>
          </label>
        </div>
        <label>Your SSH private key file (only used to fill in the commands below)<input value={keyPath} onChange={(e) => setKeyPath(e.target.value)} spellCheck={false} /></label>
        <button disabled={!!busy || !me.trim() || !to.trim() || !(Number(amount) > 0)}>Prepare payment</button>
      </form>

      {prep && (
        <section className="card">
          <div className="muted">
            From {prep.user.login}'s account <a href={`${CHAINS[prep.chainKey].explorer}/address/${prep.account}`} target="_blank" rel="noreferrer">{short(prep.account)}</a> on{" "}
            {CHAINS[prep.chainKey].chain.name} · balance {formatUnits(prep.balance, 6)} USDC · nonce {prep.nonce.toString()} · to {prep.toLabel}
          </div>
          {prep.balance < needed && <p className="error">The account holds {formatUnits(prep.balance, 6)} USDC; this needs {formatUnits(needed, 6)} (amount plus fee).</p>}
          {!listed && (
            <p className="error">
              None of {prep.user.login}'s GitHub keys is listed on-chain yet{prep.keys.length === 0 ? " (the profile has no SSH keys)" : ""}. The Chainlink key oracle has to
              see the key before it can spend.
            </p>
          )}

          <h3>1. Save the text you're signing</h3>
          <div className="cmd">
            <pre className="intent">{prep.text}</pre>
            <button type="button" className="small" onClick={download}>Download intent.txt</button>
          </div>
          <p className="muted">Download it rather than copy-pasting: the signature covers every byte, including the final newline. Run the commands below where the file is saved.</p>

          <div className="tabs">
            <button type="button" className={mode === "sign" ? "on" : ""} onClick={() => setMode("sign")}>Sign with ssh-keygen</button>
            <button type="button" className={mode === "commit" ? "on" : ""} onClick={() => setMode("commit")}>Pay with a git commit</button>
          </div>

          {mode === "sign" ? (
            <>
              <h3>2. Sign it</h3>
              <Cmd lines={[`ssh-keygen -Y sign -n ${SIGNING_NAMESPACE} -O hashalg=sha256 -f ${k} intent.txt`]} />
              <h3>3. Paste intent.txt.sig</h3>
              <textarea rows={7} value={sig} onChange={(e) => setSig(e.target.value)} placeholder="-----BEGIN SSH SIGNATURE-----" spellCheck={false} />
              <label className="file">or pick the file <input type="file" accept=".sig" onChange={(e) => void e.target.files?.[0]?.text().then(setSig)} /></label>
              <button onClick={submitSignature} disabled={!!busy || !sig.includes("BEGIN SSH SIGNATURE")}>Send payment</button>
            </>
          ) : (
            <>
              <h3>2. Commit it in any public GitHub repo and push</h3>
              <Cmd
                lines={[
                  "git config gpg.format ssh",
                  `git config user.signingkey ${k}`,
                  "git commit -S --allow-empty --cleanup=verbatim -F intent.txt",
                  "git push",
                ]}
              />
              <p className="muted">
                The commit message is the payment. Add the key on GitHub as a <em>Signing Key</em> too and GitHub shows the commit as Verified. Then paste the commit's link
                below.
              </p>
            </>
          )}
        </section>
      )}

      <form onSubmit={submitCommit} className="card form">
        <h3>Paste a payment commit</h3>
        <p className="muted">A pushed commit whose message is a Sereno payment. The relayer reads it from GitHub, the contract checks the signature, and the payment goes through.</p>
        <div className="row">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://github.com/owner/repo/commit/…" spellCheck={false} />
          <button disabled={!!busy || !link.trim()}>Submit commit</button>
        </div>
      </form>

      {busy && <p className="busy">{busy}</p>}
      {error && <p className="error">{error}</p>}
      {paid && (
        <p className="ok-msg">
          Paid. <a href={paid.url} target="_blank" rel="noreferrer">View transaction</a>
          {paid.note && <span className="muted"> {paid.note}</span>}
        </p>
      )}
    </>
  );
}
