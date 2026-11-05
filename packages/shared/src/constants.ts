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
export const HOSTED_RELAYER_URL = "https://happy-curiosity-production-7074.up.railway.app";
