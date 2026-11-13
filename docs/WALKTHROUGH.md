# Walkthrough: test every feature

[Back to the README](../README.md)

Every step, in demo order, with what to do and what you should see. `<you>` is your GitHub username and `<friend>` is any other GitHub user. Everything is on testnets.

## What you need

- **A GitHub account with an SSH key** (Settings → SSH and GPG keys; an Authentication or Signing key, any type). For step 6 you need a P-256 or security key (`ssh-keygen -t ecdsa` or `-t ecdsa-sk`).
- **A browser wallet** (MetaMask, Rabby or Phantom) on Base Sepolia, with a little ETH for gas and some Circle USDC ([faucet](https://faucet.circle.com)).
- **Node 20+, git and OpenSSH** for the terminal steps (`npx sereno-ak …` needs no install).

Keep amounts small: a key that first appeared on-chain less than 72 hours ago can't spend more than 50 USDC at a time.

**Which key file?** You don't need to know. `npx sereno-ak` looks in your `~/.ssh` folder for the key whose public half is on your GitHub profile and says which one it uses. The Spend tab lists your GitHub keys with the file name `ssh-keygen` gives each type (`id_ed25519`, `id_ecdsa`, `id_rsa`, `id_ecdsa_sk`) and its fingerprint. If your key lives elsewhere, pass `--key <file>` to the CLI, or choose *another file* on the Spend tab. Write paths as `"$HOME/..."` rather than `~/...`: Windows' `ssh-keygen` doesn't understand `~`.

## 1. Your GitHub account is already a wallet

1. Open `https://github.com/<you>.keys`. These are your public SSH keys, published by GitHub. (It lists only authentication keys; signing keys count too.)
2. On [sereno-eth.vercel.app](https://sereno-eth.vercel.app), type `<you>` in the search and press **Pay**. It opens the Pay page on your profile; nothing is paid until you press Pay there.

   You should see:
   - your account address, derived from your numeric GitHub ID;
   - `<you>.sereno.eth`;
   - your SSH keys, each marked *on-chain* or *not synced yet*.
3. If any key says *not synced yet*, run `npx sereno-ak sync <you>`, or press **Sync my keys from GitHub** on the Spend tab.

   You should see: a Chainlink CRE workflow copies your key hashes on-chain, `done … base-sepolia ok …`, and the keys switch to *on-chain*.

`npx sereno-ak account <you>` shows the same in a terminal: address, balance, nonce, and which keys are on-chain.

## 2. Receive money by username

1. On the **Pay someone** tab, type `<you>` (or `<friend>`), enter an amount, press **Pay @`<user>`** and confirm in your wallet.

   You should see: a *Received* stamp on the card, the transaction link, and the account's balance going up. This works even if the account isn't deployed yet: it shows *new, it can already receive*.
2. Open the account address on Basescan.

   You should see: the USDC sitting at that address.

## 3. Spend it with `ssh-keygen`

```sh
npx sereno-ak send 1 <friend> --as <you>
```

You should see:
- which key it uses (the one in `~/.ssh` that is on your GitHub profile);
- the exact text it signs: chain, account, nonce, amount, token, recipient, relayer fee;
- `ssh-keygen` signing it;
- `paid: <transaction link>`.

`<friend>`'s balance goes up, and yours goes down by the amount plus the 0.02 USDC relayer fee.

**If it doesn't work:**

- **`ak: no key in …/.ssh matches an SSH key on <you>'s GitHub profile`.** Your key isn't in `~/.ssh`, or isn't on your GitHub profile.
  - If the key is somewhere else, either pass it with `--key "<path to your private key>"`, or copy the private key and its `.pub` into `.ssh`.

    PowerShell:
    ```powershell
    New-Item -ItemType Directory -Force "$HOME\.ssh" | Out-Null
    Copy-Item "<path to your private key>", "<path to your private key>.pub" "$HOME\.ssh\"
    ```
    bash or zsh (`ssh-keygen` refuses a private key that other users can read):
    ```sh
    mkdir -p ~/.ssh && cp "<path to your private key>" "<path to your private key>.pub" ~/.ssh/
    chmod 600 ~/.ssh/<file name>
    ```
  - **No `.pub` next to the private key?** Make it with `ssh-keygen -y -f "<private key>"`, saving the output as `<private key>.pub`. In PowerShell, use `| Out-File -Encoding ascii "<private key>.pub"` rather than `>`, which writes UTF-16.
  - **Not on GitHub yet?** Paste the `.pub` contents at github.com/settings/keys, then run `npx sereno-ak sync <you>`.
- **The key lives only in ssh-agent** (1Password, KeePassXC, a hardware agent). Pass the public key instead: `--key "<path to the key>.pub"`. `ssh-keygen` then asks the agent to sign.
- **`ak: no SSH key file at …`.** The `--key` path is wrong. On Windows, write `"$HOME\..."` rather than `~`.
- **`couldn't run ssh-keygen`.** OpenSSH isn't installed or isn't on PATH.
  - Windows: Settings → Optional features → OpenSSH Client, or use Git for Windows' copy: `$env:AK_SSH_KEYGEN = "C:\Program Files\Git\usr\bin\ssh-keygen.exe"`.
  - Linux: install `openssh-client`.
- **`retrying without -O hashalg=sha256`.** Your OpenSSH is older than 8.9 (Windows 10's built-in 8.1, Ubuntu 20.04). The payment still works, with SHA-512 and more gas. A name claim (step 6) needs OpenSSH 8.9+.
- **`relayer refused: KeyNotOnProfile`.** The key you signed with isn't on-chain for your GitHub ID:
  - it was added after the last sync: run `npx sereno-ak sync <you>`;
  - or it's on another GitHub account than `--as`.
- **`relayer refused: NewKeyCoolingDown`.** The key first appeared on-chain less than 72 hours ago, and the payment is over 50 USDC. Send 50 or less, or wait.
- **`relayer refused: TransferFailed`.** The account holds less than the amount plus the 0.02 USDC fee. `npx sereno-ak account <you>` shows the balance.
- **The sync stays `queued`.** Key syncs run on our worker while the Chainlink workflow is in simulation, and the worker is offline. The request waits in the queue; try again later.
- **ssh-keygen asks for a passphrase.** That's your key's own passphrase. With a security key or phone, it asks for a touch or a QR scan instead.

**No terminal:** the **Spend your balance** tab does the same in the browser:
1. Prepare the payment and download `intent.txt`.
2. Run the one `ssh-keygen` command it shows.
3. Paste the signature, and press **Send payment**.

## 4. Pay with a git commit

1. **For GitHub's "Verified" badge (optional):** add the key on GitHub as a **Signing Key** as well, and commit with your GitHub noreply or verified email.
2. In a clone of any GitHub repo you can push to:
   ```sh
   npx sereno-ak commit-pay 1 <friend> --as <you> --push
   ```
   You should see:
   - a signed, empty commit whose message is exactly the payment text;
   - the push;
   - then `paid: <transaction link>`. The relayer read the commit from GitHub.
3. Open the commit on GitHub.

   You should see: the payment text as the commit message, and **Verified** if you did step 1.

Without the CLI, use the Spend tab: choose **Pay with a git commit**, run the `git commit -S … -F intent.txt` and `git push` it shows, then paste the commit's link under **Paste a payment commit**.

## 5. Issue bounty

1. Open an issue in a GitHub repo you can merge into.
2. On the **Issue bounties** tab, paste the issue link and press Find. Enter an amount and a refund delay, press **Fund bounty**, and confirm twice in your wallet (approve, then fund).

   You should see: the bounty amount on the card.
3. Open a pull request, from any account, whose description says `Fixes #<issue number>`. Merge it, and check that GitHub closed the issue.
   - Fund before merging: once an issue is settled, nobody can add to it.
   - Don't close the issue by hand: a manual close pays nobody.
4. Back on the tab, press **Check GitHub and pay the PR author**.

   You should see:
   - *Chainlink's bounty workflow is asking GitHub…*;
   - then *Settled and paid to the PR author's account*, with a transaction link;
   - the winner shown as `@<PR author>`, and the PR author's Sereno balance goes up.

From a terminal: `npx sereno-ak bounty https://github.com/<owner>/<repo>/issues/<n> --settle`.

## 6. Claim your ENS name with a phone or security key

1. **Make a security key:**
   - on Windows with Win32-OpenSSH 10.x, `ssh-keygen -t ecdsa-sk` and choose "iPhone, iPad, or Android device" (scan the QR code, then use your fingerprint);
   - elsewhere, a USB security key works the same way.

   Add the `.pub` on GitHub and sync it (step 1.3). A plain P-256 key (`-t ecdsa`) also works.
2. Run `npx sereno-ak claim --as <you>`. It picks a P-256 key from `~/.ssh` that is on your profile; pass `--key <file>` to choose. With a phone: scan the QR code and confirm with your fingerprint.

   You should see:
   - the claim text you signed;
   - a Sepolia transaction;
   - [sepolia.app.ens.domains/`<you>`.sereno.eth](https://sepolia.app.ens.domains) shows the name as a real ENSv2 subname owned by your account, with its own resolver.

One claim per GitHub account.

## 7. Revocation

1. Make a throwaway key (press Enter twice for no passphrase), add `throwaway.pub` on GitHub (Settings → SSH and GPG keys), then sync:
   ```sh
   ssh-keygen -t ecdsa -f throwaway
   npx sereno-ak sync <you>
   ```
   You should see: the sync ends with one key more than before, e.g. `done: 3 key(s); base-sepolia ok, …`.
2. Spend with it: `npx sereno-ak send 0.1 <friend> --as <you> --key throwaway`.

   You should see: `paid:`.
3. Delete the throwaway key on GitHub, then sync again: `npx sereno-ak sync <you>`. If you synced in the last minute, it waits a moment, then runs a fresh sync.

   You should see: the sync ends with one key fewer.
4. Spend with it again: `npx sereno-ak send 0.1 <friend> --as <you> --key throwaway`.

   You should see: `relayer refused: KeyNotOnProfile`.

A signature made *before* the delete is refused too. From the repo, `bun packages/ops/src/revoke-demo.ts <you> --key throwaway` shows that in one command: it signs first, waits for you to delete the key, syncs, then submits.

## 8. Same address on every chain

Run `npx sereno-ak account <you> --chain arbitrum-sepolia`, or switch the chain on the pay page.

You should see: the same account address as on Base Sepolia. Payments work there too.

**While the CRE workflows run in simulation,** key syncs (steps 1, 6 and 7) and bounty settlement (step 5) are carried out by a worker on our machine. If it's offline, those steps wait in a queue. Everything else is hosted.
