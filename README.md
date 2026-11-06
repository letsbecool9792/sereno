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
npx sereno-ak send 1 alice --as <you> --key ~/.ssh/id_ed25519               # signs with ssh-keygen, relayer submits
npx sereno-ak commit-pay 1 alice --as <you> --key ~/.ssh/id_ed25519 --push  # in any GitHub repo: the push is the payment
npx sereno-ak claim --as <you> --key ~/.ssh/id_ecdsa                        # make <you>.sereno.eth a real ENSv2 subname
npx sereno-ak bounty https://github.com/owner/repo/issues/12 --settle        # settle an issue bounty and pay the PR author
```

A name claim is verified on Ethereum Sepolia, where the ed25519 verifier doesn't fit the gas limit, so it needs a P-256 key (`ssh-keygen -t ecdsa`) or a security key / phone (`-t ecdsa-sk`). Payments accept ed25519, P-256, RSA and security keys.

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

The relayer can only submit or refuse. The signed commit fixes the recipient, the amount and the fee.

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
  - **The gateway:** anyone can run `gateway/`. The account address is also computable without it: `AccountFactory.addressOf(githubId)`.
  - **Key syncs:** while the CRE workflow runs in simulation, on-demand syncs for new users go through a worker we run, so if it's down, new keys wait (keys already on-chain keep working, and anyone with CRE access can run `cre/` and the worker). Deploying the workflow to a CRE DON removes this; we've requested deploy access.
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
