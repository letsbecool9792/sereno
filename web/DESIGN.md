---
name: sereno
description: Pay any GitHub developer by username. Night ground, an electric-blue card in a frosted lime wallet, Geist type, soft chunky buttons, and feedback that appears where you clicked.
version: 2 (7 Nov 2026, replaces the amber "night watchman" language)
colors:
  ground: "#070a17"
  surface: "#0f1428"
  surface-2: "#151b34"
  surface-3: "#1d2442"
  line: "rgb(214 224 255 / 0.08)"
  line-strong: "rgb(214 224 255 / 0.16)"
  ink: "#f2f4fa"
  muted: "#a3abc4"
  faint: "#6b7392"
  accent: "#2b59ff"        # tone A: actions
  accent-hover: "#3d68ff"
  accent-edge: "#2147d4"
  accent-ink: "#eef2ff"
  accent-text: "#8aa4ff"   # tone A as text on dark (accent itself is 3.7:1, too low for text)
  accent-soft: "rgb(43 89 255 / 0.16)"
  lime: "#c6f432"          # tone B: identity
  lime-text: "#d4f76a"
  lime-soft: "rgb(198 244 50 / 0.12)"
  lime-line: "rgb(198 244 50 / 0.28)"
  glass: "#e0f98e"         # the logo's frosted pocket
  ok: "#5fe0a3"
  err: "#ff8b80"
typography:
  ui: "Geist Variable, 400/500/600/700, 16px body, line-height 1.55"
  display: "Geist Variable 600-700, tracking -0.03em to -0.05em"
  mono: "Geist Mono Variable, for keys, addresses, IDs, signed text and commands"
  github-injections: "Inter, then GitHub's own system stack"
rounded: "10 fields, 14 buttons, 16 blocks, 22-24 cards, pill for the search and chips"
---

# Design system: sereno v2

Source of truth for the web app (`web/`) and the extension (`extension/`). Both copy the tokens below; if a value changes, change it here first.

## Picks this is built from (7 Nov)

| Area | Pick |
|---|---|
| Logo | The glass wallet (from a Pinterest reference) with the GitHub mark as the glyph |
| Color | **D1 Electric × Lime**, dark, buttons with softer contrast |
| Type | **T2** Geist + Geist Mono (Inter for buttons we inject into github.com) |
| Buttons | **B2** chunky press, toned down |
| Inputs | **I1** the `github.com/` prefix pill |
| Feedback | **FB1** under the button you pressed, **FB3** the panel becomes the status |
| Motion | **M1** WebGL dither field, **M5** check draws itself, **M6** decode |

Research behind these: 23 ETHGlobal finalist sites (the "Sereno Design Kit" artifact). Most finalists look like developer tools (black, mono, one blue or green); warm, friendly and readable is the gap.

## The logo

A solid **electric-blue card** tilted about 10° behind a **frosted lime wallet** with a thumb notch at the top. The card glows through the glass. A near-black GitHub mark sits in the pocket.

- **Geometry** (viewBox `10 14 100 100`):
  - Card: `rect x=34 y=27 w=58 h=40 rx=9`, `rotate(10 63 47)`, fill `accent`.
  - Pocket: the notched rounded rect in `web/src/Mark.tsx`, fill `glass`.
  - The card is drawn twice: once behind the pocket, once inside it, clipped to the pocket and blurred (`feGaussianBlur` 7, opacity 0.95). That's the glass.
  - Edge: a 1.2px white stroke, 75% opacity at the top fading to 15% at the bottom.
  - Glyph: GitHub mark at `translate(45 61) scale(1.25)`, fill `#0a1030`.
- **Glyph color:** near-black, never white. White disappears on the pale lime, and GitHub only permits white, black or grey marks anyway.
- **Sizes:**
  - Nav: 30px.
  - Boot: 112px.
  - Favicon: SVG, plus a 32px PNG.
  - Extension icons: 16/32/48/128 PNG, exported to `extension/icons/` from `web/public/mark.svg`.
- **Wordmark:** "sereno" in Geist 700, tracking -0.04em, always lowercase.
- **Risk, owned by the team:** GitHub's brand policy says not to use any GitHub logo "as the icon or logo for your … project" and forbids co-branded logos. The team chose it anyway on 7 Nov. Two consequences:
  - The README states that Sereno is not affiliated with or endorsed by GitHub.
  - If the Chrome Web Store or judges object, swap the glyph for the commit graph or the keyhole. It's one path in `Mark.tsx` and one in `extension/src/ui.ts`.

## Color

Two tones on a night ground.

- **Tone A, electric blue, is for doing things:**
  - the primary button;
  - the search ring and focus rings;
  - the active nav item, stepper progress and amounts being sent;
  - the logo's card.
  - Use `accent-text` (#8aa4ff) when blue is text.
- **Tone B, lime, is for who and what:**
  - ENS names, `@login`, "claimed" tags and avatar rings;
  - eyebrows, the terminal prompt and the secondary button;
  - the logo's glass.
  - Lime is never a big filled block, except the logo.
- **Neutrals** are cool (blue-tinted), from `ground` up to `surface-3`. Lines are cool white at 8% and 16%.
- **Status:** green `ok` means sent or verified, coral `err` means refused. Never use A or B for status.
- **Contrast:**
  - Body text and muted text on `surface` pass AA.
  - The primary button's text (`accent-ink` on `accent`) is 4.7:1. That's the "softer contrast" ask: not pure white on a saturated block.
- **Retired:** amber, brass, the warm grain tint and gradient text.

## Type

- **Geist** for everything: 16px body, labels 0.875rem 500, headings 600-700 with negative tracking (hero -0.05em, page titles -0.04em).
- **Geist Mono** for keys, addresses, IDs, the signed intent, commands and small uppercase eyebrows (0.72rem, +0.14em).
- Self-hosted through fontsource: `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`. No third-party font requests.
- **On github.com only:** Inter, then GitHub's own font stack.

## Buttons (B2, toned down)

Hierarchy, so you always know what's what:

| Level | Look | Use |
|---|---|---|
| **Primary** (one per view) | Solid `accent`, `accent-ink` text, radius 14, a 3px bottom edge in `accent-edge`. Hover lifts 1px (4px edge); press sinks 3px (no edge) | Pay, Find, Prepare payment, Send payment, Fund bounty, Claim |
| **Secondary** (`.secondary`) | `lime-soft` fill, `lime-text` text, 1px `lime-line` border, a faint 3px lime edge | The useful second action: Copy link, Download intent.txt, New payment, Refund |
| **Quiet** (`.ghost`) | Transparent, `ink` text, `line-strong` border, no edge | Copy, Back, Cancel, Details |
| **Disabled** | Flat `surface-3`, faint text, no edge, no motion | |

- Inside the search pill, the button is a pill (radius 999) so it nests.
- Min height 44px (34px for `.small`).
- Edges and lifts are subtle on purpose. No glow halos.

## Inputs (I1)

- The search is one pill: a `github.com/` prefix, the input and the button.
- Focus draws a 4px `accent-soft` ring and an `accent` border.
- Fields elsewhere: radius 10, `surface` fill, `line-strong` border, the same focus ring.

## Feedback (FB1 + FB3 + M5)

- **FB1:** progress and errors render **right after the button that started them**, in `<Feedback>` (`web/src/ui.tsx`).
  - It's always mounted and `aria-live`, scrolls itself into view, and shows `WalletHint` when a wallet step is slow (`wallet` prop).
  - Errors say what went wrong and how to fix it.
- **FB3:** a finished payment, funding or claim **replaces its panel** with `<Done>`:
  - a check that draws itself (M5);
  - "Sent 5 USDC";
  - the recipient and network;
  - a receipt link;
  - one next action.
- Small confirmations (copied, synced) change the button's own label for about 1.5s. No toasts.
- Editing a prepared payment resets the signing step, so nobody signs stale text.

## Motion (GSAP 3.15)

- **M1 dither field (landing hero):**
  - A WebGL fragment shader: value-noise fbm drifting slowly, quantized to 3 tones (`ground`, `accent`, `lime`) with a 4×4 Bayer dither in 3px cells.
  - Paused when off screen, a single still frame under reduced motion, a CSS gradient if WebGL fails.
  - A scrim keeps the headline readable.
- **M5:** the Done check strokes in about 0.6s.
- **M6:** names, addresses and the boot call decode from SSH-key characters (ScrambleText).
- **Boot (first landing visit, about 2.4s):**
  - The pocket rises, the card drops in behind it, and the glow blooms.
  - The wordmark rises letter by letter.
  - "¡sereno! all is calm" decodes.
  - The curtain lifts.
- One ease family (`expo.out`), 0.5 to 1.5s. Transform, opacity and clip-path only.
- Under `prefers-reduced-motion`: no boot, nothing moves, everything is visible.

## Components (web)

- **Nav:** the mark and wordmark; Pay, Spend and Bounties (active = `ink` text with an `accent` dot); a GitHub link.
- **Developer card (`HoloCard`):** the dark glass card. A 1.5px edge ring runs lime to blue, the avatar has a lime ring, the ENS name is in `lime-text`, plus the "Name matches account" chip (ok) and a "Received" stamp.
- **Paybox:** the amount (Geist 600, huge), quick chips, a summary list, then one primary button.
- **Stepper:** connect, approve, confirm, sent. Progress in `accent`.
- **Code and intent blocks:** `ground` fill, Geist Mono, `line` border, a Copy button (`.ghost .small`).

## The extension

- **Popup:** the same tokens, Geist and buttons as the web. The header uses the mark at 22px. Send keeps Review (the exact signed text) and then Sent (FB3 + M5). Errors go under the button that caused them.
- **Buttons injected into github.com** (`extension/src/ui.ts`): these must look at home in GitHub's light and dark themes and still read as ours.
  - Font: Inter, then `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `"Noto Sans"`, `Helvetica`, `Arial`, `sans-serif`. 12-13px, weight 500/600.
  - Size: 28px high, radius 6 (GitHub's own), the 14px mark only on the primary button.

  | Level | Look | Use |
  |---|---|---|
  | **Primary** | Solid `#2b59ff`, white text, `#2147d4` border, hover `#3d68ff` | Pay @user, Fund bounty |
  | **Secondary** | GitHub's default button: `var(--button-default-bgColor-rest, #f6f8fa)`, `var(--borderColor-default, #d0d7de)`, default text | Tip author, Copy pay link, Open in sereno |
  | **Info chip** | Outline pill in GitHub's muted text, with a 6px **lime** dot | 2 keys on-chain, account deployed |
  | **Status chip** | GitHub's own success and danger colors | Synced, Paid, Not synced |

  - **One primary per bar.** Never lime or blue for status.

## Do's and don'ts

- **Do** show who you're paying (avatar, username, real name, GitHub ID) before any wallet opens.
- **Do** keep one primary button per view, with feedback directly below it.
- **Do** use `accent-text`, not `accent`, for blue text.
- **Don't** put lime on large surfaces, or use lime or blue for status.
- **Don't** add glows, foil gradients or gradient text. The only gradients are the logo's glass, the card's 1.5px edge and the dither.
- **Don't** recolor the GitHub mark to anything but near-black, black or white.

## Rollout (7 Nov), owners

Mohikshit (+ Claude), branch `ws3/redesign`:
1. Tokens, Geist, buttons, inputs in `web/src/styles.css`.
2. `Mark.tsx`, plus favicon, apple-touch and `public/mark.svg`.
3. Nav, footer and HoloCard on the new mark.
4. Boot with the new mark.
5. M1 dither hero.
6. FB1/FB3 on Pay, Spend and Bounties (done for Spend and Bounties).
7. Extension icon PNGs exported to `extension/icons/`.
8. README disclaimer.

Suparno (+ Claude), branch `ws3/extension-redesign` from `ws3/redesign`, all in `extension/`:
1. Popup: tokens, fonts (swap fontsource), buttons, the mark in the header, onboarding and lock, FB1 under buttons, the M5 check on Sent.
2. GitHub injections in `ui.ts` and `content.ts`: Inter, the button and chip hierarchy above, the mark replacing the lantern SVG.
3. Manifest and store copy, and check every injected button on github.com in both light and dark themes.
4. After `ws3/redesign` merges:
   - polish `Bounties` and `LinkWallet` against this file;
   - refresh `DEMO.md` and README screenshots;
   - re-record anything in the demo video that shows the old look.
