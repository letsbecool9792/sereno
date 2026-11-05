import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildClaimText, buildIntent, parseIntent } from "./text";
import { parseCommitObject, fromGithubVerification } from "./commit";
import { unarmor, armor } from "./sshsig";

const intent = {
  chainId: 84532,
  account: "0xA22f7e55C2eF953D16607636c9ba48D60e78E402",
  githubId: 99113360n,
  nonce: 3n,
  amount: 1_500_000n,
  token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  to: "0xfa3B979b706fb90EE20458166a68995e389540dD",
  fee: 20_000n,
} as const;

describe("intent text", () => {
  test("matches the contract's format byte for byte", () => {
    expect(buildIntent(intent)).toBe(
      "tangerine v1\nchain: 84532\naccount: 0xa22f7e55c2ef953d16607636c9ba48d60e78e402\ngithub-id: 99113360\nnonce: 3\n" +
        "send: 1500000 of 0x036cbd53842c5426634e7929541ec2318f3dcf7e\nto: 0xfa3b979b706fb90ee20458166a68995e389540dd\nrelayer-fee: 20000\n",
    );
  });

  test("round-trips through parseIntent", () => {
    expect(parseIntent(buildIntent(intent))).toEqual({ ...intent });
  });

  test("rejects anything that is not exactly an intent", () => {
    expect(parseIntent(buildIntent(intent) + "extra\n")).toBeNull();
    expect(parseIntent("hello")).toBeNull();
  });

  test("claim text", () => {
    expect(
      buildClaimText({ chainId: 11155111, label: "dev", parentName: "tangerine.eth", githubId: 7n, account: intent.account }),
    ).toBe("tangerine v1\nchain: 11155111\nclaim-name: dev.tangerine.eth\ngithub-id: 7\naccount: 0xa22f7e55c2ef953d16607636c9ba48d60e78e402\n");
  });
});

describe("signatures and commits", () => {
  const fixtures = join(import.meta.dir, "../../../contracts/test/fixtures/local");

  test("unarmor matches ssh-keygen output", () => {
    const armored = readFileSync(join(fixtures, "ed25519.sig"), "utf8");
    const hex = readFileSync(join(fixtures, "ed25519.sig.hex"), "utf8").trim();
    expect(unarmor(armored)).toBe(`0x${hex}`);
    expect(unarmor(armor(`0x${hex}`))).toBe(`0x${hex}`);
  });

  test("parses a signed commit object", () => {
    const raw =
      "tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nparent 5d7a2983a72520e1ea16b1eaf683fafad3e7f5dd\n" +
      "author dev <d@x> 1 +0000\ncommitter dev <d@x> 1 +0000\n" +
      "gpgsig -----BEGIN SSH SIGNATURE-----\n U1NIU0lH\n -----END SSH SIGNATURE-----\n\n" +
      "tangerine v1\nhello\n";
    const c = parseCommitObject(raw);
    expect(c.headers).toBe(
      "tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nparent 5d7a2983a72520e1ea16b1eaf683fafad3e7f5dd\nauthor dev <d@x> 1 +0000\ncommitter dev <d@x> 1 +0000\n",
    );
    expect(c.message).toBe("tangerine v1\nhello\n");
    expect(c.signature).toBe("-----BEGIN SSH SIGNATURE-----\nU1NIU0lH\n-----END SSH SIGNATURE-----\n");
    const g = fromGithubVerification(`${c.headers}\n${c.message}`, c.signature);
    expect(g.headers).toBe(c.headers);
    expect(g.message).toBe(c.message);
  });
});
