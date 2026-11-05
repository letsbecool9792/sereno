# Sereno

**We didn't build a wallet. GitHub already was one.**

*A sereno was the night watchman of old Spanish towns: he kept the keys and called out that all was calm.*

Every SSH key on a GitHub profile is already an Ethereum signer. Pay any developer by GitHub username; they spend with the `ssh-keygen` and `git commit -S` they already use. No app, no seed phrase, no signup.

## How it works

1. **Account.** Every GitHub user has a smart account at a CREATE2 address derived from their numeric GitHub ID, the same on every EVM chain. Money can arrive before it is deployed.
2. **Name.** `<github-user>.sereno.eth` resolves to that account (ENSv2 wildcard plus a CCIP-read gateway). Claiming turns it into a real ENSv2 subname owned by the account.
3. **Keys.** A Chainlink CRE workflow reads the user's SSH keys from GitHub, the nodes agree, and the key hashes go on-chain. Removing a key on GitHub revokes it.
4. **Spend.** Sign a plain-text payment with `ssh-keygen -Y sign`, or make it the message of a signed git commit and push. The contract verifies the SSH signature on-chain and pays.

## Repo layout

| Path | What |
|---|---|
| `contracts/` | Foundry: SSH signature verifier, account and factory, key oracle, ENS resolver and name registrar |
| `cre/` | Chainlink CRE workflow that syncs GitHub keys on-chain |
| `gateway/` | CCIP-read gateway for `<user>.sereno.eth` |
| `relayer/` | Submits SSH-signed payments and pushed payment commits |
| `cli/` | `ak`: sign and send payments, commit-pay, claim your name |
| `web/` | Pay page: pay any GitHub user by username |
| `packages/shared/` | Intent text, chains, addresses and ABIs shared by every client |

## Run it

Needs [Bun](https://bun.sh) and, for contracts, [Foundry](https://getfoundry.sh). Contracts are deployed on Base Sepolia, Arbitrum Sepolia and Sepolia (addresses in `CLAUDE.md`).

```sh
bun install
```

Then three terminals from the repo root (PowerShell shown; in bash use `GITHUB_TOKEN=$(gh auth token) bun ...`):

```powershell
# 1. ENS gateway (CCIP-read for <user>.sereno.eth, and profile lookups for the pay page) on :8787
$env:GITHUB_TOKEN = gh auth token; bun gateway/src/main.ts
# 2. relayer (submits SSH-signed payments, commits and name claims) on :8788
$env:GITHUB_TOKEN = gh auth token; bun relayer/src/main.ts
# 3. pay page on http://localhost:5173
cd web; bun run dev
```

The gateway needs `.secrets/gateway.key` and the relayer `.secrets/relayer.key` (or `deployer.key`); ask Suparno.

CLI: `bun run ak account <github-user>`, `bun run ak send 0.1 <user> --as <you> --key ~/.ssh/id_ed25519`, `bun run ak commit-pay ...`, `bun run ak claim --as <you> --key <key>`.

Contracts: `cd contracts && forge test`.

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
    - The CRE oracle: in a deployed workflow, multiple nodes must agree on GitHub's answer before anything is written on-chain. For the hackathon it runs as a CRE simulation.
- **C (censorship resistance).** We run a relayer, a CCIP-read gateway and a CRE workflow, and none of them is a gatekeeper.
  - **The relayer:** `execute` and `executeCommit` are permissionless. Anyone can run `relayer/` with their own key or submit the signed payment themselves. The signed text fixes the recipient and fee, so a relayer can't redirect money.
  - **The gateway:** anyone can run `gateway/`. The account address is also computable without it: `AccountFactory.addressOf(githubId)`.
  - **Trade-off:** GitHub can remove a user's keys or account, and the oracle follows GitHub.
- **O (open source).** MIT licensed, including the contracts, workflow, gateway, relayer, CLI and pay page. Everything builds and runs from this repo with Bun and Foundry (see *Run it*). Vendored third-party code keeps its own license (`contracts/lib/ed25519`, Apache-2.0).
- **P (privacy).** A payment is public on-chain, like any transfer, and an account is linked to a GitHub ID by design.
  - **What each third party learns:**
    - **The gateway:** which names are looked up.
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
