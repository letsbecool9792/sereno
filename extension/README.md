# Sereno for GitHub (browser extension)

Adds Sereno to the GitHub pages where paying someone makes sense. It is not a wallet: it holds no keys, and every
payment happens on the [pay page](https://sereno-eth.vercel.app) with your own wallet, opened prefilled in a small window.

| Page | What it adds |
|---|---|
| Profile | **Pay @user**, their `<user>.sereno.eth` name, and their USDC balance. On your own profile: **Spend** |
| Issue | The bounty on it (amount and chain, or "Bounty paid to @winner"), and **Fund a bounty** / **Add to bounty**. The relayer pays it out automatically when a merged PR closes the issue |
| Pull request | **Tip @author**, and "Merging pays #12's 5 USDC bounty to @author" for each bounty the PR closes |
| Commit | **Tip @author**. On a payment commit: the amount and chain, then **Paid** (with the transaction) or **Submit payment** (the relayer submits it) |

## Install (unpacked)

```sh
bun install
cd extension && bun run build
```

Then open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked**, and pick
`extension/dist`. The build also writes `extension/sereno-extension.zip`.

## How it works

- `src/content.ts` runs on github.com. It reads the page (URL, the profile's numeric ID from its metadata, a commit's
  `.patch`) and puts a bar of buttons under the title. It uses GitHub's own theme variables, so light and dark mode both
  work. If GitHub's layout changes and no anchor is found, the bar floats in the bottom-right corner instead.
- `src/background.ts` (service worker) makes the read-only JSON-RPC calls (balances, bounty pots, a payment's nonce) to
  public RPCs with fallbacks. It also forwards "Submit payment" to the relayer and looks up a winner's login. GitHub's
  page CSP never applies to these requests.
- `src/github.ts` holds the pure parsing (page routing, payment commits, closing keywords), tested in `github.test.ts`.
- **No analytics or trackers.** The only hosts it contacts are the public RPCs, our relayer (only when you press
  "Submit payment") and `api.github.com` (a winner's login).
