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

_Filled in as each part lands._

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
