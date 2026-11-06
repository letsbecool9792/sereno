// Builds the npm package `sereno-ak` in cli/dist/npm: one Node-runnable ak.js (viem and @sereno/shared bundled in),
// the SHA-256 signing wrapper for commit-pay, a README and the license. Then:
//
//   bun cli/scripts/pack.ts            # build
//   cd cli/dist/npm && npm publish     # publish (needs `npm login`); bump VERSION below first for a new release
//
// Users run it with `npx sereno-ak <command>` (Node 20+), or `npm i -g sereno-ak` and then `ak <command>`.
import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = "0.1.1";
const cli = join(import.meta.dir, "..");
const out = join(cli, "dist/npm");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "dist"), { recursive: true });
mkdirSync(join(out, "bin"), { recursive: true });

const built = await Bun.build({ entrypoints: [join(cli, "src/main.ts")], target: "node", format: "esm", minify: false });
if (!built.success) throw new AggregateError(built.logs, "bundle failed");
// Swap the source's bun shebang for node's. dist/ak.js sits one level down so ../bin/sha256-sign.sh resolves the same
// as from src/main.ts.
const code = (await built.outputs[0]!.text()).replace(/^#!.*\n/, "");
writeFileSync(join(out, "dist/ak.js"), `#!/usr/bin/env node\n${code}`);
chmodSync(join(out, "dist/ak.js"), 0o755);
copyFileSync(join(cli, "bin/sha256-sign.sh"), join(out, "bin/sha256-sign.sh"));
chmodSync(join(out, "bin/sha256-sign.sh"), 0o755);
copyFileSync(join(cli, "../LICENSE"), join(out, "LICENSE"));

writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name: "sereno-ak",
      version: VERSION,
      description: "Pay any developer by GitHub username; spend with the SSH key already on your GitHub profile (ssh-keygen or git commit -S).",
      type: "module",
      bin: { ak: "dist/ak.js", "sereno-ak": "dist/ak.js" },
      files: ["dist", "bin", "README.md", "LICENSE"],
      engines: { node: ">=20" },
      license: "MIT",
      repository: { type: "git", url: "git+https://github.com/letsbecool9792/sereno.git", directory: "cli" },
      homepage: "https://github.com/letsbecool9792/sereno",
      keywords: ["ssh", "github", "ethereum", "usdc", "ens", "wallet"],
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(
  join(out, "README.md"),
  `# sereno-ak

Spend from your [Sereno](https://github.com/letsbecool9792/sereno) account with the SSH key already on your GitHub profile.
Every GitHub user has an account anyone can pay by username; you sign a readable payment text with your own
\`ssh-keygen\` or \`git commit -S\`. No seed phrase, no signup. Testnet only (Base Sepolia, Arbitrum Sepolia).

\`\`\`sh
npx sereno-ak account <github-user>
npx sereno-ak send 5 alice --as <you> --key ~/.ssh/id_ed25519
npx sereno-ak commit-pay 5 alice --as <you> --key ~/.ssh/id_ed25519 --push   # in any GitHub repo: the push is the payment
npx sereno-ak claim --as <you> --key ~/.ssh/id_ecdsa                         # your <you>.sereno.eth name (P-256 or security key)
\`\`\`

Needs Node 20+, OpenSSH's \`ssh-keygen\` and git. The key never leaves your machine: \`ak\` only runs \`ssh-keygen -Y sign\`
and sends the signature to a relayer, which can't change the recipient, amount or fee. MIT licensed.
`,
);

console.log(`built ${out} (sereno-ak@${VERSION})`);
