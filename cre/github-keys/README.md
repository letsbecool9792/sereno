# github-keys (Chainlink CRE workflow)

Keeps `KeyOracle` in sync with GitHub. Each node fetches every tracked user's login, authentication keys and signing
keys (`/user/{id}`, `/user/{id}/keys`, `/user/{id}/ssh_signing_keys`), the nodes must agree, and the report
`(githubId, login, keyHashes)` is written to the oracle. Tracked IDs live in `config.<chain>.json`.

```sh
bun install
cd .. && GITHUB_TOKEN_ALL=$(gh auth token) cre workflow simulate github-keys --target base-settings --non-interactive --trigger-index 0 --broadcast
```
Targets: `base-settings`, `arbitrum-settings`, `sepolia-settings`. Without `--broadcast` nothing is written.
