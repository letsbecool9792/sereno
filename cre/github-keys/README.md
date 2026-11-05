# github-keys (Chainlink CRE workflow)

Keeps `KeyOracle` in sync with GitHub. Each node fetches every tracked user's login, authentication keys and signing
keys (`/user/{id}`, `/user/{id}/keys`, `/user/{id}/ssh_signing_keys`), the nodes must agree, and the report
`(githubId, login, keyHashes)` is written to the oracle.

Two triggers:
- **0, cron:** syncs every ID listed in `config.<chain>.json` (`githubIds`).
- **1, HTTP:** syncs one user on demand. Body `{"githubId": "172588240"}`. The relayer or pay page calls it right before a
  spend or claim, so nobody has to be listed by hand. Once deployed, only `httpAuthorizedKeys` (EVM addresses in the
  config) may call it; simulation accepts any caller.

```sh
bun install
cd .. && GITHUB_TOKEN_ALL=$(gh auth token) cre workflow simulate github-keys --target base-settings --non-interactive --trigger-index 0 --broadcast
# one user, on demand:
GITHUB_TOKEN_ALL=$(gh auth token) cre workflow simulate github-keys --target base-settings --non-interactive \
  --trigger-index 1 --http-payload '{"githubId":"172588240"}' --broadcast
```
Targets: `base-settings`, `arbitrum-settings`, `sepolia-settings`. Without `--broadcast` nothing is written.
