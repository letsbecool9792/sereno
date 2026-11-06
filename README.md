# Sereno

**We didn't build a wallet. GitHub already was one.**

*A sereno was the night watchman of old Spanish towns: he kept the keys and called out that all was calm.*

Every GitHub user already has an account anyone can pay, by username. The SSH key they push code with is what spends from it: they sign with the `ssh-keygen` and `git commit -S` they already use. No app, no seed phrase, no signup.

## Try it

**Live (testnet): [sereno-eth.vercel.app](https://sereno-eth.vercel.app)**. Payments are Circle USDC on Base Sepolia or Arbitrum Sepolia ([faucet](https://faucet.circle.com)).

- **Pay someone:** type any GitHub username, pay from any wallet. It works even if they've never heard of Sereno; the money waits in their account.
- **Spend your balance** (the *Spend* tab): it builds the payment text and gives you the stock command to sign it, `ssh-keygen -Y sign …` or `git commit -S`. Paste the signature, or the link of the pushed commit, and the relayer pays. Your key never touches the page.
  - First time? Press **Sync my keys from GitHub**, so the Chainlink key oracle copies your SSH keys on-chain.
  - Any SSH key on your GitHub profile works, authentication or signing.
- **Issue bounties** (the *Issue bounties* tab): put USDC on any GitHub issue from your wallet. When a merged PR closes it, anyone presses *Check GitHub and pay the PR author*: a Chainlink CRE workflow confirms it with GitHub, and the author is paid into their Sereno account by GitHub ID. Funders can take their money back after their deadline if nobody earns it.
- **CLI** (Node 20+): [`sereno-ak`](https://www.npmjs.com/package/sereno-ak)

```sh
npx sereno-ak account <github-user>                                         # address, balance, which keys are on-chain
npx sereno-ak sync <you>                                                    # copy your GitHub keys on-chain
npx sereno-ak send 1 <friend> --as <you>                                    # finds your key in ~/.ssh, signs with ssh-keygen, relayer submits
npx sereno-ak commit-pay 1 <friend> --as <you> --push                       # in any GitHub repo: the push is the payment
npx sereno-ak claim --as <you>                                              # make <you>.sereno.eth a real ENSv2 subname
npx sereno-ak bounty https://github.com/owner/repo/issues/12 --settle        # settle an issue bounty and pay the PR author
```

A name claim is verified on Ethereum Sepolia, where the ed25519 verifier doesn't fit the gas limit, so it needs a P-256 key (`ssh-keygen -t ecdsa`) or a security key / phone (`-t ecdsa-sk`). Payments accept ed25519, P-256, RSA and security keys.

## Walkthrough: test every feature

Every step, in demo order, with what to do and what you should see. `<you>` is your GitHub username and `<friend>` is any other GitHub user. Everything is on testnets.

### What you need

- **A GitHub account with an SSH key** (Settings → SSH and GPG keys; an Authentication or Signing key, any type). For step 6 you need a P-256 or security key (`ssh-keygen -t ecdsa` or `-t ecdsa-sk`).
- **A browser wallet** (MetaMask, Rabby or Phantom) on Base Sepolia, with a little ETH for gas and some Circle USDC ([faucet](https://faucet.circle.com)).
- **Node 20+, git and OpenSSH** for the terminal steps (`npx sereno-ak …` needs no install).

Keep amounts small: a key that first appeared on-chain less than 72 hours ago can't spend more than 50 USDC at a time.

**Which key file?** You don't need to know. `npx sereno-ak` looks in your `~/.ssh` folder for the key whose public half is on your GitHub profile and says which one it uses. The Spend tab lists your GitHub keys with the file name `ssh-keygen` gives each type (`id_ed25519`, `id_ecdsa`, `id_rsa`, `id_ecdsa_sk`) and its fingerprint. If your key lives elsewhere, pass `--key <file>` to the CLI, or choose *another file* on the Spend tab. Write paths as `"$HOME/..."` rather than `~/...`: Windows' `ssh-keygen` doesn't understand `~`.

### 1. Your GitHub account is already a wallet

1. Open `https://github.com/<you>.keys`. These are your public SSH keys, published by GitHub. (It lists only authentication keys; signing keys count too.)
2. On [sereno-eth.vercel.app](https://sereno-eth.vercel.app), type `<you>` and press Find.

   You should see:
   - your account address, derived from your numeric GitHub ID;
   - `<you>.sereno.eth`;
   - your SSH keys, each marked *on-chain* or *not synced yet*.
3. If any key says *not synced yet*, run `npx sereno-ak sync <you>`, or press **Sync my keys from GitHub** on the Spend tab.

   You should see: a Chainlink CRE workflow copies your key hashes on-chain, `done … base-sepolia ok …`, and the keys switch to *on-chain*.

`npx sereno-ak account <you>` shows the same in a terminal: address, balance, nonce, and which keys are on-chain.

### 2. Receive money by username

1. On the **Pay someone** tab, type `<you>` (or `<friend>`), enter an amount, press **Pay @`<user>`** and confirm in your wallet.

   You should see: a *Received* stamp on the card, the transaction link, and the account's balance going up. This works even if the account isn't deployed yet: it shows *new, it can already receive*.
2. Open the account address on Basescan.

   You should see: the USDC sitting at that address.

### 3. Spend it with `ssh-keygen`

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

### 4. Pay with a git commit

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

### 5. Issue bounty

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

### 6. Claim your ENS name with a phone or security key

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

### 7. Revocation

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

### 8. Same address on every chain

Run `npx sereno-ak account <you> --chain arbitrum-sepolia`, or switch the chain on the pay page.

You should see: the same account address as on Base Sepolia. Payments work there too.

**While the CRE workflows run in simulation,** key syncs (steps 1, 6 and 7) and bounty settlement (step 5) are carried out by a worker on our machine. If it's offline, those steps wait in a queue. Everything else is hosted.

## How it works

1. **Account.** Every GitHub user has a smart account at a CREATE2 address derived from their numeric GitHub ID, the same on every EVM chain. Money can arrive before it is deployed.
2. **Name.** `<github-user>.sereno.eth` resolves to that account (ENSv2 wildcard plus a CCIP-read gateway). Claiming turns it into a real ENSv2 subname owned by the account.
3. **Keys.** A Chainlink CRE workflow reads the user's SSH keys from GitHub, the nodes agree, and the key hashes go on-chain. Removing a key on GitHub revokes it. It runs on a schedule, and on demand for any user (`ak sync`, or the Spend page's button).
4. **Spend.** Sign a plain-text payment with `ssh-keygen -Y sign`, or make it the message of a signed git commit and push. The contract verifies the SSH signature on-chain and pays.

## Repo layout

| Path | What |
|---|---|
| `contracts/` | Foundry: SSH signature verifier, account and factory, key oracle, ENS resolver and name registrar |
| `cre/` | Chainlink CRE workflows: `github-keys` syncs GitHub keys on-chain; `github-bounty` confirms a merged PR closed an issue |
| `gateway/` | CCIP-read gateway for `<user>.sereno.eth` |
| `relayer/` | Submits SSH-signed payments and pushed payment commits |
| `cli/` | `ak`: sign and send payments, commit-pay, claim your name |
| `web/` | Pay page: pay any GitHub user by username; Spend tab to spend with stock `ssh-keygen` or `git` |
| `packages/ops/` | Ops scripts: key sync worker, revocation demo, ENS setup |
| `packages/shared/` | Intent text, chains, addresses and ABIs shared by every client |

## Run it

Needs [Bun](https://bun.sh) and, for contracts, [Foundry](https://getfoundry.sh). Contracts are deployed on Base Sepolia, Arbitrum Sepolia and Sepolia (addresses in `CLAUDE.md`).

```sh
bun install
```

The pay page and the CLI use our hosted gateway (`sereno-production.up.railway.app`) and relayer (`happy-curiosity-production-7074.up.railway.app`) by default, so `cd web; bun run dev` (http://localhost:5173) and `bun run ak ...` are all you need. To run everything yourself, three terminals from the repo root (PowerShell shown; in bash use `GITHUB_TOKEN=$(gh auth token) bun ...`), then point the clients at them with `VITE_GATEWAY_URL` / `VITE_RELAYER_URL` (pay page) and `AK_GATEWAY` / `AK_RELAYER` (CLI):

```powershell
# 1. ENS gateway (CCIP-read for <user>.sereno.eth, and profile lookups for the pay page) on :8787
$env:GITHUB_TOKEN = gh auth token; bun gateway/src/main.ts
# 2. relayer (submits SSH-signed payments, commits and name claims) on :8788
$env:GITHUB_TOKEN = gh auth token; bun relayer/src/main.ts
# 3. pay page on http://localhost:5173
cd web; bun run dev
```

The gateway needs `.secrets/gateway.key` and the relayer `.secrets/relayer.key` (or `deployer.key`); ask Suparno.

CLI from the repo: `bun run ak <command>` (same commands as `npx sereno-ak`). Build the npm package with `bun cli/scripts/pack.ts`, then `cd cli/dist/npm && npm publish`.

**Key sync worker.** While the CRE workflow runs in simulation, on-demand key syncs (`POST /sync` on the relayer) are carried out by a worker on a machine with the `cre` login and an allowlisted broadcaster key: `bun packages/ops/src/sync-worker.ts` (it needs `.secrets/cre.env` and the relayer's `SYNC_WORKER_TOKEN` in `.secrets/sync-worker.token`). Deployed on a CRE DON, the workflow's HTTP trigger would take these requests itself.

Contracts: `cd contracts && forge test`.

### Relay payment commits from your own repo (no server)

Add `.github/workflows/pay.yml` to any repo. Every push then pays the commits made with `ak commit-pay`, using a relayer key you hold. That key needs a little ETH on the payment's chain, and you store it as the repo secret `SERENO_RELAYER_KEY`:

```yaml
on: push
jobs:
  relay:
    uses: letsbecool9792/sereno/.github/workflows/sereno-relay.yml@main
    secrets:
      RELAYER_KEY: ${{ secrets.SERENO_RELAYER_KEY }}
```

The relayer can only submit or refuse. The signed commit fixes the recipient, the amount and the fee. Tested: [an Action run](https://github.com/psycocodes/sereno-pay-test/actions/runs/42178010583) paid a Verified commit with no server of ours.

### Contracts beyond payments

- **`BountyBoard`** (issue bounties, above): no owner; pots per token, so a junk token can't block USDC; the CRE `github-bounty` workflow records the PR author as the winner, and anyone can then call `payout`. Funders reclaim after their own deadline while unsettled.
- **`Escrow`** (contract only; no client yet): pay a GitHub ID with a deadline. The recipient claims with an SSH signature over a readable claim text, and the sender can reclaim after the deadline if it's unclaimed. It's the answer to "what if they never touch the money?"

Both are at the same address on Base Sepolia and Arbitrum Sepolia (`contracts/deployments/extras.json`).

## CROPS

Lead property: **S (secure).** Sereno exists so that developers can hold and spend money with the keys they already protect best, without a new wallet, seed phrase or browser extension holding a hot key.

- **S (secure), the lead.**
  - Private keys never leave `ssh-agent`, the user's phone or their hardware security key. Sereno only ever sees signatures.
  - Users sign readable text (chain, account, nonce, amount, token, recipient, relayer fee), never blind calldata. The contract rebuilds that exact text and verifies the SSH signature on-chain.
  - Signing reuses OpenSSH, the most widely audited signing stack developers already run. Phone signatures also prove a fingerprint check (the user-verified flag).
  - Guards against a stolen GitHub account: a key first seen less than 72 hours ago can't move more than 50 USDC.
  - The nonce stops replay, including a payment commit pushed to many forks.
  - **Trust assumptions:**
    - GitHub decides which keys are on a profile.
    - The CRE oracle: in a deployed workflow, multiple nodes must agree on GitHub's answer before anything is written on-chain. For the hackathon it runs as a CRE simulation, whose forwarder checks no signatures, so reports pass through our `ReportGate`: only our broadcaster keys and our own workflows get through.
- **C (censorship resistance).** We run a relayer, a CCIP-read gateway and a CRE workflow, and none of them is a gatekeeper.
  - **The relayer:** `execute` and `executeCommit` are permissionless. Anyone can run `relayer/` with their own key or submit the signed payment themselves. The signed text fixes the recipient and fee, so a relayer can't redirect money.
  - **Payment commits:** any repo can relay its own with the reusable GitHub Action above, using its own key, so pushing a payment never depends on our relayer.
  - **The gateway:** anyone can run `gateway/`. The account address is also computable without it: `AccountFactory.addressOf(githubId)`.
  - **Key syncs and bounty settlement:** while the CRE workflows run in simulation, on-demand runs (new users' keys, bounty checks) go through a worker we run, so if it's down, new keys wait (keys already on-chain keep working, and anyone with CRE access can run `cre/` and the worker). Deploying the workflow to a CRE DON removes this; we've requested deploy access.
  - **Trade-off:** GitHub can remove a user's keys or account, and the oracle follows GitHub.
- **O (open source).** MIT licensed, including the contracts, workflow, gateway, relayer, CLI and pay page. Everything builds and runs from this repo with Bun and Foundry (see *Run it*). Vendored third-party code keeps its own license (`contracts/lib/ed25519`, Apache-2.0).
- **P (privacy).** A payment is public on-chain, like any transfer, and an account is linked to a GitHub ID by design.
  - **What each third party learns:**
    - **The gateway:** which names and usernames are looked up (the pay page and CLI look up profiles through it).
    - **The relayer:** the signed payments it submits, which are public on-chain anyway, and key sync requests.
    - **GitHub:** profile and key lookups from our services.
    - **RPC providers:** the requests sent to them.
  - Only key hashes go on-chain, not the keys.
  - The pay page and CLI carry no trackers or analytics.

## AI usage

The project was written during the hackathon with [Claude Code](https://claude.com/claude-code) as a pair programmer for every team member.
- **What Claude did:** contracts, tests, CRE workflow, gateway, relayer, CLI, pay page, deploy scripts and docs, from the team's design and under review.
- **What the team did:** chose the design and reviewed and ran every change. Live checks (on-chain payments, commit-as-payment, name claims) were run by the team on real testnets.
- **Attribution:** commits made with Claude carry a `Co-Authored-By: Claude` trailer.
- **Shared notes:** [`CLAUDE.md`](CLAUDE.md) is the shared context we gave every session, and [`PROGRESS-LOG.md`](PROGRESS-LOG.md) is how the team's sessions handed work to each other.

## License

MIT
