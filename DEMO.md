# How to demo sereno

The run sheet for showing everything that's built: the setup, the 4-minute demo video (and its 3-minute cut), how to reset it for another
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
   3. Click the sereno icon and turn on **Show sereno info on GitHub**. Then GitHub pages show balances, bounties and
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

## 2. The 4-minute demo video

One continuous take per scene, with a voiceover that explains what's on screen. Viewers get lost when the video jumps
between flows halfway through, so the only cuts are between scenes, each marked by a one-second chapter card
("2 / 4 · Spend with git").

**The cast stays the same throughout:**
- **psycocodes** is paid, paid again, then claims his name;
- **g4ntavya** wins a bounty;
- **you** (`letsbecool9792`) are the developer spending from your account.

**The website and the extension aren't toured separately.** Every scene happens on github.com, so the extension is
always on screen (Pay buttons, the **Paid** chip, bounty chips). The website appears when **Other wallet** hands off to
it in scene 1, and the popup appears once, at the end, as "your wallet". The full tour (§4) is for the README, the
live link and judges' questions.

| Time | Segment | What it proves |
|---|---|---|
| 0:00–0:15 | Product teaser (already made) | |
| 0:15–1:00 | How it works: one diagram that builds up | Technicality, originality |
| 1:00–1:40 | **1 · Pay anyone by username** | Usability; ENS wildcard |
| 1:40–2:30 | **2 · The commit is the payment** | The wow; EF "Secure" |
| 2:30–3:15 | **3 · Merge is the payout** | Chainlink CRE, shown in the CLI |
| 3:15–3:45 | **4 · A phone claims the name** | ENSv2 claim, hardware key |
| 3:45–4:00 | Close: the popup, same address on two chains | |

The voiceover is about 500 words, roughly 140 a minute, so there's room to breathe.

### Before recording
1. Everything in §1: the Railway services, the sync worker, the extension, MetaMask, and USDC in your sereno account.
2. **The bounty:** fund the next unused sereno-demo issue with 2 USDC (§3). Its PR from g4ntavya must still be open.
3. **A phone key on psycocodes' profile, for scene 4:**
   - Why: `letsbecool9792.sereno.eth` is already claimed and each account claims once; `psycocodes` and `g4ntavya`
     are free (checked 7 Nov).
   - Mohikshit adds your `phone_sk.pub` as a **Signing Key** on his GitHub. Then run `npx sereno-ak sync psycocodes`.
   - While the key is there, your phone can sign Verified commits as him, so he removes it after recording.
4. **Windows and tabs:**
   - 1920×1080, browser zoom 125%, bookmarks bar hidden, GitHub in dark mode;
   - terminal font about 18 pt, click highlighting on;
   - tabs: psycocodes' profile, the funded issue, its PR, `sepolia.app.ens.domains/psycocodes.sereno.eth`;
   - a terminal in the `sereno-demo` clone, and the sync worker's terminal where it can be shown.
5. **The phone:** Bluetooth and Location on, the phone next to the laptop. Record a backup take of scene 4.

### How to record
- **Screen first, voiceover second.** Record each scene unhurried, then record the voiceover and fit it in the edit.
  Speaking while clicking is where demos fall apart.
- **Only speed up waits, and label them** with a small "4×" badge: MetaMask, Chainlink, the phone. Never cut in the
  middle of an action.

### 0:15 · How it works (45 s)
**On screen:** one diagram that adds a block about every 10 seconds:
1. SSH signature verified on-chain;
2. an account from the GitHub ID;
3. Chainlink copies the keys;
4. the ENS name.

> Here's what's under the hood. Our contract verifies OpenSSH signatures on-chain: regular SSH keys, hardware security
> keys, even a phone. So the ssh-keygen and git you already use can sign transactions; a signed git commit is a valid
> payment. Every GitHub user also already has an account. Its address comes from their permanent GitHub ID, it's the
> same on every chain, and money can arrive before it's ever deployed. A Chainlink CRE workflow copies each user's
> GitHub keys on-chain, and revokes the ones they delete. And ENS gives every one of them a name: username dot sereno
> dot eth. Let's see it.

### 1:00 · Scene 1: Pay anyone by username (40 s, one take)
**On screen:**
1. psycocodes' GitHub profile, with the extension's buttons under his name.
2. Click **Other wallet**. The pay page opens, filled in: his card and `psycocodes.sereno.eth`.
3. Pick 5, press **Pay @psycocodes**, and confirm in MetaMask (sped up).
4. The *Received* stamp.

Use **Other wallet**, not **Pay @psycocodes**. Pay @psycocodes spends from your own sereno account with the browser
key, which is a spend; this scene is about money coming in from an ordinary wallet.

> This is my teammate's GitHub profile. He doesn't need to have set anything up. Our extension adds a Pay button right
> here. I'll pay from an ordinary wallet, so I click "Other wallet", and it opens our website, already filled in.
> Without the extension you'd just type his username. His name, psycocodes.sereno.eth, resolves through an ENSv2
> wildcard resolver: our gateway looks up his GitHub ID and returns his account address, signed. Five USDC, confirm in
> MetaMask… received. No address was exchanged, and he signed up for nothing.

### 1:40 · Scene 2: The commit is the payment (50 s, one take)
**On screen:**
1. The terminal in the `sereno-demo` clone:
   ```sh
   npx sereno-ak commit-pay 1 psycocodes --as letsbecool9792 --push
   ```
   Let the output scroll: the key it found, the exact text, signing, the push.
2. Open the commit on GitHub: the **Verified** badge, and the extension's **Paid** chip.
3. Click through to Basescan.

> Now the other side. I'm a developer with money in my Sereno account, and I'll spend it with git. In this repo I run
> commit-pay: one USDC to psycocodes. It finds the SSH key that's on my GitHub profile and prints exactly what I'm
> signing: the chain, my account, the nonce, the amount, the recipient, the relayer's fee. Readable text, never blind
> calldata. That text becomes the commit message; git signs it with my SSH key; I push. On GitHub: Verified. And our
> relayer has already picked it up: Paid. The contract rebuilt that text, verified the SSH signature on-chain, checked
> the key is on my profile, and paid. The push was the broadcast.

### 2:30 · Scene 3: Merge is the payout (45 s, one take; speed up the wait with a "4×" badge)
Chainlink's track asks for the CLI simulation on screen, and the sync worker only prints summary lines. So for this
scene, **stop the sync worker** (Ctrl+C) beforehand and run the workflow yourself, where the camera can see it. Start
the worker again after the scene.

**On screen:**
1. The issue, with the chip "2 USDC bounty · Base".
2. Its PR, showing "Merging pays #N's bounty to @g4ntavya". Click **Merge** (GitHub's button, never a manual close).
3. A PowerShell terminal in `cre/` (Windows PowerShell needs the `\"` escapes; replace `N` with the issue number):
   ```powershell
   $env:GITHUB_TOKEN_ALL = gh auth token
   cre workflow simulate github-bounty --target base-settings --non-interactive --trigger-index 0 --http-payload '{\"repo\":\"letsbecool9792/sereno-demo\",\"issue\":\"N\"}' --broadcast -e ../.secrets/cre.env
   ```
   Let the output scroll to "closed by merged PR #… from g4ntavya" and the written report.
4. Back on the issue (refresh): the bounty chip and a **Pay out** button. Click it: **Paid out**.

> Bounties. This issue has two USDC on it, funded from a normal wallet. Gantavya opened a pull request that fixes it,
> and the extension tells us merging pays him. I merge. Nobody has to trust us to decide who won: a Chainlink CRE
> workflow does. Our relayer runs it automatically when an issue closes; here it is in the CRE CLI. It asks GitHub's
> API whether a merged pull request closed this issue, and who wrote it; the nodes must agree before a report goes
> on-chain, and the contract records the winner. Back on the issue, anyone can press Pay out: it goes to the account
> of his GitHub ID. Merge is the payout.

### 3:15 · Scene 4: A phone claims the name (30 s; the phone in picture-in-picture, sped up)
**On screen:**
1. The terminal:
   ```sh
   npx sereno-ak claim --as psycocodes --key "$HOME\.ssh\phone_sk"
   ```
2. The QR code; the phone in a corner: scan, then fingerprint.
3. The transaction confirms.
4. `sepolia.app.ens.domains/psycocodes.sereno.eth`: the owner is his account, with its own resolver.

> Last, names. psycocodes.sereno.eth has resolved all along through the wildcard. Now he claims it as a real ENSv2
> subname, and he signs with a phone: scan the code, touch the fingerprint sensor. The registrar verified that phone
> signature on-chain and checked the key against his GitHub. In the ENS app: a real subname, owned by his Sereno
> account, with its own resolver. No seed phrase anywhere.

### 3:45 · Close (15 s)
**On screen:** the extension popup's Home (one address; Base and Arbitrum balances), then History with this video's
payments.

> All of it lives in one account, at the same address on Base and Arbitrum. No new wallet, no seed phrase, no signup.
> We didn't build a wallet. GitHub already was one.

### The 3-minute cut, for the submission
The EF CROPS prize asks for a demo video of 3 minutes or less.

| Segment | Length | Change |
|---|---|---|
| Teaser | 15 s | |
| How it works | 25 s | Drop the ENS sentence; scene 4 covers it |
| Scene 1 | 30 s | |
| Scene 2 | 45 s | |
| Scene 3 | 40 s | |
| Scene 4 | 20 s | |
| Close | 5 s | The tagline only |

### Live on stage
If the finalist demo is live rather than a video, run the same four scenes in order. Keep the recorded scene 4 ready
in case the phone doesn't connect. Revocation (§4.7) is the alternative to scene 4, but rehearse it: it takes about a
minute of Chainlink time.

---

## 3. Resetting for another run

Two scenes use something up: the bounty (one issue per run) and the name claim (each GitHub account claims once).
Everything else can be repeated as is.

- **Before each run, fund the next issue:**
  1. On the issue page, click **Fund a bounty**. The pay page opens with the issue filled in.
  2. Fund 2 USDC from MetaMask (approve, then fund).
  3. Refresh the issue: it shows "2 USDC bounty · Base".
- **Use the issues in order, one per run:** #5, #6, #7 … #14. Each has its own PR by g4ntavya.
- **Merge with the button on GitHub**, never close the issue by hand: a manual close pays nobody.
- **Payments:** amounts of 1 USDC repeat fine. Keep the browser key's payments at 50 USDC or less in its first 72 h.
- **The commit-pay scene** can repeat freely; each payment commit uses the next nonce.
- **The name claim:** after `psycocodes` is claimed, a retake needs another unclaimed account with the phone key on
  its profile (`g4ntavya`), and the voiceover's name changes with it.

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
Scene 3 of the video shows the `github-bounty` simulation (§2). For key sync, show the CLI simulation, then the
on-chain result:
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
