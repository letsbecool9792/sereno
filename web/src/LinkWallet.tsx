// #link-wallet (opened by the browser extension): prove you own a wallet so the extension's automations may sweep to
// it. The wallet signs one readable line naming the GitHub ID, the sereno account and itself; the extension (and only
// it: externally_connectable) checks that signature before it trusts the address. Nothing is sent anywhere else.
import { useState } from "react";
import { isAddress } from "viem";
import { EXTENSION_ID } from "@sereno/shared";
import { connectWallet, useWallets } from "./lib";
import { PageHead } from "./ui";

declare const chrome: { runtime?: { sendMessage: (id: string, msg: unknown, cb: (r: { result?: unknown; error?: string } | undefined) => void) => void; lastError?: { message?: string } } } | undefined;

export const linkText = (githubId: string, account: string, wallet: string) =>
  `Sereno: forward payments from github-id ${githubId} (account ${account.toLowerCase()}) to ${wallet.toLowerCase()}`;

export function LinkWallet() {
  const q = new URLSearchParams(window.location.search);
  const ext = q.get("ext") ?? EXTENSION_ID;
  const githubId = q.get("id") ?? "";
  const account = q.get("account") ?? "";
  const wallets = useWallets();
  const [walletName, setWalletName] = useState("");
  const choice = wallets.find((w) => w.name === walletName) ?? wallets.find((w) => /metamask/i.test(w.name)) ?? wallets[0];
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const valid = /^\d+$/.test(githubId) && isAddress(account) && /^[a-p]{32}$/.test(ext);

  async function link() {
    if (!choice) return setErr("No browser wallet found. Install MetaMask, Rabby or Phantom.");
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return setErr("Open this page from the sereno extension, in the same browser.");
    setErr(null);
    try {
      const { wallet, from } = await connectWallet(choice, "base-sepolia", setBusy);
      const message = linkText(githubId, account, from);
      setBusy(`Sign in ${choice.name}…`);
      const signature = await wallet.signMessage({ account: from, message });
      setBusy("Handing it to the extension…");
      await new Promise<void>((resolve, reject) =>
        chrome!.runtime!.sendMessage(ext, { type: "linkWallet", wallet: from, signature }, (r) => {
          if (!r) return reject(new Error(chrome!.runtime!.lastError?.message ?? "The extension didn't answer. Is it installed?"));
          if (r.error) return reject(new Error(r.error));
          resolve();
        }),
      );
      setLinked(from);
    } catch (e) {
      const m = (e as Error).message.split("\n")[0] ?? "failed";
      setErr(/rejected|denied/i.test(m) ? "The request was rejected in the wallet." : m);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="column">
      <PageHead title="Link a wallet" sub="Let the extension's automations forward your payments here." />
      <section className="card">
        {!valid ? (
          <p className="error">Open this page from the sereno extension (Automate → Link a wallet).</p>
        ) : linked ? (
          <>
            <p className="ok-msg">Linked <code>{linked}</code>. You can close this tab and add a sweep in the extension.</p>
          </>
        ) : (
          <>
            <p className="muted">
              Your wallet signs this line. It costs nothing and moves nothing; it only proves the address is yours.
            </p>
            <pre className="intent">{linkText(githubId, account, "<your wallet>")}</pre>
            {wallets.length > 1 && (
              <div className="segmented">
                {wallets.map((w) => (
                  <button type="button" key={w.name} className={choice?.name === w.name ? "on" : ""} onClick={() => setWalletName(w.name)}>{w.name}</button>
                ))}
              </div>
            )}
            {err && <p className="error">{err}</p>}
            <button onClick={link} disabled={!!busy}>{busy ?? `Link ${choice?.name ?? "a wallet"}`}</button>
          </>
        )}
      </section>
    </div>
  );
}
