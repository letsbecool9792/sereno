// Content script on github.com: adds Sereno to the pages where paying someone makes sense.
//  - profile: "Pay @user", their <user>.sereno.eth name and USDC balance (on your own profile: your balance, "Spend")
//  - issue:   the bounty on it, and "Fund a bounty" / "Add to bounty" (paid automatically when a merged PR closes it)
//  - PR:      "Tip @author", and which bounties merging it pays out
//  - commit:  "Tip @author"; a payment commit shows whether it's paid, with a "Submit payment" button if not
// Buttons open the pay page, prefilled, in a small window; the visitor's own wallet pays. Nothing here holds keys.
import { CHAINS, ENS_DEPLOYMENT, HOSTED_PAY_URL } from "@sereno/shared";
import { account, bounties, paymentStatus, type Bounty } from "./chain";
import { closingRefs, type Page, pageOf, parsePayment, patchAuthor, usdc } from "./github";
import { bar, button, chip, ensureStyles, openPayPage, skeleton } from "./ui";

const parent = ENS_DEPLOYMENT?.parentName ?? "sereno.eth";
const payLink = (login: string, amount?: string) => `${HOSTED_PAY_URL}/?user=${encodeURIComponent(login)}${amount ? `&amount=${amount}` : ""}#pay`;
const bountyLink = (repo: string, issue: number) => `${HOSTED_PAY_URL}/?issue=${encodeURIComponent(`${repo}/issues/${issue}`)}#bounties`;
const chainName = (key: Bounty["key"]) => CHAINS[key].chain.name.replace(" Sepolia", "");

const send = async <T>(msg: object): Promise<T> => {
  const r = (await chrome.runtime.sendMessage(msg)) as { result?: T; error?: string };
  if (r?.error !== undefined) throw new Error(r.error);
  return r?.result as T;
};
const loginOf = (id: bigint) => send<string | null>({ type: "login", id: id.toString() }).catch(() => null);

/// Where each page's bar goes: right after the first of these that is on screen; else a small floating bar.
const ANCHORS: Record<Page["kind"], string[]> = {
  profile: [".vcard-names-container", "h1.vcard-names", "main h1"],
  issue: ["[data-testid='issue-header']", ".gh-header-show", "[data-testid='issue-title']", "main h1"],
  pull: [".gh-header-show", "#partial-discussion-header", "main h1"],
  commit: [".commit.full-commit", "[data-testid='commit-header']", ".commit-title", "main h1"],
};
function anchor(kind: Page["kind"]): Element | null {
  for (const sel of ANCHORS[kind]) {
    const el = [...document.querySelectorAll(sel)].find((e) => (e as HTMLElement).offsetParent !== null);
    if (el) return outOfRow(el);
  }
  return null;
}

/// The anchor's outermost enclosing flex row or heading: our bar goes on its own line under the title block, not
/// squeezed between a title and its "#4" or next to a "Browse files" button.
function outOfRow(el: Element): Element {
  // Primer's PageHeader (PRs, commits) is a CSS grid of title, number and actions: go after the whole header.
  let e = el.closest('[class*="PageHeader-PageHeader"]') ?? el;
  for (let p = e.parentElement; p && p !== document.body && p.tagName !== "MAIN"; p = p.parentElement) {
    const cs = getComputedStyle(p);
    const row = (cs.display.includes("flex") && !cs.flexDirection.startsWith("column")) || cs.display.includes("grid");
    if (!row && !/^H[1-6]$/.test(p.tagName)) break;
    e = p;
  }
  return e;
}

// ---- one bar per page, filled asynchronously ----

async function profile(b: HTMLElement, login: string) {
  // The profile owner's numeric ID, from the page's metadata (user profiles only: organisations have no SSH keys).
  const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`)?.content ?? "";
  if (meta("route-controller") && meta("route-controller") !== "profiles") return false;
  if (meta("profile:username").toLowerCase() !== login.toLowerCase()) return false;
  const fromTag = /^user:(\d+)$/.exec(meta("hovercard-subject-tag"))?.[1];
  const fromStats = meta("octolytics-dimension-user_login").toLowerCase() === login.toLowerCase() ? meta("octolytics-dimension-user_id") : "";
  const fromAvatar = /avatars\.githubusercontent\.com\/u\/(\d+)/.exec(meta("og:image"))?.[1];
  const id = fromTag || fromStats || fromAvatar;
  if (!id || !/^\d+$/.test(id)) return false;
  const me = document.querySelector<HTMLMetaElement>('meta[name="user-login"]')?.content;
  const own = !!me && me.toLowerCase() === login.toLowerCase();
  const name = `${login.toLowerCase()}.${parent}`;
  const skel = skeleton();
  b.append(
    own
      ? button("Spend", () => openPayPage(`${HOSTED_PAY_URL}/#spend`), { primary: true, title: "Spend your Sereno balance with your SSH key" })
      : button(`Pay @${login}`, () => openPayPage(payLink(login)), { primary: true, title: `Send USDC to ${name}` }),
    chip(name, { href: payLink(login), title: "This GitHub account's Sereno name (ENS)" }),
    skel,
  );
  void account(BigInt(id))
    .then(({ address, balances }) => {
      const total = balances.reduce((s, x) => s + x.units, 0n);
      const detail = balances.map((x) => `${usdc(x.units)} on ${CHAINS[x.key].chain.name}`).join(", ");
      skel.replaceWith(chip(`${usdc(total)} USDC`, { tone: total > 0n ? "ok" : undefined, href: `${CHAINS["base-sepolia"].explorer}/address/${address}`, title: `${address}: ${detail}` }));
    })
    .catch(() => skel.remove());
  return true;
}

async function issue(b: HTMLElement, repo: string, n: number) {
  const skel = skeleton();
  b.append(skel);
  const found = await bounties(repo, n).catch(() => null);
  skel.remove();
  if (!found) {
    b.append(button("Fund a bounty", () => openPayPage(bountyLink(repo, n)), { primary: true }));
    return true;
  }
  const open = found.filter((x) => x.winner === 0n && x.pot > 0n);
  const settled = found.find((x) => x.winner > 0n);
  if (settled) {
    const who = await loginOf(settled.winner);
    b.append(chip(`Bounty paid to ${who ? `@${who}` : `GitHub #${settled.winner}`}`, { tone: "ok", href: bountyLink(repo, n), title: `Settled on ${CHAINS[settled.key].chain.name}` }));
  }
  for (const x of open) b.append(chip(`${usdc(x.pot)} USDC bounty · ${chainName(x.key)}`, { tone: "gold", href: bountyLink(repo, n), title: "Paid automatically to the author of the merged PR that closes this issue" }));
  if (!settled)
    b.append(button(open.length ? "Add to bounty" : "Fund a bounty", () => openPayPage(bountyLink(repo, n)), { primary: !open.length, title: "Paid automatically to the author of the merged PR that closes this issue" }));
  return true;
}

function authorOfPull(): string | null {
  const a = document.querySelector<HTMLAnchorElement>(".gh-header-meta a.author, #partial-discussion-header a.author, main a.author");
  return a?.textContent?.trim() || null;
}

async function pull(b: HTMLElement, repo: string) {
  const author = authorOfPull();
  if (!author) return false;
  b.append(button(`Tip @${author}`, () => openPayPage(payLink(author)), { title: `Send USDC to ${author.toLowerCase()}.${parent}` }));
  // Issues this PR closes: GitHub's "Development" sidebar links, plus "Fixes #N" in the description.
  const linked = new Set<number>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>("#partial-discussion-sidebar a[href*='/issues/'], [data-testid='sidebar'] a[href*='/issues/']")) {
    const p = pageOf(new URL(a.href, location.origin).pathname);
    if (p?.kind === "issue" && p.repo === repo) linked.add(p.issue);
  }
  const body = document.querySelector(".comment-body")?.textContent ?? "";
  for (const n of closingRefs(body, repo)) linked.add(n);
  for (const n of [...linked].slice(0, 5)) {
    const found = await bounties(repo, n).catch(() => []);
    for (const x of found.filter((y) => y.winner === 0n && y.pot > 0n))
      b.append(chip(`Merging pays #${n}'s ${usdc(x.pot)} USDC bounty to @${author}`, { tone: "gold", href: bountyLink(repo, n), title: `On ${CHAINS[x.key].chain.name}, automatically after the merge` }));
  }
  return true;
}

async function commit(b: HTMLElement, repo: string, sha: string) {
  const patch = await fetch(`/${repo}/commit/${sha}.patch`, { credentials: "same-origin" }).then((r) => (r.ok ? r.text() : ""), () => "");
  const author = patchAuthor(patch) ?? document.querySelector<HTMLAnchorElement>("main a[data-hovercard-type='user']")?.textContent?.trim() ?? null;
  if (author) b.append(button(`Tip @${author}`, () => openPayPage(payLink(author)), { title: `Send USDC to ${author.toLowerCase()}.${parent}` }));
  const p = parsePayment(patch) ?? parsePayment(document.querySelector("main")?.textContent ?? "");
  if (!p) return !!author;
  const c = Object.values(CHAINS).find((x) => x.chain.id === p.chainId);
  b.append(chip(`Sereno payment · ${usdc(p.amount)} USDC${c ? ` · ${c.chain.name}` : ""}`, { title: `To ${p.to}, signed by GitHub #${p.githubId}'s SSH key; relayer fee ${usdc(p.fee)}` }));
  const skel = skeleton();
  b.append(skel);
  const s = await paymentStatus(p).catch(() => null);
  skel.remove();
  if (!s || !c) return true;
  if (s.state === "paid") b.append(chip("Paid", { tone: "ok", href: s.tx ? `${c.explorer}/tx/${s.tx}` : `${c.explorer}/address/${p.account}`, title: "The account executed this payment" }));
  else if (s.state === "other") b.append(chip("Nonce already used by another payment", { tone: "bad" }));
  else
    b.append(
      button("Submit payment", async (btn) => {
        btn.disabled = true;
        btn.lastChild!.textContent = "Submitting…";
        try {
          const r = await send<{ url: string }>({ type: "relayCommit", repo, sha });
          btn.replaceWith(chip("Paid", { tone: "ok", href: r.url }));
        } catch (e) {
          btn.disabled = false;
          btn.lastChild!.textContent = "Submit payment";
          btn.title = (e as Error).message;
          btn.after(chip((e as Error).message.slice(0, 90), { tone: "bad" }));
        }
      }, { primary: true, title: "The relayer submits it; the contract checks the commit's SSH signature" }),
    );
  return true;
}

// ---- keep the bar on the page across GitHub's soft navigation and React re-renders ----

const bars = new Map<string, HTMLDivElement>();

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
      page.kind === "profile" ? profile(fresh, page.login) : page.kind === "issue" ? issue(fresh, page.repo, page.issue) : page.kind === "pull" ? pull(fresh, page.repo) : commit(fresh, page.repo, page.sha);
    // Not ready (the page hasn't rendered what we read yet): try again on the next change.
    void fill.then((ok) => {
      if (ok) return;
      bars.delete(key);
      fresh.remove();
    });
    bars.set(key, fresh);
    b = fresh;
  }
  const at = anchor(page.kind);
  if (at) {
    b.classList.remove("sereno-float");
    if (b.previousElementSibling !== at) at.after(b);
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

schedule();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("turbo:load", schedule);
window.addEventListener("popstate", schedule);
