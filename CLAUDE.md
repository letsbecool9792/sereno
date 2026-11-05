# CLAUDE.md

Context for every Claude (or other agent) session in this repo. Read this file first, then the newest entries at the top of `PROGRESS-LOG.md`. Keep this file current; it is the single source of truth for the plan, the interfaces between workstreams and the technical facts.

**Sereno.** A *sereno* was the night watchman of 18th-century Spanish towns: he carried the lantern and the **keys**, walked the rounds, and called out the hour and that all was calm ("¡Las once y sereno!"). Our product keeps watch over the keys developers already have.

The slug `sereno` appears in the ENS parent name (`sereno.eth`), the signing namespace (`sereno@v1`) and the intent header (`sereno v1`). It's defined once per package: `contracts/src/Constants.sol` and `packages/shared/src/constants.ts`. Changing it changes the signed text, so contracts must be redeployed.

---

## 1. The hackathon

- **ETHGlobal Mumbai, 5–7 Nov 2026.** Submission deadline **Sat 7 Nov, 09:00 IST**. Code freeze 04:00 Sat.
- **Goal: Finalist** (top 10: a 4-minute demo plus 3 minutes of Q&A; judged on technicality, originality, practicality, usability, wow). Up to **3 partner prizes**: ENS (Best Use of ENSv2), Chainlink (Best workflow with CRE), EF (Best CROPS App). Checklists in section 9.
- **All project code is written during the hackathon, in this repo.** Third-party libraries are fine when vendored with their license.
- **Document AI use.** ETHGlobal asks for attribution: commits made with Claude keep their `Co-Authored-By` line, and the README has an "AI usage" section.
- **Public repo, MIT license** (CROPS requires a FOSS license and a public repo).
- **Cut rule:** anything not working by **Fri 6 Nov midday** becomes a slide.

## 2. Team and how we work

| Who | GitHub | Machine | Workstream |
|---|---|---|---|
| Suparno | `letsbecool9792` | Windows (demo laptop; phone-as-key works only here) | WS3 clients and demo; reviews every PR |
| Mohikshit | `psycocodes` | Linux | WS1 contracts and relayer (built by Suparno's Claude for now; Mohikshit joins later) |
| Gantavya | `g4ntavya` | | WS2 identity: CRE and ENS (tasks in `PROGRESS-LOG.md`) |

**Git workflow (strict):**
1. Never push to `main`. Work on a branch named `<ws>/<topic>`, for example `ws1/account-execute`, `ws2/cre-keys`, `ws3/pay-page`.
2. Keep PRs small and focused; open them early as drafts if useful.
3. Before asking for review: `git fetch && git rebase origin/main`, then all checks pass locally (`forge test`, `bun run typecheck`, `bun test` where they exist).
4. **Suparno, with Claude, reviews every PR** from Mohikshit and Gantavya. Suparno's own PRs get a Claude review.
5. Merge method: **rebase and merge** (linear history). Delete the branch after merging.
6. The PR description says what changed, why, how it was tested, and which interface (section 4) it touches. A change to a section-4 interface must update this file in the same PR.

**PROGRESS-LOG.md protocol:** pull, read the newest entries, do your part, then add an entry **at the top** with date and time, who, what was done, results and **WAITING ON**. Put the entry in your PR. When rebasing, keep both entries if the log conflicts.

## 3. The product

**Pitch:** "We didn't build a wallet. GitHub already was one."

Every SSH key on a GitHub profile is already an Ethereum signer. Anyone can pay a developer by GitHub username, and the developer spends with the `ssh-keygen` and `git commit -S` they already have: no app, no seed phrase, no signup.

1. **Account:** every GitHub user has a smart account at a CREATE2 address derived from their **numeric GitHub ID**. That's rename-proof, because GitHub releases renamed usernames. Money can arrive before the account is deployed. The address is the same on every EVM chain.
2. **Name:** `<github-user>.sereno.eth` resolves to that account through an ENSv2 wildcard resolver plus a CCIP-read gateway (username → numeric ID → address). A developer can **claim** the name: it becomes a real ENSv2 subname owned by their account, with their own PermissionedResolver.
3. **Keys:** a Chainlink CRE workflow reads the user's GitHub SSH keys (authentication and signing keys), the nodes agree, and the key hashes are written on-chain. A key removed on GitHub is revoked at the next run.
4. **Spend:** the developer signs a plain-text intent with stock `ssh-keygen -Y sign` (or a phone acting as a security key). The contract rebuilds the text, verifies the SSH signature on-chain, checks that the key is on the profile, and pays. A relayer submits and takes a small fee; anyone, including the developer, can submit instead.
5. **Commit-as-payment:** a `git commit -S` whose message is the intent text is itself the payment. Pushing it to GitHub is the broadcast, and GitHub even shows the green "Verified" badge.
6. **Safety:** large spends from a key first seen less than 72 hours ago are delayed. Users sign readable text, never blind calldata.

**Users / "who sends money on Monday?":** bounty funders and maintainers (pay a PR author with no "send me your address" step), hackathon and grant organisers (pay by GitHub username), anyone tipping a commit's author, and AI agents paying package authors with a phone fingerprint to approve.

## 4. What we build

### Core (must ship; this is the demo)

| Id | Feature | WS |
|---|---|---|
| A1 | GitHub-ID account at a deterministic CREATE2 address, same address on every chain | 1 |
| A2 | SSH-signature spend: SSHSIG verified on-chain for P-256, sk-ecdsa (phone), ed25519, RSA | 1 |
| A3 | CRE key oracle with revocation (auth and signing keys, GitHub token from CRE secrets) | 2 |
| A4 | Pay by name: ENSv2 wildcard resolver plus CCIP-read gateway on a durable HTTPS host with cached GitHub lookups | 2 |
| A4b | Claim your name: a real ENSv2 subname in our subregistry, owned by the SSH account, with its own PermissionedResolver | 2 (+1 for the account's ERC-1155 receiver) |
| C0 | Pay page (web): GitHub username → name → address; pay USDC with the visitor's wallet | 3 |
| A5 | Intent text binds chain, account, nonce, recipient and fee | 1 |
| A6 | Relayer: fee, self-submit fallback, and it watches the demo repo through GitHub's API for payment commits | 1 |
| A7 | New-key delay: over 50 USDC from a key first seen less than 72 h ago is refused | 1 |
| A8 | Phone as the SSH key on Windows (QR code, then fingerprint), plus a backup video | 3 |
| A9 | `ak` CLI: `ak send`, `ak commit-pay`, `ak claim` | 3 |
| A11 | Deployed on Base Sepolia (primary) and Arbitrum Sepolia, same addresses, Circle USDC | 1 |
| B1 | Commit-as-payment: one account accepts both `execute` and `executeCommit` | 1 |
| B3 | GitHub's green "Verified" badge on the payment commit | 3 (demo setup) |

### Extras (in this order, only after the core works)

1. **C1/C2 browser extension:** Pay button on github.com profiles, "Tip author" on commits and PRs; reuses the pay page (WS3).
2. **D1 issue bounty**, the one application: fund an issue; CRE confirms the merged PR; pay the PR author (WS1 contract, WS2 CRE check).
3. **A10 escrow with refund:** pay a GitHub ID with a deadline; claim with an SSH signature; refunded to the sender after the deadline (WS1).
4. **B2 GitHub Action as a permissionless relayer** (WS1).
5. **E1 agent spending with phone approval.**
6. **F1–F3 hardening:** key seniority (older keys can veto newer ones), caps on commit-signed spends, show the exact signed text everywhere.
7. Last, only if everything else is done: **rent a shell** (pay with an SSH key, then `ssh` into a machine until the paid time ends, via sshd `AuthorizedKeysCommand`).

**Not building:** a mainnet ENS name, ERC-4337 (the relayer is simpler), anything market or token related, Arc, CCIP, Whitechain.

### Demo script (4 minutes, Windows laptop)

| Time | Beat |
|---|---|
| 0:00 | Hook: `github.com/<user>.keys`. "These keys are already Ethereum signers." |
| 0:20 | **Pay by name** on the pay page: type a GitHub username, pay USDC from any wallet; it lands in an account that doesn't exist yet |
| 1:00 | **Commit-as-payment:** `git commit -S` with the payment as the message, `git push`; GitHub shows **Verified**; the relayer picks it up; USDC moves. "The push is the broadcast." |
| 2:00 | **Phone as the key, claiming the name:** QR code and fingerprint sign the claim; the name becomes a real ENSv2 subname owned by the account (show it in the ENS app) |
| 2:40 | **Revocation:** delete the key on GitHub; the CRE workflow runs; the next spend is rejected |
| 3:20 | Same address on Base and Arbitrum. "We didn't build a wallet. GitHub already was one." (15 seconds spare) |

Fallbacks:
- Record the phone flow beforehand; Bluetooth can fail on stage.
- `api.github.com` can time out, so keep a cached oracle result.
- Never demo with commits made in GitHub's web editor: GitHub signs those with its own key.

### Milestones

1. **Thu 5 Nov, evening:** scaffold merged; contracts compile with the verifier; CRE simulation reads GitHub; interfaces (section 5) agreed.
2. **Fri 6 Nov, morning:** deployed on Base Sepolia; pay by name works end to end; commit-as-payment works.
3. **Fri 6 Nov, evening:** CLI, relayer, claim-your-name, phone flow, pay page polished.
4. **Fri night:** extras, README (with CROPS and AI usage), demo recording; **freeze 04:00 Sat**.
5. **Sat 7 Nov, before 09:00 IST:** submit; tag a release; the demo video is 3 minutes or less.

## 5. Interfaces between workstreams (change only by PR that updates this section)

### 5.1 Intent text (exact bytes; every client and the contract must agree)

```
sereno v1
chain: <chainId, decimal>
account: <account address, 0x + 40 lowercase hex>
github-id: <numeric GitHub id, decimal>
nonce: <account nonce, decimal>
send: <amount in token base units, decimal> of <token address, lowercase hex>
to: <recipient address, lowercase hex>
relayer-fee: <fee in token base units, decimal>
```

Every line ends with `\n`, including the last; there is no other whitespace. The account exposes `intent(token, to, amount, fee, nonce) view returns (bytes)`, so clients can read the exact text from the contract instead of rebuilding it. The shared TS package's builder must match it byte for byte (test both).
- **`ssh-keygen` signing:** namespace `sereno@v1`, always `-O hashalg=sha256`. For example: `ssh-keygen -Y sign -n sereno@v1 -O hashalg=sha256 -f <key> intent.txt`.
- **Commit signing:** the commit message must be **exactly** the intent text (namespace `git`, which git sets).

### 5.2 Contracts (WS1)

- `Account.execute(address token, address to, uint256 amount, uint256 fee, bytes sshsig)`: verify `sshsig` over `intent(...)` in namespace `sereno@v1`; key on profile; delay rule; `nonce++`; pay `to`, then `fee` to `msg.sender`.
- `Account.executeCommit(address token, address to, uint256 amount, uint256 fee, bytes headers, bytes sshsig)`: signed bytes = `headers ‖ "\n" ‖ intent(...)`, namespace `git`. `headers` must start with `tree `, end with `\n`, and contain no `\n\n`, so the intent is the *whole* message and not a paragraph hidden inside a longer one.
- `Account.nonce()`, `Account.githubId()`. `Account` implements `onERC1155Received` (ENSv2 names are ERC-1155 tokens; without it the claim reverts with `ERC1155InvalidReceiver`, selector `0x57f447ce`).
- `Factory.addressOf(uint256 githubId) view returns (address)`, `Factory.deploy(uint256 githubId)`; CREATE2 salt = `bytes32(githubId)`.
- `KeyOracle.firstSeen(uint256 githubId, bytes32 keyHash) view returns (uint256)` (0 = not listed), `keysOf(uint256 githubId)`. `keyHash = keccak256(raw key blob)`, where the raw blob is the base64-decoded second field of the `authorized_keys` line (`ssh-ed25519 AAAA… comment`).
- `KeyOracle.onReport(bytes metadata, bytes report)`: accepts only the CRE forwarder. `report = abi.encode(uint256 githubId, string login, bytes32[] keyHashes)`: the lowercase login and the complete current key set. It clears removed keys, keeps `firstSeen` for keys still present, sets `block.timestamp` for new ones, and maps `idOfLoginHash(keccak256(login)) → githubId`, following renames. `NameRegistrar` uses that mapping, so nobody can claim someone else's username. The forwarder is **owner-settable**, not a constructor argument, so the oracle's address is identical on every chain.

### 5.3 Name gateway (WS2)

- EIP-3668 CCIP-read: `GET /{sender}/{data}.json`, plus `POST` with `{sender, data}`.
- Answers `addr(node)`, `addr(node, coinType)` for every EVM coin type (60, or `0x80000000 | chainId`; the account address is the same everywhere), and `text(node, "url")`.
- Response signature, ENS offchain-resolver scheme: `keccak256(abi.encodePacked(hex"1900", resolver, uint64 expires, keccak256(request), keccak256(result)))`, signed by the gateway key that the resolver trusts.

### 5.4 Shared TS package (`packages/shared`)

Intent builder, chain config (chain IDs, RPCs, USDC, ENSIP-11 coin types), deployed addresses per chain, and ABIs generated from `contracts/out`. CLI, relayer, pay page, gateway and extension import from here; nobody hardcodes an address elsewhere.

## 6. Repo layout and stack

```
contracts/        Foundry (WS1): verifier, account, factory, key oracle, ENS resolver/registrar (WS2), deploy scripts
cre/              Chainlink CRE TypeScript project (WS2), workflow "github-keys"
gateway/          CCIP-read gateway, Bun + TS (WS2)
relayer/          relayer service, Bun + TS (WS1)
cli/              `ak` CLI, Bun + TS (WS3): wraps ssh-keygen and git
web/              pay page, Vite + React + viem (WS3)
extension/        MV3 browser extension (extra, WS3)
packages/shared/  intent builder, ABIs, addresses, chain config
.github/          CI (forge test, typecheck, tests), PR template, CODEOWNERS
```

- **Bun workspaces** for every TS package (the CRE TS SDK needs Bun anyway). viem for chain access.
- **Foundry:** pin solc exactly (section 8.6); `evm_version = "osaka"`; optimizer on, 200 runs; `ffi = false`.
- `.gitattributes`: signed fixtures (`*.txt`, `*.sig`, `*.msg` under test data) are `-text`, or Windows' `core.autocrlf` rewrites line endings and breaks every signature.

## 7. Chains, tokens and external addresses

**Our deployment (same address on every chain; `contracts/deployments/core.json`, mirrored in `@sereno/shared`):**

| Contract | Address | Chains |
|---|---|---|
| AccountFactory | `0x33915d5B5e104aA6A1F8683362ec0C49FFE5D74b` | Base Sepolia, Arbitrum Sepolia, Sepolia |
| KeyOracle (owner `0x11c0…0588`) | `0x6b7303f5F5fc8A9220910eB3097e38603B777D6E` | Base Sepolia, Arbitrum Sepolia, Sepolia |
| SshSigVerifier | `0xc4830Cb511c6a1B1a011489aEa0834e4EA76c411` | Base Sepolia, Arbitrum Sepolia, Sepolia |
| Ed25519Verifier | `0xb02e08fC377DF33E66640B738eAE1BB13505E9fB` | Base Sepolia, Arbitrum Sepolia (not Sepolia) |
| OffchainResolver for `sereno.eth` (wildcard; gateway signer `0xb693…4a41`) | `0xd7695337e225d34f4583862923c6b979fcf319c4` | Sepolia (ENS) |
| UserRegistry (subregistry of `sereno.eth`) | `0x4BE80595522f0E143b2D34392EA031e29e3652ba` | Sepolia (ENS) |
| NameRegistrar | `0x81636f503d9517d3f47e1abc87f05d4b23f447c5` | Sepolia (ENS) |

**ENS parent name: `sereno.eth`** (registered 6 Nov on Sepolia ENSv2, owned by the deployer; `packages/ops/src/ens-register.ts`, then `PARENT_NAME=sereno.eth bun src/ens-setup.ts`). The earlier temporary setup under `authorizedkeys.eth` is in `contracts/deployments/ens.authorizedkeys.json`. Sepolia deploys: `sh script/deploy-sepolia.sh` (node gas estimates, explicit fees, no Ed25519).

Redeploy (idempotent): `DEPLOYER_KEY=$(cat .secrets/deployer.key) forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast`, then `bun run sync`. The deployer and relayer key live in git-ignored `.secrets/`.

| | Ethereum Sepolia (11155111) | Base Sepolia (84532) | Arbitrum Sepolia (421614) |
|---|---|---|---|
| Role | ENS only (ENSv2 lives here) | **primary demo chain** | second chain, same addresses |
| Public RPC | `https://ethereum-sepolia-rpc.publicnode.com` | `https://sepolia.base.org` | `https://sepolia-rollup.arbitrum.io/rpc` |
| Circle USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| CRE simulation forwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` | `0x82300bd7c3958625581cc2f77bc6464dcecdf3e5` | `0xd41263567ddfead91504199b8c6c87371e83ca5d` |
| CRE chain name | `ethereum-testnet-sepolia` | `ethereum-testnet-sepolia-base-1` | `ethereum-testnet-sepolia-arbitrum-1` |
| ENSIP-11 coin type | 60 | `0x80000000\|84532` = 2147568180 | `0x80000000\|421614` = 2147905262 |

- **Same addresses on every chain:** deploy through the Arachnid deterministic deployer `0x4e59b44847b379578588920ca78fbf26c0b4956c` (present on all three) with fixed salts, for example `keccak256("sereno/v1/<ContractName>")`, and identical constructor arguments, with no chain-specific values in constructors. Then every account address is the same everywhere, and one ENS answer works for every chain.
- **P-256 precompile at `0x100`** (EIP-7951 / RIP-7212) exists on all three chains.
- **Sepolia L1 makes contract creation and new storage expensive** (it runs the next fork). Deploy the product on Base Sepolia; use Sepolia only for ENS.
  - Creation costs about 5–7× more than on Base (SshSigVerifier 10.5M gas, AccountFactory 9.1M). **The 13 KB Ed25519 contract exceeds the ~16.7M per-transaction gas cap there**, so it isn't deployed on Sepolia (`SKIP_ED25519=true`). On Sepolia the verifier handles P-256, phone (sk-ecdsa) and RSA-sha256 signatures, but not ed25519 or SHA-512. Name claims must be signed with P-256 or phone keys; payments on Base and Arbitrum accept every key type.
  - **Price Sepolia gas explicitly.** Forge's default about 1 gwei priority fee overpays roughly 40,000× (the base fee is about 26 wei) and burned 0.0186 ETH on two failed transactions. Use `--with-gas-price 2000 --priority-gas-price 100`, and get real limits from the node (`cast estimate`); Forge's local estimates are far too low on Sepolia.
- **Funds:** Circle USDC from faucet.circle.com (20 per request, per chain); L2 gas ETH from faucets or the canonical bridges from Sepolia.

**ENSv2 on Sepolia** (from docs.ens.domains/learn/deployments; ABIs and source from `ensdomains/contracts-v2` at tag **`v2-mainnet-deployment-1`**. The repo's `main` branch has *different* addresses and ABIs; don't use it):

| Contract | Address |
|---|---|
| ETHRegistry (.eth names) | `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4` |
| RootRegistry | `0xb458d6a3a77919449d03e7a6903c26827c1ec43f` |
| ETHRegistrar | `0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3` |
| Universal Resolver (managed proxy) | `0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1` (the canonical `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe`, viem's default, points to it) |
| VerifiableFactory | `0xda70306c98e97ece36f997a21368e53298572991` |
| UserRegistryImpl | `0x9bd8a88719068d09ecee662f36c0e3856708366a` |
| PermissionedResolverImpl | `0x115eb53f0c60696633855f90b138178fb40b2b2c` |
| v1 registry (legacy clients) | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`; its `eth` resolver is an ENSv2 bridge (`0x1cF3989ED3E5EC3cB1d731fC3777323813b61aCf`) that supports wildcards |

## 8. Technical facts and gotchas

### 8.1 SSH signatures on-chain (SSHSIG, OpenSSH `PROTOCOL.sshsig`)

- **Blob:** `"SSHSIG" ‖ uint32 version ‖ string publickey ‖ string namespace ‖ string reserved ‖ string hash_algorithm ‖ string signature`.
- **Signed data:** `"SSHSIG" ‖ string(namespace) ‖ string(reserved) ‖ string(hash_algorithm) ‖ string(H(message))`.
- The verifier parses the blob, checks the namespace, rebuilds the signed data, and dispatches on key type:

| Key type | How to verify | Reference gas (verify, sha256 message hash) |
|---|---|---|
| `ecdsa-sha2-nistp256` | P-256 precompile `0x100` | ~47k |
| `sk-ecdsa-sha2-nistp256@openssh.com` (security key, phone) | P-256 over `SHA256(application) ‖ flags ‖ counter ‖ SHA256(signed data)` (OpenSSH `PROTOCOL.u2f`); WebAuthn variant adds authData and a `clientDataJSON` challenge check | ~50k |
| `ssh-ed25519`, `sk-ssh-ed25519@openssh.com` | No precompile: Solidity Ed25519 (for example chengwenxi/Ed25519, Apache-2.0, Solidity 0.6, compiled separately and called through an interface) | ~0.92–1.18M |
| `ssh-rsa` | modexp precompile `0x05` plus PKCS#1 v1.5. SSHSIG always signs RSA with `rsa-sha2-512` | ~219k (3072-bit) |

- **Always sign with `-O hashalg=sha256`.** The default SHA-512 runs in Solidity at about 210k gas per 128-byte block (about +225k for an intent, +640k for a commit object).
- **Reference cost per payment on Base Sepolia:** P-256 ~189k gas, RSA ~287k, ed25519 ~1.05M; on Base mainnet that's roughly $0.002 / $0.004 / $0.015. On L1 it would cost dollars, so the product belongs on L2s.
- Sizes fit the 24 KB limit (the Ed25519 library is the largest, about 13 KB).
- Avoid "stack too deep": split helpers (for example the WebAuthn hash and the PKCS#1 check into their own functions).

### 8.2 Commit-as-payment

- git's SSH commit signature is a normal SSHSIG with namespace `git`. The signed bytes are the commit object **minus the `gpgsig` header**: the `gpgsig ` line and its continuation lines that start with a space. Get the raw object with `git cat-file commit <rev>`.
- git signs with **SHA-512 by default**. Fix: set `gpg.ssh.program` to a wrapper that adds `-O hashalg=sha256` only when git calls `ssh-keygen -Y sign`. It works on Linux and on Git for Windows:
  ```sh
  #!/bin/sh
  [ "$2" = sign ] && exec ssh-keygen -O hashalg=sha256 "$@"
  exec ssh-keygen "$@"
  ```
- Setup: `git config gpg.format ssh`, `user.signingkey <key or .pub when the key is in ssh-agent>`, `gpg.ssh.program <wrapper>`, then `git commit -S --allow-empty -F intent.txt`. Check: `git cat-file commit HEAD | sed '1,/^$/d'` must equal the intent byte for byte.
- **GitHub "Verified"** works for SHA-256 signed commits when the key is added on GitHub as a **Signing Key** and the commit email is the user's noreply or verified address (`<id>+<user>@users.noreply.github.com`).
- **Relaying from GitHub:** `GET /repos/{owner}/{repo}/commits/{sha}` returns `commit.verification.payload` (exactly the signed bytes) and `.signature` (armored SSHSIG). Split the payload at the first `\n\n`: headers plus `\n`, then the message.
- Reference gas: P-256 commit payment ~254k (~221k with a warm nonce slot); ed25519 ~1.11M.
- Risks for Q&A: a malicious repo's commit hooks could rewrite the message before signing, so cap commit-signed spends and keep the delay. The nonce stops a commit pushed to many forks from paying twice. Commits made in GitHub's web editor are signed by GitHub's key, so they are rejected automatically.

### 8.3 GitHub

- `GET https://api.github.com/user/{id}/keys` (authentication keys) and `/user/{id}/ssh_signing_keys` work **by numeric ID** and return `[{ key: "ssh-ed25519 AAAA…" , … }]`. `/users/{name}` gives the numeric `id`.
- Unauthenticated limit: 60 requests/hour; with a token, 5000/hour (`x-ratelimit-limit` shows which you got). Send a `User-Agent` header.
- `api.github.com` sometimes times out from some networks: retry, and cache username-to-ID lookups in the gateway.
- GitHub deletes SSH keys unused for a year; some users have zero keys; re-adding a removed key resets its first-seen time (the delay applies again).
- `ssh-agent`-only keys sign fine with `-f key.pub`.

### 8.4 Chainlink CRE

- CLI: `cre login`; `cre init -t hello-world-ts --deployment-registry private --non-interactive` (without that flag it still prompts). The TS workflow needs **Bun**.
- Pattern: `runtime.runInNodeMode(fetchFn, consensusIdenticalAggregation())(args)` → `runtime.report({ encodedPayload, encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })` → `new EVMClient(selector).writeReport(runtime, { receiver, report, gasConfig: { gasLimit } })`.
- **Secrets:** `secrets.yaml` maps an id to an environment variable (`secretsNames: { GITHUB_TOKEN: [GITHUB_TOKEN_ALL] }`). The target's `secrets-path` in `workflow.yaml` points to it. Read it with `runtime.getSecret({ id }).result().value` **in DON mode** and pass it into the node-mode function as an argument (`NodeRuntime` has no `getSecret`). For simulation, pass the value through the environment only.
- Simulate: `cre workflow simulate github-keys --target <target> --non-interactive --trigger-index 0 [--broadcast]`. Each target in `project.yaml` lists its chain's RPC.
- `github-keys` triggers: **0 = cron** (every ID in `githubIds`), **1 = HTTP** (one user on demand: `--trigger-index 1 --http-payload '{"githubId":"172588240"}'`). Deployed, the HTTP trigger only accepts callers listed in `httpAuthorizedKeys`.
- **gasLimit about 2M on Sepolia** (L2s are fine with 1.5M). A forwarder transaction can report "success" while the receiver ran out of gas, so always read the oracle's state afterwards.
- Simulation is enough for the CRE prize; production deployment needs `cre account access`.

### 8.5 ENSv2

- **Registering `sereno.eth` on Sepolia:** `ETHRegistrar` `makeCommitment` → `commit` → wait `MIN_COMMITMENT_AGE` (60 s) → approve Circle Sepolia USDC (~8 USDC/year) → `register(label, owner, secret, subregistry, resolver, duration, paymentToken, referrer)`. The owner gets `ROLE_SET_SUBREGISTRY` and `ROLE_SET_RESOLVER` (plus their admin roles) on the name.
- **Wildcard:** our resolver implements ENSIP-10 `resolve(bytes name, bytes data)` and reverts with EIP-3668 `OffchainLookup` pointing to the gateway URL (`https://<host>/{sender}/{data}.json`). Make the URL owner-settable.
- **Clients use ENS's hosted batch gateway** (`https://ccip-v3.ens.xyz`), so the gateway must be **public HTTPS**. Cloudflare quick tunnels die after 1–2.5 hours; use a named tunnel or a real host.
- **Hybrid claim model (works):** give `sereno.eth` a subregistry, a `UserRegistry` proxy from `VerifiableFactory.deployProxy(UserRegistryImpl, salt, abi.encodeCall(initialize, ([Grant(account, roleBitmap)])))`, then `ETHRegistry.setSubregistry(tokenId, userRegistry)`. Names **not** registered in it still resolve through the parent's wildcard resolver. A claimed name gets:
  - its own `PermissionedResolver` proxy: `initialize(Grant[] grants, bytes[] calls)`. **Role checks are skipped during initialize**, so the records are set in the same transaction. Records are keyed by namehash with a **default record at name `0x00`**, so one resolver per account only needs the default record: `setAddress(bytes dnsName, uint256 coinType, bytes addressBytes)` for coin types 60, Base and Arbitrum;
  - `UserRegistry.register(label, owner = account, registry = 0, resolver = its resolver, roleBitmap, expiry)`.
- **Role bits:**
  - registry: `REGISTRAR 1<<0`, `SET_PARENT 1<<8`, `UNREGISTER 1<<12`, `RENEW 1<<16`, `SET_SUBREGISTRY 1<<20`, `SET_RESOLVER 1<<24`; admin = role `<<128`; `CAN_TRANSFER_ADMIN (1<<28)<<128`;
  - resolver: `ADDRESS 1<<0`, `TEXT 1<<4`, `CONTENTHASH 1<<8`, `ABI 1<<12`, `INTERFACE 1<<16`, `NAME 1<<20`, `DATA 1<<24`, `LINK 1<<28`, `UPGRADE 1<<124`; admin = `<<128`.
- `getTokenId(uint256(labelhash))` gives the current token ID of a label.
- **Stock wallets don't resolve testnet ENS names like ours** (Phantom and MetaMask resolve on mainnet only, and Phantom can't do CCIP-read subnames). That's why the pay page (C0) resolves names itself with the right coin type; viem's `getEnsAddress` with `coinType` does this.
- Registering a claimed name with a permissionless registrar contract (anyone submits an SSH signature from a listed key → the registrar registers `<user>` to `factory.addressOf(id)`) needs a trusted username-to-ID source; the CRE oracle can provide it.

### 8.6 Toolchain and environment

- **Pin solc exactly.** Account addresses are CREATE2 over bytecode, and the bytecode embeds the compiler version through the metadata hash. A teammate's newer Foundry picking a newer solc changes every address and breaks signed test fixtures. We pin with **exact pragmas** (`pragma solidity 0.8.37;` in our code, `0.6.12` in the Ed25519 wrapper), and `bytecode_hash = "none"` + `cbor_metadata = false` so comment-only edits don't change bytecode. (Path-based `compilation_restrictions` are fragile: on Windows `src/*.sol` also matched subfolders.)
- **Phone as an SSH security key works on Windows only**, through **Win32-OpenSSH 10.x**.
  - The built-in 9.5 fails with "Key enrollment failed: invalid format" (issue #2279).
  - `ssh-keygen -t ecdsa-sk` → "iPhone, iPad, or Android device" → QR code → fingerprint. Signatures carry flags `0x1d` (user present **and verified**).
  - Needs Bluetooth and Location on, with the phone next to the laptop. A failed proximity check shows the misleading "incorrect passphrase supplied". Android may show "something went wrong" even though the signature is fine.
  - Each signature needs a new QR scan.
  - Linux and macOS OpenSSH use libfido2, which has no phone transport: use a normal key or a USB security key there.
- Windows VS Code terminals keep the PATH from when VS Code started. Add tools (`cre`, `cloudflared`) through `terminal.integrated.env.windows`.
- Public RPCs are load-balanced: after deploying, poll for code before concluding it failed; receipts can time out, so check the hash before resending.

## 9. Prize checklists

**ENS, Best Use of ENSv2 ($7k).**
- "Project must be built on ENSv2 on Ethereum mainnet or Sepolia."
- "ENSv2 features should be central to the product, not a cosmetic add-on."
- The demo must be "functional and not just include hard-coded values".
- A live demo link and open-source code.
- We use wildcard subnames off the parent's resolver, a subregistry, per-subname Permissioned Resolvers owned by the user's account, and Enhanced Access Control roles. Bonus: agents as namespaces (E1).

**Chainlink, Best workflow with CRE ($1.5k).**
- A workflow that connects a chain to an external API (GitHub); simulation is enough; it must be meaningfully used. Ours: key-set consensus, an on-chain write and revocation (plus the merged-PR check if D1 ships).
- Show the CLI simulation in the video.

**EF, Best CROPS App ($3.5k; one EF prize per project).** CROPS = censorship resistant, open source, private, secure. "One CROPS property is the reason it exists"; the other three hold or their trade-offs are stated.
- **Lead property: S (secure).** Keys never leave `ssh-agent`, the phone or a security key; users sign readable text, never blind calldata; it reuses the most-audited signing stack developers already run.
- A public repo under MIT, with a README explaining how to run it.
- A README section titled **CROPS** with one or two lines per letter:
  - **C:** what we control that users depend on (relayer, gateway, CRE workflow) and what happens if it goes away (self-submit; anyone can run the open-source gateway). Trade-off: GitHub can remove keys.
  - **O:** the license; build and run from the repo alone.
  - **P:** what each third party learns (gateway: name lookups; GitHub and RPC: requests).
  - **S:** key protection and the trust assumptions (GitHub plus the oracle).
- A demo video of 3 minutes or less that shows the lead property and "the moment it matters".
- No third-party trackers or analytics in the client or the extension.

**Finalist:** the 4-minute demo (section 4), Q&A (below), and the AI-usage section.

**Q&A answers:**

| Question | Answer |
|---|---|
| Who sends money on Monday? | Bounties, prizes and grants with no "send me your address" step; tipping commit authors; agents paying package authors with phone approval |
| How is this different from GitPaid, RepoRewards, PayPR, Cukka, the Handshake and Fluence airdrops? | Those need signup, a backend's word or an OAuth login, or were one-time airdrops with custom tools that read your private key. Ours: no signup, stock OpenSSH, hardware keys work, a standing wallet anyone can pay any time |
| GitHub account takeover? | 72 h new-key delay, phone or hardware keys for large spends, key seniority (F1), caps on commit-signed spends |
| Do we trust the oracle? | Multiple CRE nodes must agree; only key hashes go on-chain; zkTLS is the roadmap alternative |
| Relayer censors or cheats? | Anyone can relay or self-submit; the signed text fixes recipient and fee |
| Malicious repo hooks rewrite the commit message? | Caps on commit-signed spends, the delay, and the nonce stops double spends across forks |
| Quantum? | Key-age commitments (F1) as the roadmap |
| Unclaimed money? | Escrow refunds the sender after the deadline (A10) |

## 10. Secrets

Never commit private keys, `.env` files, the deployer key, the gateway signing key, the relayer key or GitHub tokens. Each machine keeps its own in git-ignored files; share them privately when needed. Check `git status` before every commit.
