// Product slug (see CLAUDE.md). Must match contracts/src/Constants.sol byte for byte.
export const APP = "sereno";
export const INTENT_HEADER = `${APP} v1`;
export const SIGNING_NAMESPACE = `${APP}@v1`;
export const GIT_NAMESPACE = "git";

/// Spends above this (token base units; 50 USDC) from a key first seen < NEW_KEY_DELAY ago are refused on-chain.
export const INSTANT_LIMIT = 50_000_000n;
export const NEW_KEY_DELAY_SECONDS = 72 * 3600;

/// Our hosted services (Railway; see CLAUDE.md §8.5). Anyone can run their own: the CLI takes AK_RELAYER, the pay
/// page VITE_GATEWAY_URL, and the sereno.eth resolver's URL is owner-settable.
export const HOSTED_GATEWAY_URL = "https://sereno-production.up.railway.app";
/// The pay page (web/); the browser extension and the CLI link to it. Deep links: `?user=<login>[&amount=5]` (pay),
/// `?issue=<owner>/<repo>/issues/<n>#bounties` (fund a bounty).
/// The browser extension's fixed ID (its manifest carries the matching public key), so the native helper and the
/// pay page's wallet link can name it.
export const EXTENSION_ID = "fnffhlmjmpnglceomjiigjdfhildhpdl";
export const HOSTED_PAY_URL = "https://sereno-eth.vercel.app";
export const HOSTED_RELAYER_URL = "https://happy-curiosity-production-7074.up.railway.app";
