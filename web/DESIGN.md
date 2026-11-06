---
name: Sereno
description: Pay any GitHub developer by username; every developer is a holographic card on a violet night.
colors:
  night: "#0b0b12"
  graphite: "#15151d"
  graphite-raised: "#1c1c27"
  line: "#2a2a38"
  focus-line: "#4a4a62"
  moonlight: "#f5f5fa"
  primary: "#f5f5fa"
  on-primary: "#0b0b12"
  muted: "#a3a3b8"
  link: "#b8c9ff"
  ok: "#6ef0c2"
  ok-bg: "rgb(110 240 194 / 0.12)"
  err: "#ff8f8f"
  err-bg: "rgb(255 143 143 / 0.1)"
  foil-pink: "#ff9ad8"
  foil-lilac: "#c6a8ff"
  foil-periwinkle: "#9ab8ff"
  foil-mint: "#8ff5d6"
  foil-butter: "#fff3a8"
  foil-peach: "#ffb59a"
  lantern-flame: "#fff6dc"
typography:
  display:
    fontFamily: "Unbounded Variable, Unbounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  amount:
    fontFamily: "Unbounded Variable, Unbounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.8rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Unbounded Variable, Unbounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.7rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Unbounded Variable, Unbounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Onest Variable, Onest, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Onest Variable, Onest, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 600
  mono:
    fontFamily: "ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "0.85em"
    fontFeature: "tnum"
rounded:
  sm: "10px"
  md: "16px"
  card: "22px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "18px"
  xl: "22px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  button-primary-large:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "15px 20px"
    width: "100%"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.moonlight}"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  button-small:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip-quick:
    backgroundColor: "{colors.graphite-raised}"
    textColor: "{colors.moonlight}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  chip-quick-on:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  tab-on:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  tab-bar:
    backgroundColor: "{colors.graphite}"
    rounded: "{rounded.pill}"
    padding: "4px"
  search:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.moonlight}"
    rounded: "{rounded.pill}"
    padding: "6px 6px 6px 18px"
  input:
    backgroundColor: "{colors.graphite-raised}"
    textColor: "{colors.moonlight}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
  card:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.moonlight}"
    rounded: "{rounded.md}"
    padding: "22px"
  holo-card:
    textColor: "{colors.night}"
    rounded: "{rounded.card}"
    padding: "18px 20px 22px"
    width: "100%"
  paybox:
    backgroundColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "22px 18px 16px"
  facts:
    backgroundColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "14px 18px"
  cmd-block:
    backgroundColor: "{colors.night}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
  tag:
    backgroundColor: "{colors.graphite-raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  tag-ok:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  message-error:
    backgroundColor: "{colors.err-bg}"
    textColor: "{colors.err}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  message-ok:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
---

# Design System: Sereno

## Overview

**Creative North Star: "The Holo Card"**

Every GitHub developer is a collectible holographic card, and paying them is handing value to that card. The world around the card is a near-black violet night: graphite surfaces, hairline borders, moonlight-white text and white pill actions. Against that restraint the holographic foil is the only decorative saturated surface, so the developer's card is unmistakably the subject of every screen.

The density is a single calm column (640px), one task per view, with the card centred and tilting gently under the pointer like a trading card in the hand. The voice is friendly, colourful crypto-wallet craft meant to sit beside Phantom and MetaMask, built from three self-hosted faces: Unbounded for display, Onest for the interface, and the system monospace for anything the chain or a signature reads byte for byte.

The world rejects the category default of a white card with one blue button, and it rejects plain or generic looks and heavy real-world metaphors (cheques, envelopes, key boards). The lantern mascot, the night watchman's light, is the brand mark and the one illustration.

**Key Characteristics:**
- Dark-only single theme on a violet-black ground with a faint periwinkle glow at the top.
- Holographic foil (pink, lilac, periwinkle, mint, butter, peach) only on the identity card and the lantern.
- White pill = the primary action or the current selection; everything else is graphite or outlined.
- Mint means ok, coral means refused, and the card itself turns grey with a coral ring when it is refused.
- Monospace for addresses, IDs, balances and signed text.
- No third-party font, script or tracker requests; fonts ship from the bundle.

## Colors

A violet-black night of graphite tones, one white for action, a pastel holographic foil, and two semantic status colours.

### Primary
- **Moonlight White** (primary / moonlight): the fill of every primary pill, the active tab and the selected quick chip, and the main text colour. Its ink is Night (on-primary).

### Tertiary
- **Holographic Foil** (foil-pink, foil-lilac, foil-periwinkle, foil-mint, foil-butter, foil-peach): the six stops of the conic foil gradient on the holo card, overlaid with pointer-driven diagonal sheen lines. The full gradient lives in the sidecar.
- **Foil Pink** (foil-pink) also shows up as small foil-derived accents: the text caret, the text selection tint (35% alpha), the amount field's focus underline and the lantern's glass.
- **Lantern Flame** (lantern-flame): the lantern's flame on dark ground. On the foil card the lantern swaps to a Night frame, white glass and a butter flame.

### Secondary (semantic)
- **Verified Mint** (ok): the name-check badge when the name matches the account, the done-panel check disc, ok tags and ok messages (on ok-bg, a 12% wash).
- **Refusal Coral** (err): the mismatch and unresolved badges, the refused-card ring, and error messages (on err-bg, a 10% wash).
- **Periwinkle Link** (link): links and the global focus outline. A pale tint of the foil periwinkle, light enough to read on Night.

### Neutral
- **Night** (night): page ground, the ink on the foil card and on white pills, and the background of command blocks. The body adds a radial periwinkle glow (12% alpha) at the top centre. The theme colour is the same.
- **Graphite** (graphite): cards, the paybox, the facts block, the search pill and the tab bar.
- **Raised Graphite** (graphite-raised): form fields, unselected quick chips and neutral tags.
- **Hairline** (line): every 1px border, the dashed empty-state outline, the amount underline at rest and the scrollbar.
- **Focus Line** (focus-line): the border of a focused field or the search pill, paired with a 3px periwinkle ring.
- **Mist** (muted): secondary text, labels, the `github.com/` prefix, inactive tabs, the empty state and the fine print.

### Named Rules
**The One Foil Rule.** The holographic foil is the only decorative saturated surface. It belongs to the identity card and the lantern. Outside them, saturated colour is either a small foil-derived accent (caret, selection, focus underline, top glow), the periwinkle link, or semantic status. No other gradients, colour panels or accent buttons.

**The Mint and Coral Rule.** Mint means verified or ok and coral means refused. Neither is ever decoration, and neither is used for a neutral state.

**The Dark Night Rule.** There is one theme, dark (`color-scheme: dark`). Don't add a light mode or light surfaces.

## Typography

**Display Font:** Unbounded Variable (with Unbounded, ui-sans-serif, system-ui)
**Body Font:** Onest Variable (with Onest, ui-sans-serif, system-ui, -apple-system, Segoe UI)
**Label/Mono Font:** the system monospace stack (ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas), with tabular numerals

**Character:** Unbounded is wide, round and playful, a collectible-card wordmark voice. Onest is a clean, friendly grotesque that keeps the interface calm. Monospace marks exactly what the machine reads.

### Hierarchy
- **Display** (700, 2rem, line-height 1, -0.02em): the Sereno wordmark beside the lantern in the header.
- **Amount** (700, 2.8rem, 1.1, -0.03em): the editable USDC amount in the paybox, centred over a 2px underline.
- **Headline** (700, 1.7rem, 1.15, -0.02em; 1.4rem under 560px): the @login on the holo card. It also sets the done panel's "Sent" line at 1.15rem.
- **Title** (600, 1rem, -0.01em): section headings inside cards (h3) and numbered steps on Spend.
- **Body** (400, 16px, 1.55): all running text. Lead and tagline text is Mist, capped at 52ch.
- **Label** (600, 0.92rem): tabs and button text (buttons use 700 at 0.95rem). Form labels are Mist at 0.85rem. Fine print is 0.8rem.
- **Mono** (0.85em, tabular): addresses, GitHub ID ("No. …"), ENS names on the card, balances, key types, commands and the intent text (0.8 to 0.82rem in blocks).

### Named Rules
**The Machine Reads Mono Rule.** Anything that is copied, signed or checked byte for byte is set in monospace: addresses, IDs, ENS names, balances, commands and the signed intent. Never set them in Onest or Unbounded.

**The Self-Hosted Faces Rule.** Both faces are bundled through `@fontsource-variable` packages. Never load fonts from a CDN or a third-party font service.

## Layout

A single centred column, `max-width: 640px`, padded 40px top, 16px sides and 64px bottom. It is a grid with an 18px gap between blocks. The pay flow is its own grid with a 16px gap: holo card (at most 400px wide, centred), then paybox, then facts. Everything inside the paybox and the done panel is centred. Cards and forms are left-aligned.

The spacing habit is 8 / 12 / 16 / 18 / 22px: 8px between inline controls, 12px between form rows and paybox items, 16px between flow blocks, 18px between page blocks, 22px of padding inside cards.

At 560px and below, definition lists (facts, Spend details) stack label over value, command blocks put the Copy button under the text, the search pill relaxes to the 16px card radius, the header tabs become a three-column grid, and the card's @login drops to 1.4rem.

## Elevation & Depth

The interface is flat and tonal: Night, Graphite and Raised Graphite are separated by 1px Hairline borders, not shadows. The one lifted object is the holo card. It has a diffuse periwinkle glow beneath it, a 1px inner white edge, a perspective tilt that follows the pointer, and a screen-blended sheen band that tracks the pointer across the foil.

### Shadow Vocabulary
- **Holo lift** (`box-shadow: 0 30px 60px -30px rgb(154 184 255 / 0.55), inset 0 0 0 1px rgb(255 255 255 / 0.5)`): the holo card only.
- **Refused ring** (`box-shadow: 0 0 0 3px var(--err), 0 30px 60px -30px rgb(255 143 143 / 0.4)`): the refused holo card, together with `grayscale(0.85) brightness(0.92)`.
- **Focus ring** (`box-shadow: 0 0 0 3px rgb(154 184 255 / 0.18)`; 0.14 on the search pill): focused fields, with the Focus Line border.

### Named Rules
**The Only One Floats Rule.** Only the holo card is lifted. Cards, the paybox, the facts block and forms stay flat on Hairline borders.

## Shapes

Soft and rounded throughout. Pills (999px) for every button, tab, chip, tag, the search field and the tab bar. Containers use 16px corners (cards, paybox, facts, done panel, empty state). Fields and command blocks use 10px. The holo card alone uses 22px, like a trading card. Circles are reserved for avatars and the done check disc. The amount field is the one deliberately un-boxed input: no border except a 2px underline.

## Components

### Buttons
Confident white pills with dark ink.
- **Shape:** fully rounded pill (999px).
- **Primary:** Moonlight fill, Night ink, 700 weight, 11px 20px. The paybox's Pay button is full width at 15px 20px and 1.02rem. The busy state replaces the label with an inline spinner and narrated text ("Waiting for the transaction…").
- **Hover / Active:** hover dims to `brightness(0.92)`; press scales to 0.98 (0.15s ease-out). Disabled drops to 45% opacity.
- **Secondary:** transparent with a 1px Hairline border and Moonlight text ("Pay again", alternate actions).
- **Small:** 6px 12px at 0.8rem, for Copy and Download beside command blocks.

### Chips
- **Quick amounts:** pills in Raised Graphite with Moonlight text (6px 14px, 0.85rem). The selected one turns Moonlight with Night ink.
- **Tags:** small pills (0.75rem, 600) in Raised Graphite and Mist. The ok variant is Verified Mint on its wash ("on-chain").

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Graphite with a 1px Hairline border.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Internal Padding:** 22px for cards and the paybox; 14px 18px for the facts block; 24px 18px for the done panel.
- **Facts block:** a two-column definition list (150px labels in Mist, values that wrap anywhere) for account, balance and keys.
- **Done panel:** centred; a 48px Verified Mint disc with a Night SVG check, the "Sent …" line in Unbounded, a transaction link and a secondary "Pay again".
- **Empty state:** dashed Hairline border, 16px corners, 40px padding, a 56px lantern above one Mist sentence capped at 40ch.

### Inputs / Fields
- **Style:** Raised Graphite fill, 1px Hairline border, 10px corners, 9px 11px padding, Onest 0.95rem. Textareas are monospace at 0.8rem. The caret is Foil Pink.
- **Focus:** the border shifts to Focus Line with a 3px periwinkle ring (18% alpha). The amount field shows focus by turning its underline Foil Pink.
- **Search pill:** a Graphite pill that holds a Mist `github.com/` prefix, a borderless 1.05rem input, the chain select (pill) and a primary Find pill. The whole pill takes the focus ring through `:focus-within`.
- **Messages:** error and ok messages are tinted blocks (10px corners, 10px 14px) in coral or mint on their washes. Busy text is Mist with an inline spinner.

### Navigation
- **Tab bar:** a Graphite pill with a Hairline border and 4px padding, holding pill tabs (600, 0.92rem). Inactive tabs are Mist and turn Moonlight on hover. The active tab is a Moonlight pill with Night ink. The same component switches modes inside Spend cards. On mobile the header tabs become an equal three-column grid with 14px tab corners.
- **Header:** a 28px lantern and the Unbounded wordmark, a Mist tagline whose binding pitch line is set in bold Moonlight, then the tab bar.

### Holo Card (signature)
The developer as a collectible card, at most 400px wide, centred, with Night ink on the foil.
- **Top row:** the lantern and "Sereno" in Unbounded on the left; "No. <GitHub ID>" in mono on a 8% Night pill on the right.
- **Body:** an 88px circular avatar with a 3px Night ring, the @login in the headline style, the real name (600, deep graphite), and the ENS name in mono with a small "claimed" or "wildcard" tag.
- **Name check:** a pill badge on 88% Night with an inline SVG icon: a mint check for "Name matches account", or a coral cross for mismatch or unresolved.
- **Refused state:** when the check fails, the whole card goes 85% greyscale with a 3px coral ring, and a coral error message under it says "Not paying."
- **Received stamp:** after a payment, an Unbounded 800 stamp ("Received N USDC") in deep green ink with a 3px border on a translucent white plate, rotated -9°. It lands from 1.6× scale to 1× in 0.45s (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **Watermark:** a 10%-opacity Night lantern silhouette sits in the bottom-right corner.
- **Motion:** the foil angle, sheen position and tilt (up to about 7° by 9°) follow the pointer through `--mx` / `--my`, easing back over 0.25s when the pointer leaves. Under `prefers-reduced-motion` the card does not tilt or track, and the stamp appears without animating.

### Command and Intent Blocks
Monospace `pre` blocks on Night with a Hairline border, 10px corners and 12px 14px padding, with a small pill (Copy or Download) beside them (stacked below on mobile). The intent block wraps and uses a pale lilac text tint, so the exact signed text stays readable in full.

### Lantern
The mascot SVG takes its colours from `--l-frame`, `--l-glass`, `--l-flame` and `--l-eye`. On the night ground it has a Moonlight frame, Foil Pink glass and a Lantern Flame flame. Containers that sit on the foil override those variables.

## Do's and Don'ts

### Do:
- **Do** keep a single dark theme on Night (#0b0b12) with Graphite surfaces and 1px Hairline borders.
- **Do** use the Moonlight pill with Night ink for the primary action and for the current selection (active tab, chosen quick amount); keep every other control graphite or outlined.
- **Do** reserve the holographic foil for the identity card and the lantern; pick foil pink only for small accents such as the caret, selection and the amount focus underline.
- **Do** use Verified Mint for ok and Refusal Coral for refused, and turn the card itself refused when the name and the account disagree.
- **Do** set addresses, IDs, ENS names, balances, commands and signed text in monospace.
- **Do** keep the foil and tilt pointer-driven and still under `prefers-reduced-motion`.
- **Do** load fonts only from the bundled `@fontsource-variable` packages.
- **Do** draw icons as inline SVG in `currentColor` (check, cross, lantern).

### Don't:
- **Don't** add a light theme or light surfaces.
- **Don't** introduce other saturated colours, gradients or a blue accent button; the white card with one blue button is the default this world rejects.
- **Don't** use mint or coral decoratively, or for a neutral state.
- **Don't** lift anything but the holo card with a shadow.
- **Don't** request third-party fonts, scripts, analytics or trackers.
- **Don't** use cheque, envelope or keyboard metaphors in place of the card.
