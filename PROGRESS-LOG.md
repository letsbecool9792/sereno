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
| WS1 contracts and relayer | Mohikshit | M1/M2 on Linux; M3–M5 code meanwhile | ETH for relayer `0xd599…80d5` | 6 Nov 01:00 |
| WS2 CRE and ENS | Gantavya | G1–G4 code done (4 branches); G1 deploy, G2/G3 live runs | Fly account verification, `cre login` | 6 Nov 00:20 |
| WS3 clients and demo | Suparno + Claude | registrar redeployed, relayer funded; forwarder hole (below) needs a decision; demo prep | | 6 Nov 01:45 |

---

## 2026-11-06 01:45 IST: Suparno's Claude (laptop): Mohikshit's relayer funded; NameRegistrar redeployed; reviews of #5–#7; a forwarder hole

Branch `ws3/crops-registrar`: the cloud session's two commits (revoke-demo cherry-picked onto `main`, README CROPS and AI usage), plus this.

**Done:**
- **Mohikshit's relayer `0xd599…80d5` is funded:**
  - Base Sepolia, 0.002 ETH: `0x50ed959c…7492e`
  - Arbitrum Sepolia, 0.002 ETH: `0xe1d42960…3ffc3`
  - Sepolia, 0.0005 ETH: `0x0f82bd74…dab65`

  At L2 gas prices, an ed25519 payment of about 1.1M gas costs about 0.000001 ETH. The deployer has about 0.008 ETH left on each L2, so ask if you run low.
- **NameRegistrar redeployed on Sepolia with #1's text records:** `0x55e81868098759409757a341c0818e0b203b3845`.
  - Deploy: `0x478a314a…0595`
  - `grantRootRoles`: `0x811c0421…e238`
  - The old registrar `0x8163…47c5` had its roles on the UserRegistry revoked (`0xfda1944f…2ae6`; its role bitmap now reads 0).

  `ens.json` keeps the old registrar under `previousNameRegistrar`. `bun run sync` and CLAUDE.md §7 are updated. `letsbecool9792.sereno.eth` was claimed through the old registrar and stays as it is, without text records. A fresh claim needs a P-256 or phone key, because Sepolia has no Ed25519 verifier.

**Reviews:**
- **#5:** fine. The exec-bit fix is right.
- **#6:** 70 tests pass. The code is clean and matches §5.2. A minor griefing case: the first funder fixes the token, so anyone can fund an issue with 1 wei of a junk token and block USDC bounties on it. Fix: put `token` into `bountyId`, or accept only USDC.
- **#7:** typecheck is clean. `setup-bun` pins 1.3.4 while our lockfile is from 1.4.4, and `--frozen-lockfile` may refuse it. Pin `bun-version: 1.4.4`.
- All three add entries to the top of this file, so whichever merges second needs a rebase that keeps both entries.

**Security: anyone can write to the KeyOracle through the CRE simulation forwarder (all three chains).**
- **The check:** an `eth_call` on Base Sepolia, from `0xdEaD` with no signatures. It called `MockForwarder.report(KeyOracle, <fake metadata ‖ abi.encode(1024025, "torvalds", [0xabab…])>, 0x, [])`.
  - The forwarder routed it.
  - `KeyOracle.onReport` accepted it and emitted `KeysUpdated`.
- **Impact:**
  - **KeyOracle:** an attacker can add their own key to any GitHub ID and spend up to 50 USDC from that account at once (the 72 h delay only covers larger spends).
  - **#6's BountyBoard and Escrow:** they trust the same forwarder, so the same attacker could settle any bounty to any GitHub ID.
  - It's testnet money, but the README leads CROPS with *secure*, and a judge can find this.
- **Cause:**
  - The simulation forwarder doesn't verify DON signatures.
  - `onReport` doesn't check the report metadata (workflow owner and name), so even the production forwarder, which all CRE users share, would accept reports from anyone's workflow.
- **Proposed fix, with no core redeploy and no account addresses changing:** a small `ReportGate` receiver.
  - It's owner-managed, with an allowlist of broadcasters (`tx.origin`, the `CRE_ETH_PRIVATE_KEY` addresses that run `--broadcast`) and of expected workflow owners and names from the metadata. Each workflow name routes to a target (KeyOracle, BountyBoard).
  - Then `KeyOracle.setForwarder(gate)` on all three chains, and the CRE configs write to the gate.
  - BountyBoard reads `oracle.forwarder()`, so it's covered automatically.
  - `tx.origin` is the simulation-only guard. The metadata check is the production story.

**WAITING ON:**
- **Suparno:**
  - merge this branch (it has the cloud session's commits too);
  - decide on the forwarder fix and who builds it;
  - create the public demo repo and post its name here (Mohikshit's laptop relayer watches it).
- **Mohikshit:**
  - M1/M2 (now funded) and the extras deploy;
  - the #7 `bun-version` pin;
  - optionally #6's token griefing fix;
  - rebase #5–#7 one after another as they merge.
- **Gantavya:** post the gateway URL; OK the bounty report format (#5).

---

## 2026-11-06 01:30 IST: Suparno's Claude (cloud session): revoke-demo onto main; README CROPS and AI usage

Branch `ccr-ec529b10-q1y6rm`.

- **G3 wasn't on `main`.** PR #3 (`revoke-demo`) was merged into its base branch `ws2/cre-http-trigger` *after* #2 had already merged, so it never reached `main`. This branch cherry-picks it onto `main` unchanged (Gantavya's commit; `bun run typecheck` passes).
- **README:** the CROPS section (lead property S, one block per letter, trust assumptions and trade-offs stated) and the AI-usage section are filled in. CRE is described as a simulation, and phone signing and "Verified" commits aren't claimed until they've been run.
- **PR #5 (Mohikshit, log only):** fine to merge, but it conflicts with `main` in this file (Gantavya's 00:20 entry). Mohikshit rebases and keeps both entries. The bounty report format checks out against the code: `KeyOracle.forwarder()` is public, so an ownerless BountyBoard can read it.

**WAITING ON:**
- **Suparno:** merge this branch; fund Mohikshit's relayer `0xd599b2cc187F35D143Df41c95074A0D3200080d5` with ETH on Base Sepolia, Arbitrum Sepolia and Sepolia (from the laptop; the cloud session has no keys). After #1's merge, redeploy the NameRegistrar on Sepolia (laptop).
- **Mohikshit:** rebase #5 onto `main`.
- **Gantavya:** OK the bounty report format in #5; post the gateway URL.

---

## 2026-11-06 01:00 IST: Mohikshit's Claude: Linux setup; relayer key; bounty report format

Branch `ws1/linux-e2e`.

**Setup on Linux (Arch):** `bun install` works, and `forge test` passes 48/48. `bun run ak account psycocodes` reports the ed25519 key as **listed** (since 5 Nov 16:19 UTC); the account `0x0d39…5809` already holds 0.2 USDC on Base Sepolia.
- Linux gotcha: run the CLI with `GITHUB_TOKEN=$(gh auth token)`. Without a token, `api.github.com` answered 403 (the unauthenticated limit) on the first call.

**M1 so far, without gas:** `ak commit-pay … --key ~/.ssh/id_ed25519` (no `--relay`) signs the payment commit correctly on Linux.
- An `eth_call` to the deployed `SshSigVerifier` on Base Sepolia returns `true` for that commit (namespace `git`, sha256). Verification alone costs about **949k gas**.
- **Linux bug fixed:** `cli/bin/sha256-sign.sh` was committed from Windows without the executable bit, so `git commit -S` failed with "cannot exec … Permission denied". It is now `100755` in git.

**Relayer key (M1/M2):** **`0xd599b2cc187F35D143Df41c95074A0D3200080d5`**, our own key (kept in `.secrets/relayer.key` on Mohikshit's laptop). It needs ETH on Base Sepolia, Arbitrum Sepolia and Sepolia.

**M2 decision:** the relayer runs **on Mohikshit's laptop for now**. The watcher polls GitHub outbound, so it needs no public URL. Once the push-to-pay test works, we move it to a durable host. The likely choice is Vercel serverless, with a GitHub push webhook in place of the 15 s poller. Until then, a payment pushed while the laptop is off is not relayed (the poller skips commits that exist at startup).

**M3 report format, proposed to Gantavya:** the CRE bounty workflow writes to `BountyBoard.onReport(bytes metadata, bytes report)`:
- `report = abi.encode(bytes32 repoHash, uint256 issue, uint256 authorGithubId)`;
- `repoHash = keccak256(bytes(lowercase "owner/repo"))`;
- send it only for a **merged** PR that closes `issue`; `authorGithubId` is the PR author's numeric ID.

BountyBoard accepts reports only from `KeyOracle.forwarder()` (the same CRE forwarder), so it has no owner and gets the same address on every chain. Gantavya: reply here if you want a different format.

**WAITING ON:**
- **Suparno's Claude:** ETH to `0xd599b2cc187F35D143Df41c95074A0D3200080d5` on Base Sepolia, Arbitrum Sepolia and Sepolia. 1 USDC to `0x0d39…5809` on Base Sepolia is optional; it already has 0.2, enough for M1.
- **Gantavya:** OK on the bounty report format above.
- **Mohikshit:** M1 send and commit-pay once funded; M3–M5 code meanwhile.

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
