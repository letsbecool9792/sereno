# PROGRESS-LOG

Shared log between the team's Claude sessions (and humans). Read `CLAUDE.md` first.

**Protocol:**
1. `git pull --rebase`, then read the newest entries; they're at the top.
2. Work on your branch (`<ws>/<topic>`), never on `main`.
3. Add an entry **at the top**: date and time (IST), who, the branch or PR, what was done, results, and **WAITING ON** (who acts next).
4. Include the entry in your PR. On a rebase conflict in this file, keep both entries.

**Status board** (each owner edits only their own row):

| WS | Owner | Now working on | Blocked on | Last update |
|---|---|---|---|---|
| WS1 contracts and relayer | Suparno's Claude (Mohikshit later) | done for core; redeployed under Sereno | | 6 Nov 04:00 |
| WS2 CRE and ENS | Gantavya | tasks G1–G4 below | | 6 Nov 03:30 |
| WS3 clients and demo | Suparno's Claude | pay page (web/) | | 6 Nov 04:00 |

---

## 2026-11-06 04:00 IST: Suparno's Claude: Sereno redeployed, core works end to end

**Redeployed under the Sereno name** (addresses in `CLAUDE.md` section 7), CRE resynced on all three chains, and a new NameRegistrar on Sepolia.

**End to end on Base Sepolia with the CLI**, using letsbecool9792's GitHub signing key "yo" (P-256), relayer and gateway running locally:
1. Paid 1 USDC to letsbecool9792's account `0xa82F…d4F8` before it existed.
2. `ak send 0.1 psycocodes`: the relayer deployed the account and paid ([tx](https://sepolia.basescan.org/tx/0x7731ae72a2fad2902a88429ad75ac7d5a16e4baf8a68d5a9a753f445f477ec2a)).
3. `ak commit-pay 0.1 psycocodes --relay`: a signed git commit paid ([tx](https://sepolia.basescan.org/tx/0xd72b391666bed3ee24dbb6701d4ccd01ec0bf1e079c4b21d71e45a04dbcfc525)).
4. `ak claim`: `letsbecool9792.authorizedkeys.eth` is now a real ENSv2 subname owned by the account, resolving on-chain through its own PermissionedResolver ([tx](https://sepolia.etherscan.io/tx/0x8a0aaa9ee98d9afa377af9f32b17fb532097d342a63a8907a53696cabec18abe)). Unclaimed names (`torvalds`) still resolve through the gateway.

**Left in core:**
- the pay page (`web/`, Suparno's Claude, next);
- G1–G3 (Gantavya);
- `sereno.eth` once we have Sepolia USDC.

**WAITING ON:** as in the entry below.

---

## 2026-11-06 03:30 IST: Suparno's Claude: core built, Sereno named, Gantavya's tasks

**State of `main`** (all on testnets, details in `CLAUDE.md`):
- **Contracts, 48 tests:** SSH-signature verifier (every key type), KeyOracle, SshAccount (pay by signed text or by signed commit, 72 h new-key delay, can own ENS names), AccountFactory, ENS OffchainResolver, NameRegistrar (claim your name).
- **Deployed** at the same addresses on Base Sepolia, Arbitrum Sepolia and Sepolia, but under the old working name. **Redeploying under `sereno` now** (the signed text changed); `contracts/deployments/*.json` is updated when that lands.
- **`cre/github-keys`:** syncs logins plus auth and signing keys for a list of GitHub IDs to all three chains (GitHub token via CRE secrets).
- **`gateway/`:** CCIP-read gateway, checked live through ENSv2 on Sepolia.
- **`relayer/`:** `/intent`, `/commit` (raw or from GitHub, plus a repo watcher), `/claim`.
- **`cli/` (`bun run ak`):** `account`, `send`, `commit-pay`, `claim`.
- Still to come from Suparno's side: the pay page (`web/`) and the end-to-end demo run.

### Gantavya (`g4ntavya`): WS2, your tasks, in order

Setup: clone, `bun install`, Foundry (`foundryup`), `cd contracts && forge test` (48 pass). For CRE: install the `cre` CLI and `cre login`. Read `CLAUDE.md` sections 2, 4, 5, 7 and 8.4–8.5. Work on branches `ws2/<topic>` and open a PR to `main`; Suparno reviews and rebase-merges. Never commit anything from `.secrets/`.

**G1. Host the gateway on a durable HTTPS URL (P0; blocks the demo).** Quick Cloudflare tunnels die after 1–2.5 hours. Deploy `gateway/` (Bun) to Railway, Render, Fly.io, a VPS or a named Cloudflare tunnel.
- **Use your own signing key:** generate one, keep it in your host's secrets, and post only its **address** in this log. Suparno's Claude then adds it to the resolver with `setSigner(address, true)` and points the resolver at your URL with `setUrl`. You never need our keys.
- Set `GITHUB_TOKEN` (a token with no scopes is enough).
- Add username-to-ID caching that survives restarts (optional).
- **Done when:** `https://sepolia.app.ens.domains/torvalds.<parent>` shows Torvalds' account, and `viem.getEnsAddress` with `gatewayUrls: ["https://ccip-v3.ens.xyz"]` returns it.

**G2. The CRE workflow tracks users on demand (P0 for the demo).** Today `config.<chain>.json` lists GitHub IDs by hand. Add an **HTTP trigger** taking `{"githubId": "..."}` next to the cron trigger, so the relayer or pay page can sync one user right before they spend or claim. Keep the report format `(uint256 githubId, string login, bytes32[] keyHashes)` exactly.
- **Done when:** `cre workflow simulate github-keys --target base-settings --non-interactive --trigger-index 1 --http-payload '{"githubId":"172588240"}' --broadcast` writes psycocodes' keys, and `bun run ak account psycocodes` shows them listed.

**G3. Revocation, ready for the demo (P0, demo beat 2:40).** A one-command script (`packages/ops`) that runs the CRE sync for one user on Base Sepolia and then shows that user's last spend being rejected (`KeyNotOnProfile`) after a key is removed on GitHub. Practise it with a throwaway key on a test GitHub account, never someone's real key.

**G4. Text records for claimed names (P1).** Claimed names currently get only address records. Extend `NameRegistrar._resolverInit` to also set `url`, `avatar` (`https://github.com/<login>.png`) and `com.github` text records on the default record, add a Foundry test, and ask in this log for a Sepolia redeploy of the registrar.

After G1–G3: the issue-bounty extra (CRE confirms a merged PR and the author is paid). We'll plan it here when you get there.

**WAITING ON:**
- **Suparno:**
  - create the GitHub repo and push (Claude Code's auto mode blocks Claude from doing it);
  - add `g4ntavya` as a collaborator;
  - get **Circle Sepolia USDC** (faucet.circle.com) for `0x11c06c02424cab83238A7747eBc6584b4B680588`: we have 3.79 and `sereno.eth` costs 8.
- **Gantavya:** G1, G2, G3.

---

## 2026-11-05: Suparno's Claude: repo scaffold

**Done:** the initial commit on `main`:
- monorepo scaffold (see `CLAUDE.md` section 6);
- `CLAUDE.md` with the plan, the interfaces between workstreams and all technical facts;
- this log;
- CI, the PR template, CODEOWNERS, MIT license, and `.gitattributes` for signed test files.

**Next for everyone:**
1. Clone, then run `bun install` and `cd contracts && forge build`.
2. Read `CLAUDE.md` sections 2, 4 and 5.
3. Create your first branch and post a status row.
4. **Agree on section 5 (interfaces) in the first hour.** Changes after that go through a PR that edits `CLAUDE.md`.

**WAITING ON:** everyone. WS1 starts the verifier and account; WS2 starts the CRE workflow and registers `sereno.eth` on Sepolia ENSv2; WS3 starts `packages/shared` (intent builder) and the pay page.
