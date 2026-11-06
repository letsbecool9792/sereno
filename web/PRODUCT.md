# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Payer (primary for web):** a bounty funder, maintainer, hackathon or grant organiser, or anyone tipping a commit's author. They know a GitHub username, not an address, and they hold an ordinary injected wallet. Their job: send USDC to a developer by username with no "send me your address" step.
- **Paid developer (secondary for web, primary for the CLI):** terminal-native, already has an SSH key on their GitHub profile. Their job: see and spend what they were paid with the `ssh-keygen` or `git commit -S` they already use, with no app, seed phrase or sign-up. They use the `ak` CLI and the web Spend tab.
- Hackathon judges watch both in a 4-minute demo (ETHGlobal Mumbai, Nov 2026). They are a clarity constraint, not a separate audience.

## Product Purpose

Every SSH key on a GitHub profile is already an Ethereum signer. Sereno gives every GitHub user a smart account at a deterministic address derived from their numeric GitHub ID, so anyone can pay them by username before they have ever heard of Sereno. The developer spends by signing a plain-text intent with stock OpenSSH or a signed git commit. Success is the payer paying in under a minute, and the developer spending without installing anything new.

## Positioning

The account and the keys already exist: the GitHub profile is the wallet. No sign-up, no OAuth, no custom key tool. Hardware keys and a phone used as a security key work. A pushed signed commit can itself be the payment, and GitHub shows it as Verified.

## Operating Context

- Pay page (web): Vite + React + viem; "Pay someone" and "Spend your balance" (#spend) tabs.
- `ak` CLI (`npx sereno-ak`): `account`, `send`, `commit-pay`, `claim`, `sync`.
- Names: `<user>.sereno.eth` on Sepolia ENSv2 through a wildcard resolver and a CCIP-read gateway; a developer can claim the name as a real subname owned by their account.
- Keys are copied on-chain by a Chainlink CRE workflow; a key removed on GitHub is revoked at the next run.
- Chains: Base Sepolia (primary) and Arbitrum Sepolia, same addresses, Circle USDC. Testnet only.
- The phone as a security key works only on Windows (Win32-OpenSSH 10.x): QR code, then fingerprint.

## Capabilities and Constraints

- Payments are USDC transfers from the payer's own wallet; Sereno never holds payer keys.
- Spends: the user signs readable text (the intent), a relayer submits it and takes a small fee, and anyone can self-submit.
- Over 50 USDC from a key first seen less than 72 hours ago is refused.
- Stock wallets cannot resolve these testnet names, so the pay page resolves them itself.
- Hackathon cut rule: anything not working by Fri 6 Nov midday becomes a slide. The browser extension and agent spending are extras.
- Open decisions: a public host for the pay page; a `?user=` deep link.

## Brand Commitments

- Pitch line, binding: "We didn't build a wallet. GitHub already was one."
- Should sit alongside Phantom and MetaMask: friendly, colourful, striking crypto-wallet craft. Plain or generic looks were rejected (6 Nov), as were heavy real-world metaphors (cheques, envelopes, key boards).

## Evidence on Hand

- Working pay page and Spend tab (`web/src/App.tsx`, `web/src/Spend.tsx`), working CLI (`cli/src/main.ts`).
- Deployed contracts on Base Sepolia, Arbitrum Sepolia and Sepolia (addresses in the repo `CLAUDE.md`).
- No users, testimonials, metrics or press exist; never fabricate them.

## Product Principles

1. The username is the address: never make the payer handle hex first.
2. Show the exact text being signed, every time; never ask for blind approval.
3. Nothing new to install or trust: reuse GitHub, OpenSSH, git and the payer's own wallet.
4. Refuse loudly when the name and the account disagree; safety beats completion.
5. Every step has a fallback anyone can run (self-submit, open-source gateway).

## Accessibility & Inclusion

No product-specific standard was set; WCAG 2.2 AA is assumed.
