# sereno for GitHub (browser extension)

Your GitHub account is the wallet. The extension keeps its own signing key (P-256, encrypted with your password),
puts it on your GitHub profile as a **signing key**, and spends from your sereno account with it. Nothing to back up:
the money belongs to your GitHub ID, not the key. The design is [EXTENSION_DESIGN.md](EXTENSION_DESIGN.md).

## Install

```sh
bun install
cd extension && bun run build
```

Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and pick
`extension/dist`. The ID is fixed (`fnffhlmjmpnglceomjiigjdfhildhpdl`, from the manifest's `key`), so the native
helper and the pay page's wallet link can name it. The build also writes `extension/sereno-extension.zip`.

## First run

1. **Create a browser key**, behind a password of at least 10 characters.
2. **Put it on GitHub.** Type your username, copy the key, and add it at github.com/settings/ssh/new as a
   **Signing Key** (it can't push code or open SSH sessions). The extension watches your profile and continues.
3. **Sync.** The relayer queues the Chainlink key oracle (the sync worker must be running), and the popup ticks
   Base, Arbitrum and Sepolia.

A new key can send up to 50 USDC per payment for its first 72 hours (the contract's rule).

## The popup

| Screen | What it does |
|---|---|
| Home | Balance on Base and Arbitrum Sepolia, address, `<you>.sereno.eth`, this key's on-chain status, escrows waiting (Claim) |
| Send | To a GitHub username, `name.sereno.eth` or `0x…`. **Review** shows the payee (avatar, ID) and **the exact text you sign**, read from the account contract, plus anything that would make it revert (balance, key not synced, 72 h limit). Over the "confirm again" amount it asks for the password. "Pay from another wallet" opens the pay page |
| History | From chain logs only: sent (marked "commit" for commit payments), received, bounties won, escrows. Sereno accounts show as `@login`. CSV export |
| Automate | **Sweep** to a linked wallet; **recurring** payments to a GitHub ID (stored by ID, so renames can't redirect them). Daily cap, a password to turn anything on or raise a limit, stop after 3 errors |
| Settings | Badges on GitHub pages, confirm-again amount, fee, auto-lock; **Claim** your name; **use my own SSH key**; remove the browser key |

**Linking a wallet** (for sweeps): Automate → Link a wallet opens the pay page's `#link-wallet`. Your wallet signs one
line (`Sereno: forward payments from github-id … (account …) to <wallet>`). The page hands that line to the extension,
which only accepts it from the pay page's origin and checks the signature itself.

**Your own SSH key** (laptop key, security key, or the phone on Windows): run `npx sereno-ak connect` once. It
registers `ak` as the native messaging host `com.sereno.ak` for Chrome, Edge and Brave, and admits only this
extension. Then Send offers "My SSH key". `ak` signs with `ssh-keygen` from `~/.ssh` or `ssh-agent` and returns only
the signature.

## On github.com

| Page | Buttons | Status (with badges on, or after "Check") |
|---|---|---|
| Profile | **Pay @user** (Send window), **Other wallet** (pay page) | `user.sereno.eth` (claimed or not), USDC balance |
| Your profile | **sereno account**, **Sync my keys**, **Claim name** | Your name and balance |
| Issue | **Fund a bounty** (pay page) | Pot per chain, winner, **Pay out** (relayer), **Refund** |
| Pull request | **Tip @author** | "Merging pays #N's X USDC bounty to @author" |
| Commit | **Tip @author** | Payment commit: **Paid** (tx), **Invalid**, or **Unpaid** with **Relay this payment** |
| Repository | **Pay by commit** (copies `npx sereno-ak commit-pay … --push`) | |
| Settings → SSH keys | **Sync to sereno** | Each key: on-chain since, cooling down until, or not synced |

No button signs: paying always goes through the Send screen's confirm step. **Privacy:** with badges off (the
default), the extension looks nothing up while you browse.

## Security model

- **The key:** PBKDF2-SHA256 (600 000 iterations) → AES-256-GCM at rest. It's in plaintext only in
  `chrome.storage.session` while unlocked, which is RAM only, cleared on browser close, and not readable by content
  scripts. It auto-locks when idle (15 min by default) and on browser start. After 5 wrong passwords, each try waits
  longer.
- **The signature** is the same SSHSIG `ssh-keygen -Y sign -n sereno@v1 -O hashalg=sha256` makes, normalized to low-s.
  `src/sshsig.test.ts` checks it against the deployed SshSigVerifier on Base Sepolia and against `ssh-keygen -Y verify`.
- **No site can ask it to sign.** It injects no `window.ethereum`, and the only external message it accepts is a
  signed wallet link from the pay page.
- **The kill switch is GitHub.** Delete "Sereno browser key" at github.com/settings/keys; the next sync stops it
  on-chain.
- Automations are guarded by the extension, not the chain: allowlisted destinations, a daily cap, and the password to
  widen anything. They run only while the browser runs and the vault is unlocked.

## Code

`src/background.ts` holds the vault, signing, automations and all network calls. The rest:

| File | What it is |
|---|---|
| `vault.ts` | The vault |
| `wallet.ts` | Payee resolution, pre-checks, send, name and escrow claims |
| `history.ts` | Log scanning |
| `automations.ts` | Sweep and recurring payments |
| `native.ts` | The native helper client |
| `sshsig.ts` | The WebCrypto SSHSIG encoder |
| `content.ts` | The GitHub page buttons |
| `github.ts` | Pure parsing, tested |
| `popup/` | React, in the pay site's design system |

No analytics or trackers.
