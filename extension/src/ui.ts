// What we add to GitHub pages, in sereno's look (web/DESIGN.md): an amber pill with the keyhole lantern for the one
// action, quiet outlined pills for the rest, brass-edged chips for status. Sized and spaced to sit beside GitHub's own
// controls in light and dark themes.

const LANTERN = `<svg width="15" height="15" viewBox="0 0 32 32" aria-hidden="true" style="flex:none;overflow:visible"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 6.2a2.6 2.6 0 0 1 5.2 0"/><path d="M10.5 9.2h11l-1.6-3h-7.8z"/><path d="M10 9.2h12v13.3a3.5 3.5 0 0 1-3.5 3.5h-5a3.5 3.5 0 0 1-3.5-3.5z"/><path d="M12.5 28.5h7"/></g><path fill="var(--sereno-flame,#f2b35b)" d="M16 12.8a2.4 2.4 0 0 1 1.2 4.48L17.8 21.5h-3.6l.6-4.22A2.4 2.4 0 0 1 16 12.8z"/></svg>`;

const CSS = `
.sereno-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0;font:500 12px/20px "DM Sans",-apple-system,"Segoe UI",sans-serif;clear:both;flex-basis:100%;grid-column:1/-1;width:100%;box-sizing:border-box}
.sereno-bar.sereno-float{position:fixed;right:16px;bottom:16px;z-index:99;margin:0;padding:8px 10px;width:auto;max-width:min(560px,calc(100vw - 32px));background:#0a0908;border:1px solid rgb(255 236 210 / .16);border-radius:16px;box-shadow:0 18px 40px -16px rgb(0 0 0 / .6)}
.sereno-btn{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 14px;border-radius:999px;font:600 12.5px/1 "DM Sans",-apple-system,"Segoe UI",sans-serif;cursor:pointer;white-space:nowrap;
  border:1px solid var(--borderColor-default,#d0d7de);background:transparent;color:var(--fgColor-default,#1f2328);transition:background-color .2s,translate .2s,box-shadow .2s}
.sereno-btn:hover{background:var(--bgColor-neutral-muted,rgb(175 184 193 / .2))}
.sereno-btn.sereno-primary{--sereno-flame:#1a1206;background:#f2b35b;border-color:#f2b35b;color:#1a1206;box-shadow:inset 0 1px 0 rgb(255 255 255 / .35)}
.sereno-btn.sereno-primary:hover{background:#f7c67f;translate:0 -1px;box-shadow:inset 0 1px 0 rgb(255 255 255 / .4),0 8px 22px -10px rgb(242 179 91 / .7)}
.sereno-btn[disabled]{opacity:.6;cursor:progress;translate:none}
.sereno-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;font-size:12px;white-space:nowrap;text-decoration:none!important;
  border:1px solid rgb(201 150 79 / .55);color:var(--fgColor-muted,#59636e);background:transparent}
a.sereno-chip:hover{color:var(--fgColor-default,#1f2328);border-color:#c9964f}
.sereno-chip.sereno-gold{border-color:#c9964f;color:#9a6a1f;background:rgb(242 179 91 / .14)}
[data-color-mode=dark] .sereno-chip.sereno-gold,[data-dark-theme] .sereno-chip.sereno-gold{color:#f2b35b}
@media (prefers-color-scheme:dark){.sereno-chip.sereno-gold{color:#f2b35b}}
.sereno-chip.sereno-ok{border-color:rgb(98 227 165 / .55);color:var(--fgColor-success,#1a7f37);background:rgb(98 227 165 / .12)}
.sereno-chip.sereno-bad{border-color:rgb(255 139 128 / .55);color:var(--fgColor-danger,#d1242f)}
.sereno-chip .sereno-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.75}
.sereno-mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px}
.sereno-skel{display:inline-block;width:110px;height:26px;border-radius:999px;background:linear-gradient(90deg,rgb(242 179 91 / .08),rgb(242 179 91 / .2),rgb(242 179 91 / .08));background-size:200% 100%;animation:sereno-shine 1.2s linear infinite}
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
  if (opts.mark !== false) b.innerHTML = LANTERN;
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

/// The pay page in a small window next to GitHub (paying from MetaMask or any other wallet).
export function openPayPage(url: string) {
  window.open(url, "sereno-pay", "popup,width=480,height=840");
}
