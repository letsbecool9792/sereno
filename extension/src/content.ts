// Content script on github.com (EXTENSION_DESIGN.md §7): a sereno button for every core feature on the page where
// it belongs. Buttons never sign: paying opens the extension's Send screen (or the pay page for another wallet).
// Privacy: with "Badges on GitHub pages" off (the default), nothing is looked up while you browse; status appears
// when you click "Check". Each bar sits under the page title; if GitHub's layout changes, it floats instead.
import { CHAINS, ENS, ENS_DEPLOYMENT, HOSTED_PAY_URL } from "@sereno/shared";
import { account, bounties, client, keyStatus, paymentStatus, useWorkerTransport, type Bounty } from "./chain";
import { closingRefs, fingerprintOf, type Page, pageOf, parsePayment, patchAuthor, usdc } from "./github";
import { bar, busy, button, chip, ensureStyles, openPayPage, skeleton } from "./ui";

useWorkerTransport();
const parent = ENS_DEPLOYMENT?.parentName ?? "sereno.eth";
const payLink = (login: string, amount?: string) => `${HOSTED_PAY_URL}/?user=${encodeURIComponent(login)}${amount ? `&amount=${amount}` : ""}#pay`;
const bountyLink = (repo: string, issue: number) => `${HOSTED_PAY_URL}/?issue=${encodeURIComponent(`${repo}/issues/${issue}`)}#bounties`;
const chainName = (key: Bounty["key"]) => CHAINS[key].chain.name.replace(" Sepolia", "");

const send = async <T>(msg: object): Promise<T> => {
  const r = (await chrome.runtime.sendMessage(msg)) as { result?: T; error?: string };
  if (r?.error !== undefined) throw new Error(r.error);
  return r?.result as T;
};
const openExt = (route: string) => send({ type: "open", route });
const loginOf = (id: bigint) => send<string | null>({ type: "login", id: id.toString() }).catch(() => null);
const viewer = () => document.querySelector<HTMLMetaElement>('meta[name="user-login"]')?.content || null;

/// Shows status right away when badges are on; otherwise behind a "Check" button (no lookups until clicked).
function lazy(b: HTMLElement, badges: boolean, label: string, fill: (into: HTMLElement) => Promise<void>) {
  const slot = document.createElement("span");
  slot.style.display = "contents";
  b.append(slot);
  const run = async () => {
    const s = skeleton();
    slot.replaceChildren(s);
    await fill(slot).catch(() => {});
    s.remove();
  };
  if (badges) void run();
  else slot.append(button(label, () => run(), { mark: false, title: "Looks this up on-chain" }));
}

// ---- the pages ----

async function profile(b: HTMLElement, login: string, badges: boolean) {
  const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`)?.content ?? "";
  if (meta("route-controller") && meta("route-controller") !== "profiles") return false; // organisations have no SSH keys
  if (meta("profile:username").toLowerCase() !== login.toLowerCase()) return false;
  const fromTag = /^user:(\d+)$/.exec(meta("hovercard-subject-tag"))?.[1];
  const fromStats = meta("octolytics-dimension-user_login").toLowerCase() === login.toLowerCase() ? meta("octolytics-dimension-user_id") : "";
  const fromAvatar = /avatars\.githubusercontent\.com\/u\/(\d+)/.exec(meta("og:image"))?.[1];
  const id = fromTag || fromStats || fromAvatar;
  if (!id || !/^\d+$/.test(id)) return false;
  const name = `${login.toLowerCase()}.${parent}`;
  const own = viewer()?.toLowerCase() === login.toLowerCase();

  if (own) {
    b.append(
      button("sereno account", () => openExt("home"), { primary: true, title: "Your balance, history and payments" }),
      button("Sync my keys", (btn) =>
        busy(btn, "Queued…", async () => {
          await send({ type: "syncLogin", login });
          btn.replaceWith(chip("Sync queued: keys reach the chain in about a minute", { tone: "ok" }));
        }),
      ),
      button(`Claim ${name}`, () => openExt("settings"), { mark: false, title: "Make it a real ENSv2 name owned by your account" }),
    );
  } else {
    b.append(
      button(`Pay @${login}`, () => openExt(`send?to=${encodeURIComponent(login)}`), { primary: true, title: `Send USDC to ${name}` }),
      button("Other wallet", () => openPayPage(payLink(login)), { mark: false, title: "Pay from MetaMask or any wallet on the pay page" }),
    );
  }
  lazy(b, badges, "Check balance", async (slot) => {
    const [acct, resolver] = await Promise.all([
      account(BigInt(id)),
      client("sepolia").getEnsResolver({ name, universalResolverAddress: ENS.universalResolver }).catch(() => null),
    ]);
    const total = acct.balances.reduce((s, x) => s + x.units, 0n);
    const claimed = !!resolver && !!ENS_DEPLOYMENT && resolver.toLowerCase() !== ENS_DEPLOYMENT.resolver.toLowerCase();
    slot.append(
      chip(name + (claimed ? " · claimed" : ""), { href: payLink(login), tone: claimed ? "ok" : undefined, title: claimed ? "A real ENSv2 name owned by the account" : "Resolves through sereno's wildcard resolver" }),
      chip(`${usdc(total)} USDC`, {
        tone: total > 0n ? "gold" : undefined,
        href: `${CHAINS["base-sepolia"].explorer}/address/${acct.address}`,
        title: `${acct.address}: ${acct.balances.map((x) => `${usdc(x.units)} on ${CHAINS[x.key].chain.name}`).join(", ")}`,
      }),
    );
  });
  return true;
}

async function issue(b: HTMLElement, repo: string, n: number, badges: boolean) {
  b.append(button("Fund a bounty", () => openPayPage(bountyLink(repo, n)), { primary: true, title: "Paid automatically to whoever's merged PR closes this issue" }));
  lazy(b, badges, "Check bounty", async (slot) => {
    const found = await bounties(repo, n);
    const settled = found.find((x) => x.winner > 0n);
    if (settled) {
      const who = await loginOf(settled.winner);
      slot.append(chip(`Bounty won by ${who ? `@${who}` : `GitHub #${settled.winner}`}`, { tone: "ok", href: bountyLink(repo, n), title: `Settled on ${CHAINS[settled.key].chain.name}` }));
    }
    for (const x of found.filter((y) => y.pot > 0n)) {
      slot.append(chip(`${usdc(x.pot)} USDC · ${chainName(x.key)}`, { tone: "gold", href: bountyLink(repo, n), title: x.winner ? "Settled; waiting to be paid out" : "Paid to the author of the merged PR that closes this issue" }));
      if (x.winner > 0n)
        slot.append(
          button("Pay out", (btn) =>
            busy(btn, "Paying…", async () => {
              const r = await send<{ paid?: string; state?: string; detail?: string }>({ type: "bountyPayout", chainId: CHAINS[x.key].chain.id, repo, issue: n });
              btn.replaceWith(r.paid ? chip("Paid out", { tone: "ok", href: r.paid }) : chip(r.detail ?? r.state ?? "Requested", { tone: "ok" }));
            }),
          { title: "Anyone may trigger the payout; the relayer pays the gas" }),
        );
    }
    if (found.some((x) => x.pot > 0n && x.winner === 0n)) slot.append(button("Refund", () => openPayPage(bountyLink(repo, n)), { mark: false, title: "Funders can take their part back after their deadline" }));
    if (!found.length) slot.append(chip("No bounty yet"));
  });
  return true;
}

function authorOfPull(): string | null {
  const a = document.querySelector<HTMLAnchorElement>(".gh-header-meta a.author, #partial-discussion-header a.author, main a.author");
  return a?.textContent?.trim() || null;
}

async function pull(b: HTMLElement, repo: string, badges: boolean) {
  const author = authorOfPull();
  if (!author) return false;
  b.append(button(`Tip @${author}`, () => openExt(`send?to=${encodeURIComponent(author)}`), { primary: true, title: `Send USDC to ${author.toLowerCase()}.${parent}` }));
  const linked = new Set<number>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>("#partial-discussion-sidebar a[href*='/issues/'], [data-testid='sidebar'] a[href*='/issues/']")) {
    const p = pageOf(new URL(a.href, location.origin).pathname);
    if (p?.kind === "issue" && p.repo === repo) linked.add(p.issue);
  }
  for (const n of closingRefs(document.querySelector(".comment-body")?.textContent ?? "", repo)) linked.add(n);
  if (linked.size)
    lazy(b, badges, "Check bounties", async (slot) => {
      let any = false;
      for (const n of [...linked].slice(0, 5)) {
        for (const x of (await bounties(repo, n)).filter((y) => y.winner === 0n && y.pot > 0n)) {
          any = true;
          slot.append(chip(`Merging pays #${n}'s ${usdc(x.pot)} USDC bounty to @${author}`, { tone: "gold", href: bountyLink(repo, n), title: `On ${CHAINS[x.key].chain.name}, automatically after the merge` }));
        }
      }
      if (!any) slot.append(chip("No open bounty on the linked issues"));
    });
  return true;
}

async function commit(b: HTMLElement, repo: string, sha: string, badges: boolean) {
  // Same-origin read of the commit as a patch: the author's noreply address names them, the message is the intent.
  const patch = await fetch(`/${repo}/commit/${sha}.patch`, { credentials: "same-origin" }).then((r) => (r.ok ? r.text() : ""), () => "");
  const author = patchAuthor(patch) ?? document.querySelector<HTMLAnchorElement>("main a[data-hovercard-type='user']")?.textContent?.trim() ?? null;
  if (author) b.append(button(`Tip @${author}`, () => openExt(`send?to=${encodeURIComponent(author)}`), { primary: true, title: `Send USDC to ${author.toLowerCase()}.${parent}` }));
  const p = parsePayment(patch) ?? parsePayment(document.querySelector("main")?.textContent ?? "");
  if (!p) return !!author;
  const c = Object.values(CHAINS).find((x) => x.chain.id === p.chainId);
  b.append(chip(`Payment commit · ${usdc(p.amount)} USDC${c ? ` · ${c.chain.name}` : ""}`, { tone: "gold", title: `To ${p.to}, signed by GitHub #${p.githubId}'s SSH key; relayer fee ${usdc(p.fee)}` }));
  const relayBtn = () =>
    button("Relay this payment", (btn) =>
      busy(btn, "Relaying…", async () => {
        try {
          const r = await send<{ url: string }>({ type: "relayCommit", repo, sha });
          btn.replaceWith(chip("Paid", { tone: "ok", href: r.url }));
        } catch (e) {
          btn.after(chip((e as Error).message.slice(0, 90), { tone: "bad" }));
          throw e;
        }
      }),
    { title: "Anyone may relay it; the contract checks the commit's SSH signature" });
  lazy(b, badges, "Check payment", async (slot) => {
    if (!c) return;
    const s = await paymentStatus(p);
    if (s.state === "paid") slot.append(chip("Paid", { tone: "ok", href: s.tx ? `${c.explorer}/tx/${s.tx}` : `${c.explorer}/address/${p.account}`, title: "The account executed this payment" }));
    else if (s.state === "other") slot.append(chip("Invalid: its nonce was used by another payment", { tone: "bad" }));
    else slot.append(chip("Unpaid"), relayBtn());
  });
  return true;
}

async function repoPage(b: HTMLElement, repo: string) {
  if (!document.querySelector('meta[name="octolytics-dimension-repository_nwo"], meta[name="go-import"], [data-testid="repos-file-tree-container"], #repository-container-header'))
    return false;
  const me = viewer() ?? "<you>";
  const cmd = `npx sereno-ak commit-pay 1 <github-user> --as ${me} --push`;
  b.append(
    button("Pay by commit", async (btn) => {
      await navigator.clipboard.writeText(cmd);
      btn.lastChild!.textContent = "Copied: run it in this repo";
      setTimeout(() => (btn.lastChild!.textContent = "Pay by commit"), 2500);
    }, { title: cmd }),
  );
  void repo;
  return true;
}

async function keysPage(b: HTMLElement, badges: boolean) {
  const me = viewer();
  if (!me) return false;
  b.append(
    button("Sync to sereno", (btn) =>
      busy(btn, "Queued…", async () => {
        await send({ type: "syncLogin", login: me });
        btn.replaceWith(chip("Sync queued", { tone: "ok" }));
      }),
    { primary: true, title: "Have the Chainlink oracle copy these keys on-chain (Base, Arbitrum, Sepolia)" }),
  );
  lazy(b, badges, "Check keys on-chain", async (slot) => {
    const p = await send<{ id: string; keys: string[] }>({ type: "lookup", login: me });
    let tagged = 0;
    for (const line of p.keys) {
      const fp = await fingerprintOf(line);
      const el = [...document.querySelectorAll<HTMLElement>("code, .fingerprint, span, div")].find((e) => e.childElementCount === 0 && e.textContent?.trim() === fp);
      const status = await keyStatus(BigInt(p.id), await send<`0x${string}`>({ type: "keyHash", line }));
      const base = status.find((s) => s.key === "base-sepolia")?.firstSeen ?? 0n;
      const coolUntil = base ? Number(base + 72n * 3600n) * 1000 : 0;
      const tag = !base
        ? chip("not synced", { tone: "bad" })
        : Date.now() < coolUntil
          ? chip(`cooling down until ${new Date(coolUntil).toLocaleString()}`, { tone: "gold", title: "Up to 50 USDC per payment until then" })
          : chip(`on-chain since ${new Date(Number(base) * 1000).toLocaleDateString()}`, { tone: "ok" });
      tag.classList.add("sereno-keytag");
      if (el) {
        el.after(tag);
        tagged++;
      }
    }
    slot.append(chip(`${p.keys.length} key${p.keys.length === 1 ? "" : "s"} on GitHub${tagged < p.keys.length ? `, ${tagged} tagged below` : ""}`));
  });
  return true;
}

// ---- placement: under the title block, out of flex rows and Primer's grid header ----

const ANCHORS: Record<Page["kind"], string[]> = {
  profile: [".vcard-names-container", "h1.vcard-names", "main h1"],
  issue: ["[data-testid='issue-header']", ".gh-header-show", "[data-testid='issue-title']", "main h1"],
  pull: [".gh-header-show", "#partial-discussion-header", "main h1"],
  commit: [".commit.full-commit", "[data-testid='commit-header']", ".commit-title", "main h1"],
  repo: ["#repository-container-header", "main h1"],
  keys: ["main h2", ".Subhead", "main h1"],
};
function anchor(kind: Page["kind"]): Element | null {
  for (const sel of ANCHORS[kind]) {
    const el = [...document.querySelectorAll(sel)].find((e) => (e as HTMLElement).offsetParent !== null);
    if (el) return outOfRow(el);
  }
  return null;
}
function outOfRow(el: Element): Element {
  let e = el.closest('[class*="PageHeader-PageHeader"]') ?? el;
  for (let p = e.parentElement; p && p !== document.body && p.tagName !== "MAIN"; p = p.parentElement) {
    const cs = getComputedStyle(p);
    const row = (cs.display.includes("flex") && !cs.flexDirection.startsWith("column")) || cs.display.includes("grid");
    if (!row && !/^H[1-6]$/.test(p.tagName)) break;
    e = p;
  }
  return e;
}

const bars = new Map<string, HTMLDivElement>();
let badges = false;

function render() {
  const key = location.pathname;
  for (const el of document.querySelectorAll<HTMLElement>(".sereno-bar")) if (el.dataset.for !== key) el.remove();
  const page = pageOf(key);
  if (!page) return;
  let b = bars.get(key);
  if (!b) {
    const fresh = bar();
    fresh.dataset.for = key;
    const fill =
      page.kind === "profile"
        ? profile(fresh, page.login, badges)
        : page.kind === "issue"
          ? issue(fresh, page.repo, page.issue, badges)
          : page.kind === "pull"
            ? pull(fresh, page.repo, badges)
            : page.kind === "commit"
              ? commit(fresh, page.repo, page.sha, badges)
              : page.kind === "repo"
                ? repoPage(fresh, page.repo)
                : keysPage(fresh, badges);
    void fill.then(
      (ok) => {
        if (ok) return;
        bars.delete(key);
        fresh.remove();
      },
      () => {
        bars.delete(key);
        fresh.remove();
      },
    );
    bars.set(key, fresh);
    b = fresh;
  }
  const at = anchor(page.kind);
  if (at) {
    b.classList.remove("sereno-float");
    // Already right under the anchor (other sereno bars between are fine): don't move, or two bars would keep
    // swapping places and the page would flash.
    let prev = b.isConnected ? b.previousElementSibling : null;
    while (prev?.classList.contains("sereno-bar")) prev = prev.previousElementSibling;
    if (prev !== at) at.after(b);
  } else if (!b.isConnected) {
    b.classList.add("sereno-float");
    document.body.append(b);
  }
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    ensureStyles();
    render();
  }, 250);
}

// One copy per page: an older install of this extension (another ID) steps aside for this one.
const owner = document.documentElement.dataset.serenoExt;
if (owner && owner !== chrome.runtime.id) throw new Error("another sereno extension is already on this page");
document.documentElement.dataset.serenoExt = chrome.runtime.id;

void send<boolean>({ type: "badges" })
  .catch(() => false)
  .then((on) => {
    badges = on;
    schedule();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("turbo:load", schedule);
    window.addEventListener("popstate", schedule);
  });
