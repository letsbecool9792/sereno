// Small DOM kit for what we add to GitHub: a bar of buttons and chips that borrows GitHub's own theme variables, so
// it reads as part of the page (light and dark) rather than as another wallet.

const LANTERN = `<svg width="14" height="14" viewBox="0 0 32 32" aria-hidden="true"><path d="M11 7a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="8" y="8" width="16" height="3.4" rx="1.7" fill="currentColor"/><rect x="9" y="11" width="14" height="15" rx="5" fill="#ff9ad8"/><ellipse cx="16" cy="19.5" rx="3.2" ry="4.2" fill="#fff6dc"/><circle cx="13.6" cy="17" r="1.1" fill="#0b0b12"/><circle cx="18.4" cy="17" r="1.1" fill="#0b0b12"/><rect x="10" y="26" width="12" height="2.6" rx="1.3" fill="currentColor"/></svg>`;

const CSS = `
.sereno-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0;font-size:12px;line-height:20px;clear:both;flex-basis:100%;grid-column:1/-1;width:100%;box-sizing:border-box}
.sereno-bar.sereno-float{position:fixed;right:16px;bottom:16px;z-index:99;margin:0;padding:8px 10px;max-width:min(560px,calc(100vw - 32px));background:var(--bgColor-default,#fff);border:1px solid var(--borderColor-default,#d0d7de);border-radius:12px;box-shadow:var(--shadow-floating-medium,0 8px 24px rgba(140,149,159,.3))}
.sereno-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:6px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;
  border:1px solid var(--button-default-borderColor-rest,var(--borderColor-default,#d0d7de));background:var(--button-default-bgColor-rest,#f6f8fa);color:var(--button-default-fgColor-rest,var(--fgColor-default,#1f2328))}
.sereno-btn:hover{background:var(--button-default-bgColor-hover,#eff2f5)}
.sereno-btn.sereno-primary{background:#0b0b12;border-color:#0b0b12;color:#f5f5fa}
.sereno-btn.sereno-primary:hover{background:#262636}
.sereno-btn[disabled]{opacity:.6;cursor:progress}
.sereno-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font-size:12px;white-space:nowrap;text-decoration:none!important;
  border:1px solid var(--borderColor-default,#d0d7de);color:var(--fgColor-muted,#59636e);background:transparent}
a.sereno-chip:hover{color:var(--fgColor-accent,#0969da)}
.sereno-chip.sereno-gold{border-color:#d4a72c;color:var(--fgColor-attention,#9a6700);background:var(--bgColor-attention-muted,#fff8c5)}
.sereno-chip.sereno-ok{border-color:var(--borderColor-success-emphasis,#1f883d);color:var(--fgColor-success,#1a7f37);background:var(--bgColor-success-muted,#dafbe1)}
.sereno-chip.sereno-bad{border-color:var(--borderColor-danger-emphasis,#cf222e);color:var(--fgColor-danger,#d1242f)}
.sereno-chip .sereno-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.7}
.sereno-skel{display:inline-block;width:110px;height:24px;border-radius:999px;background:linear-gradient(90deg,var(--bgColor-muted,#f6f8fa),var(--bgColor-neutral-muted,#eaeef2),var(--bgColor-muted,#f6f8fa));background-size:200% 100%;animation:sereno-shine 1.2s linear infinite}
@keyframes sereno-shine{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.sereno-skel{animation:none}}
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

export function button(label: string, onClick: (b: HTMLButtonElement) => void, opts: { primary?: boolean; title?: string } = {}): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `sereno-btn${opts.primary ? " sereno-primary" : ""}`;
  b.innerHTML = LANTERN;
  b.append(document.createTextNode(label));
  if (opts.title) b.title = opts.title;
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(b);
  });
  return b;
}

export function chip(text: string, opts: { tone?: "gold" | "ok" | "bad"; href?: string; title?: string } = {}): HTMLElement {
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

/// Opens the pay page (prefilled by a deep link) in a small window next to GitHub; the visitor's wallet does the rest.
export function openPayPage(url: string) {
  window.open(url, "sereno-pay", "popup,width=480,height=840");
}
