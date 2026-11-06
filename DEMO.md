# How to demo sereno

The run sheet for showing everything that's built: the setup, the 4-minute stage demo, how to reset it for another
run, and the long tour of every feature. Commands assume Windows (the demo laptop); `<you>` is the GitHub account
you demo from (`letsbecool9792`), and `<friend>` is any other GitHub user (`psycocodes`).

---

## 1. Setup (about 30 minutes before)

Do these in order. The first three are the ones that break a demo when skipped.

1. **Redeploy both Railway services** (gateway and relayer) from `main`.
   - Check: `https://happy-curiosity-production-7074.up.railway.app/health` answers `ok: true` and lists `bounties`.
   - Check: `https://sereno-production.up.railway.app/health`.
2. **Start the sync worker** on this laptop and leave it running:
   ```sh
   bun packages/ops/src/sync-worker.ts
   ```
   It runs the Chainlink CRE workflows (key sync, bounty settlement). Without it, new keys never reach the chain and
   bounties never pay out. Before it, run `cre login` if the CLI asks.
3. **The extension:**
   1. Build it:
      ```sh
      cd extension && bun run build
      ```
   2. In `chrome://extensions`:
      - remove any older "Sereno for GitHub" 0.1.0;
      - turn on Developer mode, then **Load unpacked** → `extension/dist`;
      - pin it (puzzle icon → pin **sereno**).
   3. Click the lantern and turn on **Show sereno info on GitHub**. Then GitHub pages show balances, bounties and
      payment status by themselves, instead of waiting for a "Check" click.
   4. **Create a browser key** and set a password. Enter `<you>`, then **Copy key** → **Open GitHub**: paste it at
      github.com/settings/ssh/new as a **Signing Key**.
   5. Press **Sync my keys** and wait for three ticks: Base, Arbitrum, Sepolia.
   6. Do this a day ahead if you can: a key first seen less than 72 hours ago can send at most 50 USDC per payment.
4. **MetaMask** on Base Sepolia with some ETH for gas and Circle USDC ([faucet.circle.com](https://faucet.circle.com)).
   It's for paying from the pay page and for funding bounties.
5. **Your sereno account has USDC.** The extension's Home should show a balance; top it up from MetaMask on the pay
   page if not.
6. **The phone key.** It's in `C:\Users\Suparno\.ssh\phone_sk`.
   - Before the claim beat: Bluetooth and Location on, phone next to the laptop.
   - Each signature needs a fresh QR scan. Android may say "something went wrong" even when the signature worked.
   - **Record the phone flow as a backup video beforehand.**
7. **Demo repo**, [`letsbecool9792/sereno-demo`](https://github.com/letsbecool9792/sereno-demo):
   - a local clone to commit-pay from;
   - open issues **#5 to #14**, one per demo run;
   - Gantavya's matching PRs, one per issue, each saying `Fixes #N` and left unmerged.
8. **Tabs, opened in this order:**
   - `github.com/psycocodes.keys`;
   - psycocodes' GitHub profile;
   - the next unused issue;
   - its PR;
   - the pay page;
   - [sepolia.app.ens.domains](https://sepolia.app.ens.domains);
   - a terminal in the `sereno-demo` clone.
9. **Never** commit in GitHub's web editor for a payment: GitHub signs those with its own key, so they're rejected.

---

## 2. The 4-minute stage demo

| Time | Do | They see | Say |
|---|---|---|---|
| 0:00 | Open `github.com/psycocodes.keys` | GitHub's public list of his SSH keys | "These keys are already Ethereum signers." |
| 0:20 | On psycocodes' profile, click **Pay @psycocodes** (the extension's amber button) and send 1 USDC. Show **Review**: his avatar, his GitHub ID and the exact text being signed. Confirm | "Sent", with a Basescan link; his balance chip goes up | "No address, no signup. Paid by username." |
| 1:00 | In the `sereno-demo` clone: `npx sereno-ak commit-pay 1 psycocodes --as letsbecool9792 --push`. Open the commit on GitHub | **Verified**, and the extension's "Payment commit · 1 USDC · **Paid**" | "The push is the broadcast." |
| 2:00 | Bounty: the issue shows "2 USDC bounty · Base" (funded before the demo, see §3). Open its PR: "Merging pays #N's bounty to @g4ntavya". **Merge it.** Back on the issue, within about a minute: "Bounty won by @g4ntavya" | Chainlink checked GitHub and paid the PR author | "Merge is the payout." |
| 2:40 | Phone: `npx sereno-ak claim --as <account> --key "$HOME\.ssh\phone_sk"`, QR, fingerprint. Show the name in the ENS app (or play the video) | A real ENSv2 subname owned by the account | "A fingerprint signed it. No seed phrase anywhere." |
| 3:20 | The extension's Home: Base and Arbitrum balances, one address. Close the popup | Same account on both chains | "We didn't build a wallet. GitHub already was one." |

**The claim beat.** `letsbecool9792.sereno.eth` is already claimed, and each GitHub account claims once. Either:
- claim live with a teammate's account whose name isn't claimed yet;
- or show the existing name in the ENS app and play the recorded phone video.

**Revocation** is the alternative 2:40 beat if you'd rather show it than the claim. See §4.7. It takes about a minute
of Chainlink time, so rehearse it.

---

## 3. Resetting for another run

The bounty is the only beat that uses something up. Everything else can be repeated as is.

- **Before each run, fund the next issue:**
  1. On the issue page, click **Fund a bounty**. The pay page opens with the issue filled in.
  2. Fund 2 USDC from MetaMask (approve, then fund).
  3. Refresh the issue: it shows "2 USDC bounty · Base".
- **Use the issues in order, one per run:** #5, #6, #7 … #14. Each has its own PR by g4ntavya.
- **Merge with the button on GitHub**, never close the issue by hand: a manual close pays nobody.
- **Payments:** amounts of 1 USDC repeat fine. Keep the browser key's payments at 50 USDC or less in its first 72 h.
- **The commit-pay beat** can repeat freely; each payment commit uses the next nonce.

---

## 4. The full tour (video, long slot, or judges' questions)

### 4.1 Pay site ([sereno-eth.vercel.app](https://sereno-eth.vercel.app))
- **Landing:** the intro, and the username search. Type a username: the live card becomes that person.
- **Pay:** a username's account, name and keys, then pay USDC from MetaMask. It works for an account that isn't
  deployed yet.
- **Spend:** pay from your sereno account without installing anything:
  - prepare a payment, sign `intent.txt` with stock `ssh-keygen`, and paste the signature;
  - or make the payment as a git commit and paste the commit link.
- **Bounties:** paste an issue link, fund it, see the winner and the payout. Refund after the deadline.

### 4.2 The `ak` CLI (`npx sereno-ak`)
```sh
npx sereno-ak account letsbecool9792                       # address, balance, nonce, keys on-chain
npx sereno-ak send 1 psycocodes --as letsbecool9792        # signs with ssh-keygen, the relayer submits
npx sereno-ak commit-pay 1 psycocodes --as letsbecool9792 --push
npx sereno-ak sync letsbecool9792                          # Chainlink copies the GitHub keys on-chain
npx sereno-ak bounty https://github.com/letsbecool9792/sereno-demo/issues/5 --settle
npx sereno-ak account letsbecool9792 --chain arbitrum-sepolia   # same address on Arbitrum
```

### 4.3 The extension popup
- **Home:** total USDC and the balance on each chain, the address, `<you>.sereno.eth`, and whether this browser key is
  on-chain on each chain. Escrows waiting for you show a **Claim** button.
- **Send:** to a username, `name.sereno.eth` or `0x…`. **Review** shows:
  - the payee, resolved by GitHub ID;
  - the exact signed text, read from the contract;
  - anything that would fail (balance, key not synced, the 72 h limit).

  Over 20 USDC it asks for the password again.
- **History:** every payment from chain logs (sent, received, bounty wins, commit payments marked "commit"), sereno
  accounts named `@login`, CSV export.
- **Automate:**
  - a recurring payment: + Recurring → a username, an amount, then "Every 5 min (demo)". Enter the password, turn on
    **Run automations**, and the next run shows in History;
  - a sweep: **Link a wallet** opens the pay page, MetaMask signs one line, then **+ Sweep** forwards incoming money to
    that wallet.
  - Show the guardrails: a daily cap, a password to turn anything on, a stop after 3 errors.
- **Settings:**
  - the GitHub info switch;
  - **Claim** your name with the browser key;
  - **Use my own SSH key** (§4.5);
  - remove the key.
- **Lock:** the lock button in the header. Balances and history still work while locked; nothing signs.

### 4.4 Buttons on github.com
| Page | Try |
|---|---|
| Anyone's profile | **Pay @user** (extension), **Other wallet** (pay page), name ("claimed" or not), balance |
| Your profile | **sereno account**, **Sync my keys**, **Claim …sereno.eth** |
| Issue | **Fund a bounty**; the bounty, the winner, **Pay out** and **Refund** when they apply |
| Pull request | **Tip @author**; "Merging pays #N's bounty to @author" |
| Commit | **Tip @author**; on a payment commit: **Paid** with the transaction, or **Relay this payment** |
| Repository | **Pay by commit** copies the `commit-pay` command |
| Settings → SSH keys | Each key: on-chain since, cooling down until, or not synced; **Sync to sereno** |

### 4.5 Signing with your own SSH key from the extension (the phone)
1. Once, from the repo: `bun cli/src/main.ts connect`. `npx sereno-ak connect` works after the npm package is
   republished. This registers the native helper for Chrome, Edge and Brave.
2. Reopen the popup. Settings → "Use my own SSH key" shows the phone key.
3. Send → Review → **My SSH key** → Confirm. The phone asks for a QR scan and a fingerprint.

### 4.6 Bounty paid on merge, explained
The relayer watches every funded bounty. When the issue closes:
1. It asks the Chainlink CRE workflow whether a merged PR in that repo closed it, and who wrote it.
2. The CRE nodes agree, and BountyBoard records the winner.
3. The relayer pays the pot to the winner's sereno account.

The PR has to say `Fixes #N` (or be linked in the PR's Development box). The maintainer's merge is the judgement.

### 4.7 Revocation (Chainlink CRE)
```sh
ssh-keygen -t ecdsa -f throwaway            # add throwaway.pub on GitHub, then:
npx sereno-ak sync letsbecool9792
bun packages/ops/src/revoke-demo.ts letsbecool9792 --key throwaway
```
It signs a payment, waits while you delete the key on GitHub, runs the CRE sync, then submits the same signature,
which is refused with `KeyNotOnProfile`.

### 4.8 For the Chainlink prize video
Show the CLI simulation, then the on-chain result:
```sh
cd cre && cre workflow simulate github-keys --target <target> --non-interactive --trigger-index 1 --http-payload '{"githubId":"99113360"}' --broadcast -e ../.secrets/cre.env
```
Then show the key on-chain (`npx sereno-ak account letsbecool9792`).

---

## 5. When something breaks

| Symptom | Fix |
|---|---|
| A sync or bounty stays "queued" | The sync worker isn't running (§1.2) |
| "Couldn't look up …" on the pay page | The gateway is cold or GitHub is slow: retry. It serves cached answers now |
| The extension popup shows an error | Press **Retry**; if it persists, reload the extension in `chrome://extensions` |
| No sereno bar on a GitHub page | Refresh the tab. If GitHub's layout changed, the bar floats in the bottom-right corner |
| The page flashes, or two bars appear | An old copy of the extension is installed: remove "Sereno for GitHub" 0.1.0 |
| The phone doesn't connect | Bluetooth and Location on, phone close; otherwise play the video |
| `NewKeyCoolingDown` | The key is under 72 h old: send 50 USDC or less |
| `KeyNotOnProfile` | The key isn't synced yet: Sync my keys, then wait for the ticks |
