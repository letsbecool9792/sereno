// GitHub Action entry point (.github/workflows/sereno-relay.yml): relays the payment commits in one push event, so any
// repo can be its own relayer with no server. Reads the event GitHub writes to GITHUB_EVENT_PATH.
//
//   RELAYER_KEY=0x... GITHUB_EVENT_PATH=event.json GITHUB_REPOSITORY=owner/repo [GITHUB_TOKEN=...] bun src/action.ts
import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { parseIntent } from "@sereno/shared";
import { commitFromGithub, makeRelayer } from "./relay";

const env = (n: string) => process.env[n] || (console.error(`::error::${n} is not set`), process.exit(1));
const key = env("RELAYER_KEY").trim();
const repo = env("GITHUB_REPOSITORY");
const event = JSON.parse(readFileSync(env("GITHUB_EVENT_PATH"), "utf8")) as { commits?: { id: string; message: string }[] };
const relayer = makeRelayer((key.startsWith("0x") ? key : `0x${key}`) as Hex);

// Oldest first: payments from one account must land in nonce order.
const payments = (event.commits ?? []).filter((c) => parseIntent(c.message.endsWith("\n") ? c.message : `${c.message}\n`));
console.log(`relayer ${relayer.address}: ${payments.length} payment commit(s) in this push to ${repo}`);

let failed = 0;
for (const c of payments) {
  try {
    const { commit, githubVerified } = await commitFromGithub(repo, c.id, process.env.GITHUB_TOKEN);
    const r = await relayer.commit(commit);
    console.log(`${c.id.slice(0, 7)} paid (GitHub verified: ${githubVerified}, gas ${r.gasUsed}): ${r.url}`);
  } catch (e) {
    failed++;
    // Another relayer may have paid it first; then the nonce has moved and this one reverts with BadSignature.
    console.log(`::error::${c.id.slice(0, 7)} not relayed: ${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
