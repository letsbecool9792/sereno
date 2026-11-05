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
| WS1 contracts and relayer | Mohikshit | M3+M4 contracts done (PR); M1/M2 on Linux | ETH for relayer `0xd599…80d5` | 6 Nov 01:07 |
| WS2 CRE and ENS | Gantavya | G1–G4 code done (4 branches); G1 deploy, G2/G3 live runs | Fly account verification, `cre login` | 6 Nov 00:20 |
| WS3 clients and demo | Suparno + Claude | pay page works with MetaMask; demo prep next | | 5 Nov 23:10 |

---

## 2026-11-06 01:07 IST: Mohikshit's Claude: M3 BountyBoard and M4 Escrow contracts

Branch `ws1/bounty-escrow`. `forge test`: 70 pass (49 on `main` + 11 bounty + 10 escrow). `bun run typecheck` is clean. CLAUDE.md §5.2 documents both contracts.

- **M3 `BountyBoard`:**
  - `fund(repo, issue, token, amount, deadline)` escrows tokens per funder.
  - `onReport` is accepted only from `KeyOracle.forwarder()`. It pays the whole pot to `factory.addressOf(authorGithubId)` once.
  - Each funder refunds their own contribution after their deadline if the bounty is unsettled.
  - The report format is as proposed in PR #5: `(bytes32 repoHash, uint256 issue, uint256 authorGithubId)`.
- **M4 `Escrow`:**
  - `deposit(githubId, token, amount, deadline)`.
  - `claim(id, sshsig)`: an SSHSIG over `claimText(id)` (namespace `sereno@v1`) from any key the oracle lists for that ID. It pays the ID's account, so anyone can submit it.
  - `reclaim(id)`: only the sender, after the deadline.
  - Tested: unlisted key, a signature reused for another deposit, double claim, early reclaim, reclaim by others, claim after reclaim, reclaim after claim. A P-256 claim costs about 164k gas in tests.
- **Deploy with `script/DeployExtras.s.sol`, not `Deploy.s.sol`.** `Deploy.s.sol`'s KeyOracle embeds the deployer as owner, so running it with another key would redeploy the whole core at new addresses. `DeployExtras.s.sol` reads `deployments/core.json`, so any funded key can run it, and the addresses are the same on every chain:
  - BountyBoard `0xE4eDC89a072A89df0FCc76177Af380DB2182F7A8`
  - Escrow `0xDaaB8E6978A9CA599B8a2EcCFB13AF1CA0E963cb`

  Dry-run on a Base Sepolia fork: OK. It only lacks gas money. `bun run sync` now also exports `EXTRAS` (null until deployed).

**WAITING ON:**
- **Suparno:** review. Fund relayer `0xd599…80d5` (PR #5); Mohikshit then deploys the extras on Base and Arbitrum Sepolia with it.
- **Gantavya:** the CRE bounty check writes the report above to `BountyBoard.onReport`, after G1–G3.

---

## 2026-11-06 00:20 IST: Gantavya's Claude: G1–G4 code done; G1 not deployed yet

Four branches, each rebased on `main` (`f2d722f`), all checks green (`forge test` 49 pass, `bun run typecheck`, `bun test` 11 pass). Not pushed yet.

- **G4, `ws2/claim-text-records`:** `NameRegistrar._resolverInit` also sets the default record's `url` (`https://github.com/<login>`), `avatar` (`…/<login>.png`) and `com.github` text records in the same `initialize`, the same values the gateway answers for unclaimed names. `setText(bytes,string,string)` checked against `ensdomains/contracts-v2` at `v2-mainnet-deployment-1`. New test `test_claim_sets_github_text_records`. **Needs a Sepolia redeploy of the registrar** (the current `sereno.eth` one is `0x8163…47c5`); account addresses don't change.
- **G2, `ws2/cre-http-trigger`:** `github-keys` has trigger **0 = cron** (as before) and **1 = HTTP** (`{"githubId": "..."}`); both go through one `syncUser`, so the report is still exactly `(uint256 githubId, string login, bytes32[] keyHashes)`. Deployed, only `httpAuthorizedKeys` (config) may call it. Typechecks; **the live simulation isn't run yet** (needs `cre login`).
- **G3, `ws2/revoke-demo` (stacked on G2):** `bun run revoke-demo <user> --key <ssh key> [--relay <url>]` in `packages/ops`. It signs a spend with the key, waits until the key is deleted on GitHub, dry-runs the spend (still accepted), runs the HTTP trigger for that user with `--broadcast`, then dry-runs (or relays) the same signed spend: `KeyNotOnProfile`. Checked with a throwaway key against letsbecool9792's account (`--skip-sync`): signing, the intent read from the contract, and the error decode all work.
- **G1, `ws2/gateway-hosting`:** `gateway/Dockerfile` + `gateway/fly.toml` (always-on machine, `sin`, volume at `/data`), a root `.dockerignore` that keeps `.secrets/` out, and `CACHE_FILE`: login → ID and ID → account lookups persist across restarts, and a known login still answers from cache when GitHub errors. `/lookup` results feed the same cache. Tested locally: `torvalds.sereno.eth` answers and the cache reloads after a restart. **Not deployed:** Fly refused to create the app until the account is verified.
- **New gateway signer address: `0x1bAAF733d48C202D98B9B746ca5CC014604b1606`.** The key stays with Gantavya (Fly secret once deployed). Don't add it to the resolver until the URL exists; I'll post the URL here.

**WAITING ON:**
- **Gantavya:** verify the Fly account (fly.io/high-risk-unlock) and `cre login`; then deploy G1 and run G2/G3 live; push the branches and open PRs.
- **Suparno (after the G1 URL is posted):** on the `sereno.eth` resolver `0xd769…19c4`, `setSigner(0x1bAAF733d48C202D98B9B746ca5CC014604b1606, true)` and `setUrl("https://<host>/{sender}/{data}.json")`. After G4 merges, redeploy the NameRegistrar on Sepolia.

---

## 2026-11-05 23:10 IST: Suparno's Claude: pay page works; Mohikshit's tasks

**Pay page works with a real wallet:** Suparno paid 0.001 USDC on Base Sepolia from MetaMask through `web/` to a GitHub user's Sereno account (tx `0x41539…a23f0`). Fixes on the way: GitHub 403 (lookups now go through the gateway with a token), chain switching (the page now checks the wallet really switched), EIP-6963 wallet picker, and per-network re-authorization for newer MetaMask.

**The repo is public** at github.com/letsbecool9792/sereno. (The times in the three entries below were written wrong; they're corrected to the real ones.)

### Mohikshit (`psycocodes`): WS1, your tasks, in order

Setup as in Gantavya's entry below (`bun install`, `forge test`: 48 pass), and read `CLAUDE.md` sections 2, 4, 5 and 8.1–8.3. Branches `ws1/<topic>`, PRs to `main`; Suparno reviews and rebase-merges. Never commit `.secrets/`.

**M1. The core from Linux, with your ed25519 GitHub key (P0, about 30 min).** The oracle already tracks you (172588240) on all three chains.
1. `bun run ak account psycocodes`: your key should show "listed".
2. Post in this log; Suparno's Claude funds your account `0x0d39…5809` on Base Sepolia with 1 USDC.
3. Run a relayer locally (`bun relayer/src/main.ts`; you need a funded relayer key, see M2), then `bun run ak send 0.1 letsbecool9792 --as psycocodes --key ~/.ssh/id_ed25519`.
4. `ak commit-pay 0.1 letsbecool9792 --as psycocodes --key ~/.ssh/id_ed25519 --repo <a scratch repo> --relay`.
5. Report gas (ed25519 should be about 1.1M), tx links, and anything that broke on Linux.

**M2. Host the relayer on a durable URL (P0; demo beat 1:00 "the push is the broadcast").**
- Deploy `relayer/` (Bun) next to Gantavya's gateway or anywhere with HTTPS.
- **Use your own relayer key:** generate one, post only its address here, and Suparno's Claude funds it with ETH on Base, Arbitrum and Sepolia.
- Set `GITHUB_TOKEN` and `WATCH_REPOS=<demo repo>` (we'll create a public demo repo; until then, a test repo of yours).
- **Done when:** `git push` of a commit made with `ak commit-pay` is paid within about 30 seconds without calling the relayer by hand, and `/health` shows the watched repo.

**M3. Issue bounty, extra #2 (contract side).** `contracts/src/BountyBoard.sol`:
- `fund(repo, issue, amount)` escrows USDC;
- `settle(...)` is callable only by the CRE forwarder with a report `(bytes32 repoHash, uint256 issue, uint256 authorGithubId)` for a merged PR that closes the issue, and pays `factory.addressOf(authorGithubId)`;
- the funder can refund after a deadline;
- Foundry tests.

Agree the report format with Gantavya here first (he writes the CRE side after G1–G3).

**M4. Escrow with refund, extra #3.** Pay a GitHub ID with a deadline; anyone submits a claim signed by a key listed for that ID and the money goes to the ID's account; after the deadline the sender can reclaim. Tests for: unlisted key, double claim, early reclaim, reclaim by others.

**M5. GitHub Action relayer, extra #4.** A reusable workflow (`.github/workflows/sereno-relay.yml` + a small script) that a repo adds: on push, for each new commit whose message is an intent, it calls `executeCommit` with a relayer key from repo secrets. That makes relaying permissionless, which helps CROPS.

**WAITING ON:**
- **Mohikshit:** M1 and M2. Post your relayer address for funding.
- **Gantavya:** G1–G3 (entry below).
- **Suparno:** demo prep (phone key enrollment on the demo laptop, demo repo).

---

## 2026-11-05 ~22:30 IST: Suparno's Claude: ENS moved to sereno.eth; pay page fix

- **`sereno.eth` registered** on Sepolia ENSv2, with a new resolver, subregistry and registrar (addresses in `CLAUDE.md`). `letsbecool9792.sereno.eth` is claimed (owned by the account, resolves on-chain). `torvalds` and `psycocodes` `.sereno.eth` resolve through the gateway.
- **Pay page:** GitHub returned 403 (unauthenticated browser limit, 60/hour per IP). The gateway now serves `/lookup/<login>` with its token and a cache, and the page uses it. Run the gateway with `GITHUB_TOKEN`.
- **Gantavya, G1:** the hosted gateway must run the current `gateway/` (it serves both CCIP-read and `/lookup`), and the resolver to repoint is now the `sereno.eth` one.

---

## 2026-11-05 ~22:00 IST: Suparno's Claude: Sereno redeployed, core works end to end

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

## 2026-11-05 ~21:45 IST: Suparno's Claude: core built, Sereno named, Gantavya's tasks

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
- **Suparno:** ~~create the repo and push~~ done; ~~Sepolia USDC~~ done (`sereno.eth` registered). Add `g4ntavya` and `psycocodes` as collaborators.
- **Gantavya:** G1, G2, G3.

---

## 2026-11-05 ~21:00 IST: Suparno's Claude: repo scaffold

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
