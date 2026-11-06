---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/Spend.tsx","src/Bounties.tsx"]
---

Scope: the web app (Pay someone, Spend your balance, Issue bounties). Mode: operate. Audience: payers first (any wallet, a GitHub username), developers second (SSH key, terminal). Must sit alongside Phantom and MetaMask.

## Direction contract

THESIS: Every GitHub developer is a collectible holographic card; paying them is handing value to that card. Refuses the category default of a white card with one blue button.

OWN-WORLD: Near-black violet ground (#0b0b12), graphite surfaces, white pill primary button with dark ink. The only saturated colour is the holographic foil (pink, periwinkle, mint, butter conic gradient) on the identity card and the lantern mascot; mint means verified/ok, coral means refused. Unbounded for display, Onest for UI, mono for addresses and signed text.

STORY: The payer types a username, sees the developer's holo card with the name check stamped on it, picks an amount, pays from their wallet, and sees "Sent". The developer sees their own card on Spend and signs readable text.

FIRST VIEWPORT: Top bar with lantern logo, Sereno wordmark, tabs. Search field. When found: the holo card (avatar, @login, ENS name, GitHub ID, name-check badge), then amount with quick chips, keys row, white Pay pill; waiting narrated in place; paid shown as a success panel.

FORM: Holo Card, #8 of a ten-direction gallery the user asked for after declining two rolled hands. seed:853156b1534a889a

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: the holo card's foil and sheen follow the pointer with a slight tilt; still under prefers-reduced-motion.
