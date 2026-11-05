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
| WS1 contracts and relayer | Mohikshit | | | |
| WS2 CRE and ENS | Gantavya | | | |
| WS3 clients and demo | Suparno | | | |

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
