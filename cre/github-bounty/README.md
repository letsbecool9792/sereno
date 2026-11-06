# github-bounty (Chainlink CRE workflow)

Settles `BountyBoard` issue bounties. Given `owner/repo` and an issue number, each node asks GitHub's GraphQL API
whether the issue is closed and whether its latest close came from a **merged** PR in the same repo, and takes that PR
author's **numeric** GitHub ID. The nodes must agree. If they do, the report
`abi.encode(bytes32 repoHash, uint256 issue, uint256 authorGithubId)`, with `repoHash = keccak256(lowercase "owner/repo")`,
goes to the `ReportGate`, which routes it to `BountyBoard.onReport`. The board pays the pot to the author's SshAccount.

No report is written when the issue is open, was closed by hand or by a commit, was closed by an unmerged PR or by a
PR in another repo, or when the PR's author is a bot or a deleted account. GitHub errors other than "not found" fail
the run instead, so a flaky answer never becomes a "no".

One trigger:
- **0, HTTP:** body `{"repo": "owner/repo", "issue": "12"}`. Once deployed, only `httpAuthorizedKeys` (EVM addresses in
  the config) may call it; simulation accepts any caller.

GitHub's GraphQL API refuses anonymous requests, so the `GITHUB_TOKEN` secret is required (any token; no scopes needed
for public repos).

```sh
bun install
cd .. && GITHUB_TOKEN_ALL=$(gh auth token) cre workflow simulate github-bounty --target base-settings --non-interactive \
  --trigger-index 0 --http-payload '{"repo":"foundry-rs/foundry","issue":"18130"}'
```
Targets: `base-settings`, `arbitrum-settings`. Without `--broadcast` nothing is written. A forwarder "success" doesn't
prove the board ran, so after a broadcast look for BountyBoard's `Settled` event or read the bounty. `--broadcast` also
needs `-e ../.secrets/cre.env` (a key on the gate's broadcaster list; see CLAUDE.md 8.4).

The gate routes by `nameKey(workflow-name)` and the simulation owner `0xaaaa…aaaa`:

| Target | workflow-name | nameKey (bytes10) |
|---|---|---|
| `base-settings` | `github-bounty-base` | `0x31303131646239396337` ("1011db99c7") |
| `arbitrum-settings` | `github-bounty-arbitrum` | `0x39343865656566396630` ("948eeef9f0") |

`bun test` covers the decision and the report encoding (`bounty.ts`); `main.ts` only wires it into CRE.
