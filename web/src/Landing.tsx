import { useEffect, useRef, useState } from "react";
import type { GithubUser } from "@sereno/shared";
import { HoloCard } from "./HoloCard";
import { fetchProfile } from "./lib";
import { gsap, revealOnScroll, spotlight, SplitText, useMotion } from "./motion";
import { CopyButton, Icon } from "./ui";
import { Dither } from "./Dither";

// Public GitHub profiles shown as examples while nobody has typed a username. No name check, so they claim nothing.
const SAMPLES: GithubUser[] = [
  { id: 583231n, login: "octocat", name: "The Octocat", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4" },
  { id: 1024025n, login: "torvalds", name: "Linus Torvalds", avatarUrl: "https://avatars.githubusercontent.com/u/1024025?v=4" },
  { id: 810438n, login: "gaearon", name: "dan", avatarUrl: "https://avatars.githubusercontent.com/u/810438?v=4" },
  { id: 170270n, login: "sindresorhus", name: "Sindre Sorhus", avatarUrl: "https://avatars.githubusercontent.com/u/170270?v=4" },
];

const COMMANDS = [
  { cmd: "account torvalds", what: "Look anyone up: their account, balance and which keys can spend.", out: ["torvalds.sereno.eth", "account on Base and Arbitrum, same address", "keys that can spend: the ones on github.com/torvalds.keys"] },
  { cmd: "send 5 alice --as you", what: "Pay from your account. It signs with your SSH key; a relayer submits it.", out: ["signing with ~/.ssh/id_ed25519", "the contract checks the signature on-chain", "paid 5 USDC to alice"] },
  { cmd: "commit-pay 5 alice --as you --push", what: "Make the payment a signed git commit. Pushing it is the payment.", out: ["git commit -S, message = the payment", "GitHub shows it Verified", "the relayer picks it up and pays"] },
  { cmd: "claim --as you", what: "Turn you.sereno.eth into a real ENS name your account owns.", out: ["signed with your key", "you.sereno.eth registered on ENSv2", "owned by your account, with its own resolver"] },
  { cmd: "sync you", what: "Have Chainlink copy your GitHub keys on-chain right now.", out: ["Chainlink nodes read github.com/you.keys", "they agree on the key set", "keys written on-chain; removed keys are revoked"] },
] as const;

export function Landing({ onPay, go, introDelay = 0 }: { onPay: (login: string) => void; go: (page: "pay" | "spend" | "bounties") => void; introDelay?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const [login, setLogin] = useState("");
  const [preview, setPreview] = useState<GithubUser | null>(null);
  const [lookup, setLookup] = useState<"idle" | "busy" | "none">("idle");
  const [sample, setSample] = useState(0);
  // The dither field fades in on its own, so it mounts as the boot curtain lifts rather than behind it.
  const [bgOn, setBgOn] = useState(introDelay === 0);
  const who = login.trim().replace(/^@/, "").replace(/\.sereno\.eth$/i, "");
  const card = preview ?? SAMPLES[sample]!;

  // Live preview: the card becomes whoever you type, after a short pause.
  useEffect(() => {
    if (!who) {
      setPreview(null);
      setLookup("idle");
      return;
    }
    let live = true;
    setLookup("busy");
    const t = setTimeout(() => {
      fetchProfile(who, true)
        .then(({ user }) => live && (setPreview(user), setLookup("idle")))
        .catch(() => live && (setPreview(null), setLookup("none")));
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [who]);

  useEffect(() => {
    if (bgOn) return;
    const t = setTimeout(() => setBgOn(true), Math.max(0, introDelay - 0.25) * 1000);
    return () => clearTimeout(t);
  }, []);

  // While nobody types, the card cycles through a few well-known developers.
  useEffect(() => {
    if (who) return;
    const t = setInterval(() => setSample((s) => (s + 1) % SAMPLES.length), 3200);
    return () => clearInterval(t);
  }, [who]);

  useMotion(root, () => {
    const d = introDelay;
    SplitText.create(".hero-title", {
      type: "lines,words",
      mask: "lines",
      autoSplit: true,
      onSplit: (self) => gsap.from(self.words, { yPercent: 115, duration: 1.2, stagger: 0.04, delay: d + 0.05 }),
    });
    gsap.from(".hero-scribble path", { drawSVG: "0%", duration: 1, ease: "power2.inOut", delay: d + 0.75 });
    gsap.from(".hero-reveal", { y: 18, autoAlpha: 0, duration: 1, stagger: 0.08, delay: d + 0.45 });
    gsap.from(".hero-card-wrap", { y: 70, rotateX: 18, autoAlpha: 0, duration: 1.5, delay: d + 0.55 });
    gsap.to(".scroll-cue-line", { scaleY: 0, transformOrigin: "50% 100%", duration: 1.4, ease: "power2.inOut", repeat: -1, delay: d + 1.4 });

    SplitText.create(".statement-text", {
      type: "words",
      autoSplit: true,
      onSplit: (self) =>
        gsap.fromTo(self.words, { opacity: 0.16 }, { opacity: 1, stagger: 0.05, ease: "none", scrollTrigger: { trigger: ".statement", start: "top 78%", end: "bottom 55%", scrub: true } }),
    });
    revealOnScroll(".how-step", { y: 28, stagger: 0.1 });
    revealOnScroll(".feature", { y: 36 });
    revealOnScroll(".cli-reveal", { y: 28 });
    revealOnScroll(".built-item", { y: 16, stagger: 0.06 });
    revealOnScroll(".final-reveal", { y: 24 });
    gsap.utils.toArray<HTMLElement>(".scramble-on-view").forEach((el) =>
      gsap.to(el, { scrambleText: { text: el.dataset.text ?? el.textContent ?? "", chars: "0123456789abcdef", speed: 0.4 }, duration: 1.2, scrollTrigger: { trigger: el, start: "top 85%", once: true } }),
    );
  });

  // The card swaps with a quick turn whenever its person changes.
  const cardRef = useRef<HTMLDivElement>(null);
  useMotion(cardRef, () => {
    gsap.fromTo(cardRef.current, { rotateY: -14, autoAlpha: 0.2, y: 8 }, { rotateY: 0, autoAlpha: 1, y: 0, duration: 0.9 });
  }, [card.login]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (who) onPay(who);
  };

  return (
    <div ref={root} className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-bg" aria-hidden="true">
          {bgOn && <Dither />}
          <div className="hero-scrim" />
        </div>

        <div className="hero-inner">
          <h1 id="hero-title" className="hero-title">
            We didn't build a wallet. GitHub <span className="hero-underline">already was one.<svg className="hero-scribble" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 9c40-6 92-7 146-4 50 3 96 3 148-3" /></svg></span>
          </h1>
          <p className="hero-sub hero-reveal">Pay any developer by their GitHub username. They spend it with the SSH key they already use for git.</p>
          <form className="hero-form search hero-reveal" onSubmit={submit}>
            <span className="at">github.com/</span>
            <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="any username" spellCheck={false} aria-label="GitHub username" autoComplete="off" />
            <button disabled={!who}>Pay {Icon.arrow(16)}</button>
          </form>
          <p className="hero-hint hero-reveal" aria-live="polite">
            {lookup === "busy" ? "Finding their card…" : lookup === "none" ? `No GitHub user "${who}"` : who && preview ? `This is @${preview.login}'s card. It already works.` : "Type a username to see their card."}
          </p>
          <div className="hero-card-wrap">
            <div ref={cardRef} className="hero-card">
              <HoloCard user={card} name={`${card.login.toLowerCase()}.sereno.eth`} />
            </div>
          </div>
        </div>
        <div className="scroll-cue" aria-hidden="true"><span>scroll</span><i className="scroll-cue-line" /></div>
      </section>

      <section className="statement" aria-label="The idea">
        <p className="statement-text">
          Every developer already holds a key. The SSH key on their GitHub signs commits and opens servers. sereno lets it move money too: anyone can pay a developer by username, and the developer spends by signing a short note.
        </p>
      </section>

      <section className="how" aria-labelledby="how-title">
        <div className="section-head">
          <h2 id="how-title" className="section-title">How it works</h2>
          <p>Three pieces you already trust, put together.</p>
        </div>
        <ol className="how-steps">
          <li className="how-step">
            <span className="how-icon">{Icon.user(22)}</span>
            <h3>An account for every username</h3>
            <p>The address comes from their GitHub ID, so it can receive money before they've ever heard of sereno.</p>
            <code className="how-code scramble-on-view" data-text="0xBdB2…34c0">0x0000…0000</code>
          </li>
          <li className="how-step">
            <span className="how-icon">{Icon.chain(22)}</span>
            <h3>Keys copied on-chain</h3>
            <p>Chainlink nodes read the SSH keys on their GitHub profile and must agree. Delete a key on GitHub and it stops working.</p>
            <code className="how-code">github.com/you.keys</code>
          </li>
          <li className="how-step">
            <span className="how-icon">{Icon.key(22)}</span>
            <h3>Spend by signing a note</h3>
            <p>A short, readable payment signed with ssh-keygen or a git commit. The contract checks the signature and pays.</p>
            <code className="how-code">ssh-keygen -Y sign</code>
          </li>
        </ol>
      </section>

      <section className="features" aria-labelledby="features-title">
        <div className="section-head">
          <h2 id="features-title" className="section-title">What you can do</h2>
          <p>Each one is a page, and each works on testnet today.</p>
        </div>
        <div className="feature-grid">
          <a className="feature feature-main" href="#pay" onPointerMove={spotlight} onClick={(e) => { e.preventDefault(); go("pay"); }}>
            <div className="feature-head">
              <span className="feature-icon">{Icon.user(20)}</span>
              <h3>Pay by name</h3>
            </div>
            <p>Type a username. You see their face and name before your wallet opens, then pay USDC from any wallet.</p>
            <div className="resolve" aria-hidden="true">
              <span className="pill">torvalds</span>
              <span className="resolve-line" />
              <span className="pill mono">torvalds.sereno.eth</span>
              <span className="resolve-line" />
              <span className="pill mono lime scramble-on-view" data-text="0xBdB2…34c0">0x0000…0000</span>
            </div>
            <span className="feature-go">Pay someone {Icon.arrow(16)}</span>
          </a>
          <a className="feature" href="#spend" onPointerMove={spotlight} onClick={(e) => { e.preventDefault(); go("spend"); }}>
            <div className="feature-head">
              <span className="feature-icon">{Icon.key(20)}</span>
              <h3>Spend with your SSH key</h3>
            </div>
            <p>Sign with ssh-keygen or a git commit. Nothing new to install or trust.</p>
            <code className="feature-code" aria-hidden="true">ssh-keygen -Y sign -n sereno@v1</code>
            <span className="feature-go">Spend your balance {Icon.arrow(16)}</span>
          </a>
          <a className="feature" href="#bounties" onPointerMove={spotlight} onClick={(e) => { e.preventDefault(); go("bounties"); }}>
            <div className="feature-head">
              <span className="feature-icon">{Icon.merge(20)}</span>
              <h3>Issue bounties</h3>
            </div>
            <p>Fund a GitHub issue. When a merged PR closes it, its author is paid.</p>
            <div className="bounty-mini" aria-hidden="true">
              <span className="pill mono">#12</span>
              <span className="resolve-line" />
              <span className="pill ok">merged</span>
              <span className="resolve-line" />
              <span className="pill ok">paid</span>
            </div>
            <span className="feature-go">Fund an issue {Icon.arrow(16)}</span>
          </a>
        </div>
      </section>

      <Cli />

      <section className="built" aria-labelledby="built-title">
        <h2 id="built-title" className="built-title">Built on</h2>
        <ul className="built-list">
          <li className="built-item"><strong>ENS</strong><span>names like you.sereno.eth</span></li>
          <li className="built-item"><strong>Chainlink CRE</strong><span>copies your keys on-chain</span></li>
          <li className="built-item"><strong>Base and Arbitrum</strong><span>one address on both</span></li>
          <li className="built-item"><strong>Circle USDC</strong><span>what gets paid</span></li>
          <li className="built-item"><strong>OpenSSH</strong><span>what signs</span></li>
        </ul>
      </section>

      <section className="final final-reveal" aria-labelledby="final-title">
        <h2 id="final-title">Someone you want to pay?</h2>
        <p>All you need is their GitHub username.</p>
        <form
          className="search final-form"
          onSubmit={(e) => {
            e.preventDefault();
            const v = (new FormData(e.currentTarget).get("u") as string).trim().replace(/^@/, "");
            if (v) onPay(v);
          }}
        >
          <span className="at">github.com/</span>
          <input name="u" placeholder="username" spellCheck={false} aria-label="GitHub username" autoComplete="off" />
          <button>Pay {Icon.arrow(16)}</button>
        </form>
      </section>
    </div>
  );
}

/// The npx sereno-ak section: pick a command, watch it type, read what it does.
function Cli() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const auto = useRef(true);
  const c = COMMANDS[active]!;
  const full = `npx sereno-ak ${c.cmd}`;

  useMotion(root, () => {
    const typing = Math.min(1.4, full.length * 0.032);
    gsap.fromTo(".term-cmd", { width: 0 }, { width: `${full.length}ch`, duration: typing, ease: `steps(${full.length})` });
    gsap.from(".term-out > *", { autoAlpha: 0, x: -6, duration: 0.5, stagger: 0.18, delay: typing + 0.15 });
    if (auto.current) gsap.delayedCall(typing + 3.4, () => setActive((a) => (a + 1) % COMMANDS.length));
  }, [active]);

  return (
    <section ref={root} className="cli" aria-labelledby="cli-title">
      <div className="cli-copy cli-reveal">
        <h2 id="cli-title" className="section-title"><span className="mono">npx sereno-ak</span></h2>
        <p className="cli-lead">The whole thing from your terminal. Nothing to install: npx runs it, and it finds the SSH key that's already on your GitHub.</p>
        <ul className="cli-list" aria-label="Commands">
          {COMMANDS.map((x, i) => (
            <li key={x.cmd}>
              <button
                type="button"
                aria-pressed={i === active}
                className={i === active ? "on" : ""}
                onClick={() => {
                  auto.current = false;
                  setActive(i);
                }}
              >
                <code>{x.cmd.split(" ")[0]}</code>
                <span>{x.what}</span>
              </button>
            </li>
          ))}
        </ul>
        <CopyButton text="npx sereno-ak" label="Copy npx sereno-ak" />
      </div>
      <div className="terminal cli-reveal" aria-label="Example terminal session">
        <div className="term-bar" aria-hidden="true"><i /><i /><i /><span>example session</span></div>
        <div className="term-body">
          <div className="term-line"><span className="term-prompt">$</span> <span className="term-cmd">{full}</span><span className="term-caret" aria-hidden="true" /></div>
          <div className="term-out">
            {c.out.map((line) => (
              <div key={line}><span className="term-ok">{Icon.check(13)}</span>{line}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
