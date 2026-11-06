---
name: sereno
description: Pay any GitHub developer by username. The night watchman's round: warm black, one lantern amber, brass edges, and a horizon of SSH key characters.
colors:
  ground: "#0a0908"
  surface: "#13110e"
  surface-2: "#1a1713"
  surface-3: "#24201a"
  line: "rgb(255 236 210 / 0.08)"
  line-strong: "rgb(255 236 210 / 0.16)"
  ink: "#f4efe6"
  muted: "#a69f93"
  faint: "#6f695f"
  amber: "#f2b35b"
  amber-hover: "#f7c67f"
  amber-ink: "#1a1206"
  brass: "#c9964f"
  ok: "#62e3a5"
  err: "#ff8b80"
typography:
  display: "Bricolage Grotesque Variable, 600, tracking -0.025em to -0.05em"
  ui: "DM Sans Variable, 400/500/600, 16px body, line-height 1.55"
  mono: "JetBrains Mono Variable, for keys, addresses, IDs, signed text and commands"
spacing: "4 8 12 16 24 32 48 64 96 144 (px)"
rounded: "10 (fields), 16 (blocks), 22 to 24 (cards), pill (buttons, search, chips)"
---

# Design system: sereno

## Concept

A *sereno* was the night watchman of old Spanish towns. He carried the lantern and the keys to every door and called out the hour and that all was calm ("¡sereno!"). The site borrows that world.

```
Idea:        Pay any developer by GitHub username; the SSH key they already have is the key to the wallet.
Metaphor:    the watchman's round: a dark street, one lantern, a ring of keys
Signature:   the boot, where the lantern draws itself, its keyhole flame catches and the night lifts like a curtain
             onto a horizon made of SSH key characters
Emotion:     calm certainty ("all is calm"), not crypto noise
Motion verb: catch light and settle
Screenshot:  the headline over the amber ASCII horizon, the developer's card rising out of it
```

The name is always lowercase: **sereno**. Copy is labels and states, one short line per idea. No em or en dashes in visible text, sentence case, no filler.

## The mark

A lantern whose flame is a keyhole (`src/Lantern.tsx`): the watchman's light and his keys in one shape. Line art in ink (`--l-frame`), the flame filled in amber with a soft glow (`--l-flame`, `--l-glow`). The flame breathes slowly wherever the mark appears.

## Colors

- **Ground and surfaces:** warm black, three surface steps, hairline borders in warm white at 8 and 16% so lines read as engraved rather than drawn.
- **Ink:** warm white. **Muted:** warm grey, about 7:1 on the ground, for secondary text. **Faint:** captions and eyebrows only.
- **Amber (the lantern):** the only action colour: primary buttons, focus rings, the active step, the hero underline. Dark text on amber.
- **Brass:** edges and rings on the card and avatars; never a fill.
- **Grain:** a fixed SVG noise layer at 5% over the whole page, so the dark reads as a material.
- **Status:** mint means done or ok; coral means refused.

## Typography

- **Display (Bricolage Grotesque):** headlines, page titles, amounts, names, the wordmark. Tight negative tracking; the hero runs at clamp(2.7rem, 6.4vw, 6rem).
- **UI (DM Sans):** everything else, 16px body, 0.875rem labels.
- **Mono (JetBrains Mono):** keys, addresses, IDs, signed text, commands, and the uppercase eyebrows in the footer.
- All three are self-hosted through fontsource; no third-party font requests.

## Layout

- 8px scale. Page grid max 1160px with a fluid gutter (16 to 40px).
- **Landing**, in order: centered hero over a full-bleed ASCII horizon (headline, one line, the username search, the live card); a large statement that brightens word by word on scroll; how it works (three steps); what you can do (one tall card, two stacked, pointer spotlight); `npx sereno-ak` (command list beside a terminal that types each one and shows what happens); built on; a final search; the footer.
- **Pay:** search, then the card beside the payment panel (stacks below 960px).
- **Spend:** one centered column of 760px. Step 1 payment details; step 2 a from → to strip, then the signing method. The "prefer the terminal?" command sits below as a single row. No side column.
- **Footer:** the sereno story, product, developers (copy `npx sereno-ak`), network, then a giant faint wordmark.
- **Phone (390px):** one column, full-width search, no horizontal scroll (long commands scroll inside their own box), tap targets at least 44px.

## The ASCII horizon

React Bits' Gradient ASCII (`src/vendor/GradientASCII.jsx`, MIT + Commons Clause, see the header) in its "horizon" shape. The glyph ramp is what an SSH public key is made of: light punctuation, then the letters every `ssh-ed25519` key starts with (`AAAAC3NzaC1lZDI1NTE5`), heaviest last. Colours run from the amber horizon line up into a dark sky. A scrim keeps the headline readable. It mounts as the boot curtain lifts so its own fade-in is seen, pauses off screen, and goes still under reduced motion. One change to the vendored file: its cleanup no longer calls `loseContext()`, which left the canvas blank under React StrictMode in dev.

## The card

Brushed obsidian (a dark warm gradient with fine vertical brushing and grain), a 1.5px brass edge drawn with a masked metal gradient, an engraved lantern watermark, and a warm sheen that follows the pointer like a lantern held close. Avatar in a brass ring, the ENS name in amber mono. A failed name check turns the edge coral and the avatar grey; a payment stamps it "Received".

## Motion (GSAP 3.15)

- One ease family (`expo.out`), durations 0.5 to 1.5s, staggers 35 to 100ms. Big things move slower than small things. Only transform, opacity and clip-path.
- **Boot (first landing visit, about 2.7s):** the lantern lines draw (DrawSVG), the keyhole flame catches, a glow blooms, the wordmark rises letter by letter, "¡sereno! all is calm" decodes (ScrambleText), then the overlay lifts away (clip-path) and the nav drops in.
- **Hero:** the headline rises line by line through masks (SplitText), the amber underline draws itself, the card arrives with a tilt and turns each time its person changes.
- **Scroll:** the statement brightens word by word (scrubbed), sections reveal once, the sample address decodes when it comes into view.
- **Terminal:** each command types itself, then its output lines appear; it cycles until you pick one.
- **Pay and Spend:** the card settles in after a lookup; a check draws itself on success; the from → to strip staggers in.
- Under `prefers-reduced-motion` there is no boot, nothing moves, and all content is visible.
- GSAP is the only animation library (Standard no-charge licence, not MIT).

## Components

- **Buttons:** amber pill with an inner highlight (primary), outlined pill (secondary), small pill; hover lifts 1px with an amber glow and nudges the trailing arrow; disabled is a flat grey pill.
- **Search:** one pill with a `github.com/` prefix, the input and the action; amber focus ring.
- **Segmented control:** network choice and signing mode; fills the width on phones.
- **Summary rows:** to, network, arrival and fee, shown before paying.
- **Stepper:** connect, approve, confirm, sent, from the payment's live status.
- **Skeletons** while the gateway and RPCs answer; **details** disclosure for technical facts.

## Do's and don'ts

- Do show who you're paying (avatar, username, real name, GitHub ID) before any wallet opens.
- Do keep technical detail one tap away, not on the first screen.
- Don't add a second accent colour, rainbow or foil gradients, or motion that carries no meaning.
- Don't put explanatory cards beside a task; keep tasks in one column with help inline.
