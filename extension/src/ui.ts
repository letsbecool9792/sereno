// What we add to GitHub pages, in sereno's look (web/DESIGN.md v2, "The extension"): one solid electric-blue primary
// per bar with the 14px mark, GitHub's own default button for the rest, muted outline chips with a lime dot for info
// and GitHub's success, attention and danger colors for status. Sized like GitHub's controls (28px, radius 6) so they
// sit beside them in light and dark themes.

const FONT = `Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif`;
const POCKET =
  "M32 44H46.5C49.6 44 50.9 46 52 48.3C53.8 52 56.6 54.5 60 54.5C63.4 54.5 66.2 52 68 48.3C69.1 46 70.4 44 73.5 44H88C96.3 44 102 49.7 102 58V90C102 98.3 96.3 104 88 104H32C23.7 104 18 98.3 18 90V58C18 49.7 23.7 44 32 44Z";
const GITHUB =
  "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z";
// The mark at 14px: no blur (it would be mush at this size), so the card's glow through the glass is a flat tint.
const MARK = `<svg width="14" height="14" viewBox="10 14 100 100" aria-hidden="true" style="flex:none"><rect x="34" y="27" width="58" height="40" rx="9" fill="#2b59ff" stroke="#eef2ff" stroke-opacity=".55" stroke-width="5" transform="rotate(10 63 47)"/><path d="${POCKET}" fill="#e0f98e"/><path transform="translate(45 61) scale(1.25)" fill="#0a1030" d="${GITHUB}"/></svg>`;

const CSS = `
.sereno-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0;font:500 12px/20px ${FONT};clear:both;flex-basis:100%;grid-column:1/-1;width:100%;box-sizing:border-box}
.sereno-bar.sereno-float{position:fixed;right:16px;bottom:16px;z-index:99;margin:0;padding:8px 10px;width:auto;max-width:min(560px,calc(100vw - 32px));background:var(--overlay-bgColor,#fff);border:1px solid var(--borderColor-default,#d0d7de);border-radius:12px;box-shadow:var(--shadow-floating-large,0 12px 32px -12px rgb(0 0 0 / .35))}
.sereno-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:6px;font:500 12px/1 ${FONT};cursor:pointer;white-space:nowrap;box-sizing:border-box;
  border:1px solid var(--button-default-borderColor-rest,var(--borderColor-default,#d0d7de));background:var(--button-default-bgColor-rest,#f6f8fa);color:var(--button-default-fgColor-rest,var(--fgColor-default,#1f2328));transition:background-color .15s,border-color .15s}
.sereno-btn:hover{background:var(--button-default-bgColor-hover,#eff2f5);border-color:var(--button-default-borderColor-hover,var(--borderColor-default,#d0d7de))}
.sereno-btn.sereno-primary{background:#2b59ff;border-color:#2147d4;color:#fff;font-weight:600}
.sereno-btn.sereno-primary:hover{background:#3d68ff;border-color:#2147d4}
.sereno-btn:focus-visible{outline:2px solid #2b59ff;outline-offset:2px}
.sereno-btn[disabled]{opacity:.6;cursor:progress}
.sereno-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;font:500 12px/1 ${FONT};white-space:nowrap;text-decoration:none!important;box-sizing:border-box;
  border:1px solid var(--borderColor-default,#d0d7de);color:var(--fgColor-muted,#59636e);background:transparent}
.sereno-chip .sereno-dot{width:6px;height:6px;flex:none;border-radius:50%;background:#c6f432;box-shadow:0 0 0 1px rgb(80 110 0 / .35)}
a.sereno-chip:hover{color:var(--fgColor-default,#1f2328);border-color:var(--fgColor-muted,#59636e)}
.sereno-chip.sereno-strong{color:var(--fgColor-default,#1f2328);font-weight:600}
.sereno-chip.sereno-ok{border-color:var(--borderColor-success-emphasis,#1a7f37);color:var(--fgColor-success,#1a7f37);background:var(--bgColor-success-muted,#dafbe1)}
.sereno-chip.sereno-warn{border-color:var(--borderColor-attention-emphasis,#9a6700);color:var(--fgColor-attention,#9a6700);background:var(--bgColor-attention-muted,#fff8c5)}
.sereno-chip.sereno-bad{border-color:var(--borderColor-danger-emphasis,#cf222e);color:var(--fgColor-danger,#d1242f);background:var(--bgColor-danger-muted,#ffebe9)}
.sereno-chip.sereno-ok .sereno-dot,.sereno-chip.sereno-warn .sereno-dot,.sereno-chip.sereno-bad .sereno-dot{background:currentColor;box-shadow:none}
.sereno-mono{font-family:"Geist Mono",ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-size:11.5px}
.sereno-skel{display:inline-block;width:110px;height:24px;border-radius:999px;background:linear-gradient(90deg,var(--bgColor-neutral-muted,rgb(175 184 193 / .2)),var(--bgColor-muted,rgb(175 184 193 / .35)),var(--bgColor-neutral-muted,rgb(175 184 193 / .2)));background-size:200% 100%;animation:sereno-shine 1.2s linear infinite}
@keyframes sereno-shine{to{background-position:-200% 0}}
.sereno-keytag{margin-left:8px}
@media (prefers-reduced-motion:reduce){.sereno-skel{animation:none}.sereno-btn{transition:none}}
`;

export function ensureStyles() {
  if (document.getElementById("sereno-style")) return;
  const s = document.createElement("style");
  s.id = "sereno-style";
  s.textContent = CSS;
  document.head.append(s);
}

export function bar(): HTMLDivElement {
  const d = document.createElement("div");
  d.className = "sereno-bar";
  return d;
}

export function button(label: string, onClick: (b: HTMLButtonElement) => unknown, opts: { primary?: boolean; title?: string; mark?: boolean } = {}): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `sereno-btn${opts.primary ? " sereno-primary" : ""}`;
  if (opts.mark ?? opts.primary) b.innerHTML = MARK; // the mark only on the primary
  b.append(document.createTextNode(label));
  if (opts.title) b.title = opts.title;
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void onClick(b);
  });
  return b;
}

/// Runs `work` with the button disabled and its label swapped; restores it after.
export async function busy<T>(b: HTMLButtonElement, label: string, work: () => Promise<T>): Promise<T> {
  const text = b.lastChild!;
  const was = text.textContent;
  b.disabled = true;
  text.textContent = label;
  try {
    return await work();
  } finally {
    b.disabled = false;
    text.textContent = was;
  }
}

export function chip(text: string, opts: { tone?: "strong" | "ok" | "warn" | "bad"; href?: string; title?: string } = {}): HTMLElement {
  const el = document.createElement(opts.href ? "a" : "span");
  el.className = `sereno-chip${opts.tone ? ` sereno-${opts.tone}` : ""}`;
  if (opts.href) Object.assign(el, { href: opts.href, target: "_blank", rel: "noopener noreferrer" });
  if (opts.title) el.title = opts.title;
  const dot = document.createElement("span");
  dot.className = "sereno-dot";
  el.append(dot, document.createTextNode(text));
  return el;
}

export function skeleton(): HTMLElement {
  const s = document.createElement("span");
  s.className = "sereno-skel";
  return s;
}

/// The pay page in a small window next to GitHub (paying from MetaMask or any other wallet).
export function openPayPage(url: string) {
  window.open(url, "sereno-pay", "popup,width=480,height=840");
}
