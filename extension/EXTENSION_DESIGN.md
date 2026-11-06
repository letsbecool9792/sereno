# Sereno browser extension: design

Status: **design only, nothing built.** Owner: WS3 (Suparno). Written by Mohikshit with Claude, 6 Nov 2026.
It covers extras C1/C2 from `CLAUDE.md` §4 and goes further: an in-browser signing key, automations (sweep to a
MetaMask wallet, recurring payments), transaction history, and a button on github.com for every core feature.

It changes no section-5 interface and no contract. Every number below comes from the code on `main`
(`contracts/src/SshAccount.sol`, `relayer/src/main.ts`, `cli/src/main.ts`, `web/src/App.tsx`).

---

## 1. What the extension is, and what it is not

**Is:** a MetaMask-style popup for a *Sereno account* (the `SshAccount` at `factory.addressOf(githubId)`):
see balances, pay anyone by GitHub username, set up automatic payments, see history, and get Pay / Tip / Bounty /
Sync / Claim buttons injected into github.com.

**Is not:**
- **Not a dApp wallet.** It does not inject `window.ethereum`. `SshAccount` only moves ERC-20s with an SSH-signed
  intent (`execute`, `executeCommit`); it has no generic call, so Uniswap, OpenSea etc. can't use it. Making it one
  would need a new account contract (and new addresses, see §6.5). Out of scope.
- **No ETH.** `SshAccount` has no `receive()` and `_transfer` only calls ERC-20 `transfer`. The extension shows and
  moves ERC-20s only (USDC first). A plain ETH send to an account reverts; the UI must say so.
- **Never holds the user's existing SSH key**, and never asks for any private key to be pasted or imported (§3).
  Like MetaMask, it makes its own key and keeps it in a password-encrypted vault.

## 2. What already exists and gets reused

| Need | Existing piece | Where |
|---|---|---|
| Intent text, chain config, addresses, ABIs | `@sereno/shared` (`buildIntent`, `CHAINS`, `CORE`, `EXTRAS`, `sshAccountAbi`, `keyHash`, `armor`) | `packages/shared/src` |
| Exact text to sign | `SshAccount.intent(token, to, amount, fee, nonce)` view | contract |
| Username → numeric ID → address | hosted gateway (`HOSTED_GATEWAY_URL`), as `ak` does without a token | `gateway/` |
| Submit a signed spend | `POST /intent {chainId, githubId, token, to, amount, fee, signature}` | `relayer/src/main.ts` |
| Relay a payment commit | `POST /commit {repo, sha}` | relayer |
| Claim a name | `POST /claim {label, githubId, signature}` | relayer |
| Put keys on-chain | `POST /sync {login}`, `GET /sync/status/<githubId>` (needs the sync worker running) | relayer |
| Bounty state | `GET /bounty/status?chainId&repo&issue`, `POST /bounty` | relayer |
| Pay from any EVM wallet | pay page, prefilled with `?user=<login>` | `https://sereno-eth.vercel.app` |
| Signing with the user's own key | `ak send`, `ak commit-pay`, `ak claim`, `ak sync` | `cli/` (`sereno-ak`) |

Default relayer fee: **0.02 USDC** (same as `ak send`, `cli/src/main.ts:230`).

## 3. Connecting a key (requirement 3): the MetaMask model, adapted

The account can be spent by *any* key the oracle lists for the GitHub ID. So the extension doesn't need the
user's existing key: like MetaMask, it **makes its own key, keeps it encrypted behind a password, and asks before
every signature**. Then it puts that key's public half on the GitHub profile.

**Rule: no private key is ever pasted, imported, typed, exported or shown, in either direction.** The user's own
SSH key stays where it is: in `ssh-agent`, on a security key or on the phone (§3.2). The browser key never leaves
the extension.

### 3.0 MetaMask, side by side

| | MetaMask | Sereno extension |
|---|---|---|
| Where the key comes from | Generated in the extension (Secret Recovery Phrase) | Generated in the extension (P-256) |
| At rest | Vault encrypted with the user's password | The same: an encrypted vault (PBKDF2 → AES-GCM, §3.5), plus optional passkey unlock |
| When unlocked | Key in memory only; auto-lock | The same: memory only (`chrome.storage.session`), auto-lock on idle and on browser close |
| Before each signature | Confirm popup | Confirm popup showing the **exact signed text** (§4) |
| Sites asking to sign | Any site can request it through `window.ethereum` | **No site can.** No provider is injected; only the extension's own UI starts a payment |
| Hardware option | Ledger / Trezor | Your own SSH key, security key or phone through the native helper (§3.2) |
| **Backup and recovery** | **Write down 12 words; lose them and the funds are gone** | **Nothing to back up.** The money belongs to the GitHub ID, not the key (§3.6) |
| If the device is stolen | Move the funds before the thief guesses the password | Delete the key on GitHub; the next sync stops it on-chain (§3.6) |

Recovery is the one place we do better than MetaMask by design: the key is replaceable, and the account isn't tied
to it.

### 3.1 "Create a browser key" (default, no install)

1. **Sign in with GitHub (device flow).** The popup shows a code and opens `github.com/login/device`. The user types
   the code and approves. We need a GitHub OAuth App with device flow enabled; its `client_id` ships in the
   extension (device flow needs no client secret). Scope: **`write:ssh_signing_key` only**. The background worker
   calls `POST github.com/login/device/code` and polls `.../login/oauth/access_token`. The github.com host
   permission lets the worker make these calls without CORS problems.
2. **Set a password, then generate the key.** First the user picks the vault password (at least 10 characters,
   with a strength meter), and optionally adds a passkey (§3.5). Then
   `crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])`. The private half is
   exported once as `pkcs8`, **encrypted straight into the vault**, and the plaintext buffer is zeroed. It is never
   stored unencrypted and never shown. The public half is exported as `raw` (`0x04 ‖ X ‖ Y`).
3. **Build the SSH public key.** `blob = string("ecdsa-sha2-nistp256") ‖ string("nistp256") ‖ string(0x04‖X‖Y)`,
   giving `ecdsa-sha2-nistp256 <base64(blob)> sereno-browser-<date>`. Its `keyHash = keccak256(blob)`, as in §5.2.
4. **Add it to GitHub automatically:** `POST https://api.github.com/user/ssh_signing_keys {title: "Sereno browser
   key", key}` with the token. Then `GET /user` gives `id` and `login`. **Drop the token**: it is never stored.
   - It's added as a **signing key, not an authentication key**. The oracle reads both lists (§8.3), and a signing
     key can't push code or open SSH sessions. If the browser key ever leaks, it can't touch the user's repos.
5. **Sync.** `POST /sync {login}`, then poll `GET /sync/status/<githubId>` and show "Base ✓ Sepolia ✓ Arbitrum ✓".
   Then read `KeyOracle.firstSeen(githubId, keyHash)` on each chain to confirm.
6. **Done.** The popup shows the account address, balances, and "This key can spend up to 50 USDC per payment
   until <firstSeen + 72 h>" (the on-chain `INSTANT_LIMIT` and `NEW_KEY_DELAY`).

**Fallback without OAuth:** show the public key with a Copy button and open `https://github.com/settings/ssh/new`.
The user pastes it and picks "Signing Key"; the extension watches `/sync/status` and continues from step 5.

**Signing.** SSHSIG for `ecdsa-sha2-nistp256` (`PROTOCOL.sshsig`), all in WebCrypto:
- `signedData = "SSHSIG" ‖ string("sereno@v1") ‖ string("") ‖ string("sha256") ‖ string(SHA-256(intent))`
- `rs = subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signedData)` returns 64 bytes `r ‖ s`.
  **Normalize to low-s** (`s = n − s` if `s > n/2`): it's valid either way, and this rules out a verifier that rejects
  high-s.
- `sig = string("ecdsa-sha2-nistp256") ‖ string(mpint(r) ‖ mpint(s))`
- `SSHSIG = "SSHSIG" ‖ uint32(1) ‖ string(blob) ‖ string("sereno@v1") ‖ string("") ‖ string("sha256") ‖ string(sig)`,
  which is posted as `signature` (armored with `armor()`, as `ak` posts it).

Why P-256 is the right type: it uses the `0x100` precompile, **about 189k gas per payment versus about 1.07M for
the ed25519 keys most developers have** (§8.1, and the M1 log). Relayer fees can be lower. It also works for
**name claims on Sepolia**, where ed25519 isn't deployed.

### 3.2 "Use my existing SSH key" (native helper, power users)

For people who want their laptop key, a security key, or the **phone** (A8, Windows only) to approve payments.

1. The popup says: run `npx sereno-ak connect`.
2. That command (new, in `cli/`) writes a Chrome/Firefox **native messaging host** manifest
   (`com.sereno.ak`) pointing at `ak`. `allowed_origins` names only our extension ID. It prints which key it
   found, with its fingerprint and whether the oracle lists it.
3. The extension calls `chrome.runtime.connectNative("com.sereno.ak")` and sends `{op: "sign", text}`. The helper
   runs `ssh-keygen -Y sign -n sereno@v1 -O hashalg=sha256` through `ssh-agent`, exactly as `ak send` does, and
   returns the armored SSHSIG. The private key stays in the agent, on the phone or on the security key.
4. Extra ops this enables: `commit-pay` (runs `git commit -S` in a chosen repo) and the phone flow.

A spend through the helper has the same popup confirmation as one with the browser key. A key that needs a passphrase
or a touch (security key, phone) prompts the user on every signature, so the helper can't be used for
automations (§5).

### 3.3 Several keys

An account can have a browser key and a laptop key at once (the oracle lists the full set). The popup lists the
keys from `KeyOracle.keysOf(githubId)`, labels the ones it knows ("this browser", "via ak"), shows `firstSeen` and
the cooling-down timer, and marks keys that are on GitHub but not yet on-chain ("Sync now").

### 3.4 Why the extension never imports a private key

Requirement 3 asked for a command that hands the extension the private and public key. We don't do that. The user's
existing SSH key is also their **GitHub push key and server login**. Copying it into a browser profile would turn
it into a hot key that can push code, not just spend USDC. The browser key in §3.1 gives the same smooth flow (one
code, one click, done), with a key that is encrypted at rest, signing-only, and revocable alone. Revocation is the
A3 story: delete "Sereno browser key" on GitHub, and the next oracle run removes it on-chain.

### 3.5 The vault: lock, unlock, auto-lock

**Stored in `chrome.storage.local`:**
```json
{ "v": 1, "publicKey": "ecdsa-sha2-nistp256 AAAA…",
  "password": { "kdf": "PBKDF2-SHA256", "iterations": 600000, "salt": "…", "iv": "…", "ct": "…" },
  "passkey":  { "credentialId": "…", "prfSalt": "…", "iv": "…", "ct": "…" } }
```
- **Password copy:** `vaultKey = PBKDF2(password, salt, 600 000, SHA-256)` (the OWASP figure), then AES-256-GCM over
  the `pkcs8` bytes. A stolen profile on disk is useless without the password, as with MetaMask.
- **Passkey copy (optional):** the WebAuthn **PRF extension** returns a 32-byte secret from Windows Hello, Touch ID or
  a phone, which goes through HKDF into a second AES-GCM key that wraps the same `pkcs8`. Unlocking is then a
  fingerprint instead of typing the password. The password copy stays as the fallback. Whether WebAuthn and PRF work
  on the extension's own origin in Chrome must be checked first (§11); without them, it's password only.

**Unlocking:** decrypt, then `importKey("pkcs8", …, false, ["sign"])` gives a **non-extractable** `CryptoKey` for
signing. MV3 kills the background worker when it's idle, so the session keeps the decrypted `pkcs8` in
`chrome.storage.session`, which is RAM only, cleared when the browser closes, and not readable by content scripts
(access level `TRUSTED_CONTEXTS`, the default). That is the same trade-off MetaMask makes in MV3.

**Locking:** on demand (a lock button), after an idle timeout (15 min by default, up to 24 h when the user turns
automations on, §5), and on browser close. Locking clears `chrome.storage.session`.

**Locked means nothing signs:** no payments, no automations, no claims. The popup shows a lock screen. Balances and
history still work, because they're public chain data.

**Wrong passwords:** after 5 wrong tries the extension waits between attempts, increasing the wait each time. That
slows guessing in the UI. It doesn't stop offline guessing against a copied profile, which is why the iteration
count and password length matter.

### 3.6 Recovery: no seed phrase

- **New computer, or reinstall:** make a new browser key (§3.1, about a minute), then delete the old one on GitHub.
  The account address, the balance and the history are unchanged, because they belong to the GitHub ID.
- **Forgotten password:** the same, since there's nothing to recover. Delete the old key on GitHub and make a new
  one.
- **Stolen laptop:** from any device, delete "Sereno browser key" on `github.com/settings/keys`, then press
  "Sync my keys" on the pay page or run `ak sync <user>`. After that sync, the stolen key can't spend. Before the
  sync, a locked vault still needs the password.
- **Cooling down again:** a replacement key is new, so for 72 h it can only send up to 50 USDC per payment. The
  user's older keys (laptop, security key) aren't affected.
- **Lost GitHub account:** the funds can only be spent by keys GitHub lists for the ID, so GitHub's own account
  recovery is the backstop. This is the trust assumption already stated under S in `CLAUDE.md` §9.

### 3.7 Not now: a passkey as the SSH key itself

The strongest version would make the passkey *the* signing key: hardware-backed, a fingerprint per payment, never in
memory. OpenSSH defines this as `webauthn-sk-ecdsa-sha2-nistp256@openssh.com`. Our `SshSigVerifier` checks only the
U2F form (`SHA256(application) ‖ flags ‖ counter ‖ SHA256(signed data)`), not WebAuthn's `clientDataJSON`. Adding
it means a new verifier, and the verifier's address is a constructor argument of `SshAccount`, so **every account
address would change**. This is a roadmap item together with §5.4. Today the same strength comes from the native
helper with a security key or the phone (§3.2).

## 4. Paying (requirement 2, manual)

**Popup → Send:**
1. To: a GitHub username, **any ENS name** (`alice.sereno.eth`, `alice.eth`, `pay.alice.eth`), or a `0x` address
   (§4.1). A username is resolved through the gateway to its numeric ID, and the address is computed locally with
   `factory.addressOf(id)` (the same on every chain). The popup stores the **ID**, not the name, so a rename can't
   redirect a saved payee.
2. Chain (Base Sepolia by default; Arbitrum Sepolia), token (USDC), amount, fee (0.02 USDC by default).
3. **Pre-checks:** the balance must cover amount + fee; the key must be listed; if `amount > 50 USDC` and the key is
   newer than 72 h, show "available after <time>" instead of letting the contract revert.
4. **Confirm screen:** shows the **exact intent text** read from `SshAccount.intent(...)` with the current `nonce()`
   (§5.1), not a summary. It also shows the payee's GitHub avatar and login, resolved from the **ID**. Buttons:
   Confirm / Cancel. The vault must be unlocked. Payments over a user-set amount (default 20 USDC) ask for the
   password or passkey again, even while unlocked.
5. Sign (§3.1 or §3.2), `POST /intent`, and show the explorer link from the relayer's response.

**Pay from MetaMask instead:** the Send screen has a "Pay from another wallet" link. It opens
`https://sereno-eth.vercel.app/?user=<login>` (already supported), where MetaMask, Phantom etc. connect as usual.
The extension can't talk to MetaMask itself, because MetaMask only injects into web pages, not into extension pages.

### 4.1 Paying an ENS name

The pay page already does the hard part (`web/src/App.tsx`, the `lookup` effect). It resolves through ENSv2's
Universal Resolver on Sepolia with the payment chain's ENSIP-11 coin type and ENS's batch gateway
(`gatewayUrls: ["x-batch-gateway:true"]`, so CCIP-read names work). Then it compares the result with
`factory.addressOf(id)` and refuses on a mismatch. **Move that lookup into `@sereno/shared`** so the pay page and
the extension run the same code. Two kinds of names:

**`<user>.sereno.eth`: always cross-checked.**
1. Normalize the name (ENSIP-15, viem's `normalize`), then take the label and look up the GitHub user through the
   gateway, which gives the numeric ID.
2. Resolve the name with `getEnsAddress({ name, coinType: <chain's coin type> })`.
3. Compute `factory.addressOf(id)` locally. **If the two differ, don't pay** (the pay page's existing "mismatch"
   rule). This protects against a lying gateway and a stale claim.
4. If `NameRegistrar.holderOf(label)` says the name is stale (its owner renamed on GitHub), show the existing "this
   name moved" message and don't pay (PR #24 behaviour).
5. Claimed or not: the name's resolver isn't our `OffchainResolver` (the pay page's `claimed` check).

**Any other ENS name (`alice.eth`, `dao.alice.eth`, …):**
1. Normalize the name. Show the normalized form and **warn on confusable or mixed-script labels** (ENSIP-15 flags
   them).
2. Resolve the address for the payment chain's coin type. If there's none, fall back to the default EVM address
   (ENSIP-19, coin type `0x80000000`), then to coin type 60 with a warning: "this name only lists an Ethereum
   address; it's assumed to be the same account on Base".
3. Read the text records `com.github` (the ENSIP-5 key), `avatar` and `url`.
4. **Work out what the address is:**
   - It's someone's **Sereno account** if the address has code and its `githubId()` returns an ID with
     `factory.addressOf(id) == address`, or if it isn't deployed but `com.github`'s user has that `addressOf`.
     Show "@login's Sereno account ✓".
   - Otherwise it's a **plain wallet** (an EOA or another contract): "a wallet, not a Sereno account". Paying it
     works: the account's `execute` transfers ERC-20s to any address.
5. If `com.github` names a GitHub user, show "says it belongs to @login" plus whether that user's profile links back
   (§7.1). Without the link back, label it **unverified**.

**Confirm screen for names:** the name as typed, the normalized name, the resolved address, how it was resolved
(coin type, "via gateway (offchain)" or "onchain"), and the Sereno/wallet label from step 4. That's the same "show
what you sign" rule as §4 step 4: the intent text contains the address, not the name.

**Saved payees and recurring rules** that use a name store **both the name and the address resolved at setup**.
Each run re-resolves the name. If the name now points somewhere else, the rule **pauses and asks** instead of
following it. An expired, transferred or hijacked name can't redirect an automation. `sereno.eth` payees are stored
by GitHub ID as before (§5.2).

**Which ENS network:** the environment's. In the testnet build that's Sepolia ENS, where `sereno.eth` and our
contracts live. Names on Sepolia **aren't the real-world names** (anyone can register `vitalik.eth` there), so the
UI marks non-`sereno.eth` names "Sepolia ENS" and treats them as unverified unless §7.1's two-way link holds. A
mainnet launch switches resolution to mainnet ENS.

**Privacy:** name lookups go to the RPC, to ENS's batch gateway and, for `sereno.eth` names, to our gateway. They
run on submit, not on every keystroke.

## 5. Automations (requirements 1 and 2)

Automations sign **without the user present**, so only the browser key (§3.1) can run them: the helper's keys
need a touch or a passphrase. They run in the MV3 background worker on `chrome.alarms` (the minimum period is 30 s;
we use minutes).

**Automations run only while the vault is unlocked.** We don't keep a separate always-unlocked key: on-chain, every
listed key can spend the whole balance, so an "automation key" would just be the main key without a password.
Turning automations on lets the user stretch the auto-lock up to 24 h. When the vault locks, rules pause and the
toolbar badge says so. **The browser must be running.** Missed runs execute once on the next unlock, not once per
missed interval.

Sweeps (§5.1) make the trade-off small: they keep the hot balance near zero by moving money to the user's MetaMask
wallet, which has its own password and hardware-wallet support.

Each run does the same thing as a manual payment: read the balance and `nonce()`, build the intent, sign,
`POST /intent`, and write the result into history. Each run is a fresh signature, because the nonce and amount are
part of the signed text. There is no standing signature that a relayer could replay.

### 5.1 Sweep to my wallet (requirement 1)

"Whenever my Sereno account receives money, forward it to my MetaMask wallet."

**Linking the wallet**, so a typo or clipboard malware can't set the destination:
1. Popup → Automations → "Link a wallet" opens `https://sereno-eth.vercel.app/#link-wallet?ext=<extensionId>`
   (a new page on the pay site).
2. The page connects MetaMask (`eth_requestAccounts`) and asks for `personal_sign` on
   `Sereno: forward payments from github-id <id> (account <addr>) to <wallet>`.
3. The page sends `{wallet, signature}` to the extension through `chrome.runtime.sendMessage`. The manifest's
   `externally_connectable` lists only the pay page's origin. The extension checks the signature with viem's
   `verifyMessage` and stores the wallet as a **linked destination**.

**Rule:**
```json
{ "type": "sweep", "chain": "base-sepolia", "token": "USDC", "to": "0xLinkedWallet",
  "keep": "0", "minAmount": "1", "every": "15m" }
```
It runs when `balance − keep ≥ minAmount + fee`, and sends `balance − keep − fee` to the wallet. There is one rule
per chain: the address is the same on every chain, but each chain's balance is separate.

**Limits to show in the UI:**
- With a key under 72 h old, a single sweep is capped at 50 USDC (on-chain). The rule sends in chunks and says so.
- The relayer takes 0.02 USDC per sweep, so `minAmount` stops it sending dust.
- Bounty payouts (`BountyBoard.payout`) and escrow claims land in the account like any other transfer, so a sweep
  forwards them too.

**Reverse direction (MetaMask → Sereno account):** a top-up is just a USDC transfer to the account address. The
extension's "Top up" button opens the pay page with `?user=<self>`. An *automatic* top-up isn't possible: MetaMask
asks for every transaction, and no contract of ours pulls from an allowance.

### 5.2 Recurring payments (requirement 2)

```json
{ "type": "recurring", "chain": "base-sepolia", "token": "USDC", "toGithubId": "172588240",
  "amount": "5", "every": "30d", "until": "2027-06-01", "maxRuns": 12 }
```
"Pay @alice 5 USDC every month." The rule stores the payee's **GitHub ID**, so it pays `addressOf(id)` even if
they rename. Other templates use the same engine:
- **Split:** each incoming payment is split by percentage between a linked wallet and GitHub users.
- **Auto-tip on merge:** a fixed tip to the author of each PR merged into one of my repos. **Not in v1**; it's
  listed only so the rule format leaves room for it.

### 5.3 Guardrails (enforced by the extension, not the chain)

On-chain, the browser key can sign *any* intent. The rules are only as strong as the extension, so:
- Automations may only pay **allowlisted destinations**: linked wallets (§5.1) and GitHub IDs the user picked by
  hand.
- Each rule has a per-run cap and the extension has a **daily total cap** (default 50 USDC), stored with the rules.
- Creating or editing a rule, linking a wallet, or raising a cap needs a click in the popup **and** the password or
  passkey again, even while unlocked. That way a session someone else finds unlocked can't add a new destination.
- Each run is written to history with its rule ID. A failing rule stops after 3 errors and shows a badge.
- The **kill switch** is GitHub: delete the browser key there, and the next oracle sync stops every spend by it.

### 5.4 Without a browser running (later, not v1)

The relayer can't run rules, because it doesn't hold a key, and giving it one would make it custodial. A real
server-side standing order needs **on-chain** rules: an account v2 with, for example, "pay `to` up to `X` per
`period`" set by an SSH-signed intent and executable by anyone. **Any change to `SshAccount` changes every account
address**, because the factory's CREATE2 address hashes the account's creation code. So that means a v2 factory and
a migration (v1 accounts sweep to v2). It's a roadmap item and a Q&A answer, not hackathon work.

## 6. Transaction history (requirement 4)

All of it comes from chain logs, per chain, with no server of ours in between.

| Row | Source | Filter |
|---|---|---|
| Sent (signed text, commit) | `SshAccount.Executed(nonce, token, to, amount, fee, relayer, keyHash, viaCommit)` | `address = account` |
| Received | USDC `Transfer(from, to, value)` | `topic2 = account` |
| Bounty won | `BountyBoard.Paid(repoHash, issue, token, account, amount)` | `address = BountyBoard`, then match `account` (it isn't indexed) |
| Escrow claimed | `Escrow.Claimed(id, githubId, account, keyHash)` | `topic2 = githubId` |
| Escrow waiting for me | `Escrow.Deposited(id, githubId, ...)` with no `Claimed` | `topic2 = githubId` (shows "Claim" when there's one) |
| Key events | `KeyOracle.keysOf` and `firstSeen` | the key list in §3.3 |

- The `Executed` event's `keyHash` shows *which key signed* ("this browser", "laptop key", "phone"), and
  `viaCommit` marks commit payments. That's useful after a revocation.
- **Counterparties:** if a counterparty has code and answers `githubId()`, show `@login` (one gateway lookup, then
  cached). Undeployed accounts can't be reversed, so show the address unless the user paid them by name from the
  extension (that name is cached).
- **Fetching:** public RPCs cap `eth_getLogs` ranges. Page backwards in fixed block windows from the account's
  first activity, cache rows and the last scanned block in `chrome.storage.local`, and only fetch new blocks after
  that. If paging is too slow on Base Sepolia, use the Blockscout API there as an optional source.
- **Pending:** rows from `POST /intent` are shown at once as "submitted" and become "confirmed" once the log appears.
- **Export:** CSV of the rows on screen.

## 7. Buttons on github.com (requirement 5)

A content script on `https://github.com/*`. GitHub navigates with Turbo, so it re-runs on `turbo:load` and uses a
`MutationObserver`. Each button sits next to a stable anchor and **is simply not shown if its selector breaks**;
it never breaks the page. Every button opens the popup (or a small in-page panel) for the confirm screen of §4. No
button signs on its own.

**Privacy (the P in CROPS):** by default the content script makes **no network calls** while you browse. Lookups
(name → ID → balance) happen only when you click. An opt-in setting, "show Sereno badges", allows lookups on
page view.

| Page | Button / badge | Core feature | What it does |
|---|---|---|---|
| Any profile `github.com/<user>` | **Pay @user** | A1, A4, C0 | Send screen with the payee filled in (from your Sereno account, or "from another wallet" to the pay page) |
| | **ENS names under the avatar** (§7.1): `<user>.sereno.eth` always, plus the user's own names such as `alice.eth` when they're linked | A4, A4b | Clicking a name copies it or opens Pay with it. "claimed" or "verified" ticks appear on click, or at once with badges on |
| | **Pay with refund** (in the Pay panel) | A10 | `Escrow.deposit` from a linked wallet via the pay page; refundable after the deadline |
| Your own profile | **Sereno account**: balance on each chain, address, copy | A1, A11 | Reads `balanceOf` on Base and Arbitrum Sepolia |
| | **Sync my keys** | A3 | `POST /sync`, then the status ticks per chain |
| | **Claim <user>.sereno.eth** | A4b | Builds the claim text the way `ak claim` does, signs (browser key is P-256, so it works on Sepolia), `POST /claim` |
| | **Escrows waiting** (n) → Claim | A10 | `Escrow.claim(id, sshsig)` over `claimText(id)` |
| Commit page | **Tip author** | A4, C2 | Send screen to the commit author's GitHub ID |
| Commit page whose message starts with `sereno v1` | Badge: **Payment commit**: paid (tx link), unpaid, or invalid | B1, B3 | Parses the message with `parseIntent`; checks the account's `nonce()` and `Executed` logs |
| | **Relay this payment** | A6, B1 | `POST /commit {repo, sha}` (anyone may relay) |
| Pull request | **Tip author**, **Pay PR author** | C2 | Send screen to the PR author |
| | Badge: "Merging this pays the bounty on #n" | D1 | When the PR closes a funded issue (`GET /bounty/status`) |
| Issue | Badge: **Bounty: 20 USDC**, deadline, winner | D1 | `GET /bounty/status` |
| | **Fund this issue** | D1 | Opens the pay page's Bounties tab prefilled. Funding needs an EOA, because `fund` pulls with `transferFrom` and `SshAccount` can't `approve` |
| | **Pay out** (after settlement) | D1 | `BountyBoard.payout(repoHash, issue, token)`: anyone can call it; the relayer submits |
| | **Refund** (funder, after the deadline) | D1 | `BountyBoard.refund`, from the funder's wallet via the pay page |
| `github.com/settings/keys` | Per key: "on-chain since …", "cooling down until …", "not synced" | A3, A7 | Matches each listed key's `keyHash` against `KeyOracle.firstSeen` |
| | **Sync to Sereno** | A3 | `POST /sync` |
| Repository page | **Pay by commit** (copy command) | B1, A9 | Shows `ak commit-pay <amount> <user> --push` for this repo, or runs it through the native helper (§3.2) |

Not in the extension: the phone-as-key flow (A8) needs Win32-OpenSSH, so it goes through the native helper only.

### 7.1 ENS names on GitHub profiles

A small "ENS" block under the profile's avatar and bio, in the sidebar where GitHub shows the user's links:

```
◈ alice.sereno.eth   claimed ✓          [Pay]
◈ alice.eth          verified ✓          [Pay]
```

**1. `<login>.sereno.eth`: always shown, with no network call.** Every GitHub user has it (the wildcard resolver,
A4), so the content script just builds it from the login on the page. On click, or at once with badges on, it adds:
- **claimed ✓** (a real ENSv2 subname owned by the account, A4b) or **unclaimed** (still resolves through the
  wildcard),
- the account's USDC balance, if the user turned on "show balances".

On your **own** profile, an unclaimed name gets a **Claim** button (§7 table).

**2. The user's own ENS names: shown only when the link goes both ways.** Anyone can write `vitalik.eth` in their
bio, so a name counts only when:
- **GitHub → ENS:** the profile mentions the name, in the bio, the website field or a social link (read from the
  page; no network call), **and**
- **ENS → GitHub:** the name's `com.github` text record (ENSIP-5) equals the login, case-insensitive.

States: **verified ✓** (both directions); **unverified** in grey ("the profile mentions alice.eth, but alice.eth
doesn't name this GitHub account"); and with neither, it isn't shown. A verified name's [Pay] pays whatever the name
resolves to (§4.1); the Sereno/wallet label says which kind of address that is.

**Linking your own ENS name (the extension's "Show my ENS name on GitHub" helper):**
1. In the popup, type the name you own, for example `alice.eth`.
2. The extension checks its `com.github` record. If it's missing, it opens the ENS app's record editor for that name
   (`app.ens.domains/<name>`) and tells you to set `com.github` to your login. Setting a record is a normal wallet
   transaction from the name's owner (MetaMask etc.). The Sereno account can't do it, because it has no generic
   call.
3. Optionally, it also suggests setting the name's address to your Sereno account, so paying `alice.eth` lands in
   the same account as paying `alice.sereno.eth`.
4. It opens `github.com/settings/profile` and tells you to add the name to the bio or as a social link (GitHub has
   no API for us to write it for you).
5. It re-checks both directions and shows the profile badge as it will look.

**`sereno.eth` names need none of this.** A claimed name already has `com.github` set by `NameRegistrar` at claim
time (it sets `url`, `avatar` and `com.github`), and the gateway answers the same records for unclaimed names.

**Why not reverse resolution ("primary name")?** The Sereno account can't set its own reverse record (no generic
call), and a wallet's primary name says nothing about which GitHub user it belongs to. The two-way text-record link
is the check that actually ties a name to a GitHub account.

**Caching and privacy:** results are cached per (login, name) for 10 minutes. Without badges on, nothing about the
profile you're viewing leaves the browser until you click.

## 8. Extension layout and permissions

```
extension/
  manifest.json          MV3
  src/background.ts      device flow, signer, automation engine (chrome.alarms), history indexer
  src/vault.ts           create, unlock, lock, auto-lock (PBKDF2 / PRF → AES-GCM; session in chrome.storage.session)
  src/popup/             React (reuse web/ components and styles): Home, Send, Confirm, Automations, History, Keys
  src/content/github.ts  buttons and badges (section 7)
  src/sshsig-webcrypto.ts  P-256 SSHSIG encoder (move to packages/shared once tested)
```

Permissions (keep them minimal; the store review reads them):
- `storage`, `alarms`, `nativeMessaging` (optional, requested only when the user picks §3.2).
- Host permissions: `https://github.com/*`, `https://api.github.com/*`, the hosted gateway and relayer, and the RPC
  URLs from `CHAINS`.
- `externally_connectable`: `https://sereno-eth.vercel.app/*` only (for wallet linking, §5.1).
- No analytics or trackers (a CROPS rule, §9).

## 9. Threat model

| Threat | What stops it |
|---|---|
| The profile is copied off the disk (stolen laptop, backup, sync) | The vault is encrypted (PBKDF2 600k → AES-GCM). Without the password it's useless; with a weak password it can be guessed offline, hence the length rule. Revoke on GitHub (§3.6) |
| The vault is used while unlocked (malware in the browser, someone at the keyboard) | The same exposure as an unlocked MetaMask. Limited by: the confirm popup for manual payments; allowlisted destinations and the daily cap for automations; the password again for big payments and rule edits; auto-lock; the 50 USDC limit for keys under 72 h; and revocation on GitHub |
| A malicious extension update | The same risk MetaMask has. The source is open (MIT), builds are reproducible from the repo with pinned dependencies, and the store listing links the commit. Users who don't want that trust use the native helper with a hardware key (§3.2) |
| The user's own SSH key leaks through the extension | It can't: the extension never sees it. The helper returns signatures only, and its manifest admits our extension ID alone |
| A malicious page triggers a payment | Content scripts only open the popup; signing needs a click in the extension's own UI. `externally_connectable` accepts only wallet links from the pay page, and those are verified by signature |
| A rename redirects a saved payee | Payees and rules store the GitHub **ID** |
| An ENS name is changed, expired or hijacked after a payee is saved | Rules store the address resolved at setup and pause if the name now resolves elsewhere (§4.1) |
| A lookalike ENS name (`aIice.eth`) | ENSIP-15 normalization, a confusable/mixed-script warning, and the normalized name and address on the confirm screen |
| Our gateway lies about `<user>.sereno.eth` | The result must equal `factory.addressOf(id)`, computed locally, or the payment is refused (the pay page already does this) |
| A fake "my ENS name" claim on a profile | Shown as verified only if the name's `com.github` record names that GitHub login (§7.1) |
| The relayer cheats | It can't: the signed text fixes recipient, amount and fee. It can only refuse; then the user self-submits (a "Submit myself" option with any wallet's gas, later) |
| GitHub account takeover adds a key | The 72 h / 50 USDC rule on-chain. The keys screen shows the new key as "cooling down" so the user notices |
| The OAuth token leaks | Its only scope is `write:ssh_signing_key`, and it is dropped right after use |
| A wrong sweep destination | It must be linked with a `personal_sign` from that wallet |

## 10. Build plan

The submission deadline is 09:00 Sat and the freeze is 04:00. This is post-hackathon work, except step 0.

0. **Tonight, if there's time (about 1–2 h), slide otherwise:** the content script only. "Pay @user" on profiles
   and "Tip author" on commits and PRs open `sereno-eth.vercel.app/?user=<login>`. The profile also shows
   `<login>.sereno.eth` under the avatar (built from the login; no network call). It needs no keys and no signing.
   It is extra C1/C2 as written in `CLAUDE.md`, and the ENS name on the profile is a nice beat for the ENS prize.
1. **Browser key and vault** (§3.1, §3.5). Start with a forge test: sign an intent with WebCrypto P-256 in TS,
   verify it through `SshSigVerifier`, and check that it's accepted. Then the vault (password first, passkey
   second), lock and auto-lock, device flow, add the key, sync.
2. **Popup Send and Confirm** (§4), with ENS names (§4.1, after moving the pay page's lookup into
   `@sereno/shared`), then history (§6) and the profile ENS block (§7.1).
3. **Wallet linking and automations** (§5), with the `#link-wallet` page on the pay site.
4. **Native helper** (`ak connect`, §3.2) and the remaining GitHub buttons (§7).

## 11. Open questions

- Who registers the GitHub OAuth App (device flow on, scope `write:ssh_signing_key`), and does it belong to an org?
- Does the hosted relayer need a minimum fee, or rate limits, once automations run every few minutes?
- Do WebAuthn and its PRF extension work from the extension's own origin (Chrome on Windows Hello, macOS Touch ID,
  Android phone)? If not, passkey unlock (§3.5) waits and the password is the only unlock.
- Does `SshSigVerifier` require low-s for P-256? Step 1's test answers it; the encoder normalizes anyway.
- Can the sync worker run somewhere other than Suparno's laptop? Without it, new browser keys never reach the chain,
  and onboarding (§3.1 step 5) stalls.
- Chrome first, then Firefox (MV3 is supported; native messaging manifests live in a different place)?
