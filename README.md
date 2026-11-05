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

Lead property: **S (secure).**

- **C (censorship resistance):** _TBD_
- **O (open source):** MIT licensed; everything builds from this repo.
- **P (privacy):** _TBD_
- **S (security):** _TBD_

## AI usage

_TBD: where AI tools were used, and how._

## License

MIT
