import { useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, type Address, type EIP1193Provider } from "viem";
import { CHAINS, githubKeys, githubUser, HOSTED_GATEWAY_URL, HOSTED_RELAYER_URL, type ChainKey, type GithubUser } from "@sereno/shared";

export const PAY_CHAINS: ChainKey[] = ["base-sepolia", "arbitrum-sepolia"];
export const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? HOSTED_GATEWAY_URL;
export const RELAYER = import.meta.env.VITE_RELAYER_URL ?? HOSTED_RELAYER_URL;

/// Profile and SSH keys through our gateway (token + cache); straight from GitHub if the gateway is unreachable.
export async function fetchProfile(login: string): Promise<{ user: GithubUser; keys: string[] }> {
  try {
    const res = await fetch(`${GATEWAY}/lookup/${encodeURIComponent(login)}`);
    if (res.status === 404) throw Object.assign(new Error("not found"), { notFound: true });
    if (res.ok) {
      const p = (await res.json()) as { login: string; id: string; name: string | null; avatarUrl: string; keys: string[] };
      return { user: { login: p.login, id: BigInt(p.id), name: p.name, avatarUrl: p.avatarUrl }, keys: p.keys };
    }
  } catch (e) {
    if ((e as { notFound?: boolean }).notFound) throw e;
  }
  const user = await githubUser(login);
  return { user, keys: await githubKeys(user.id).catch(() => []) };
}

export const clientFor = (key: ChainKey) => createPublicClient({ chain: CHAINS[key].chain, transport: http(CHAINS[key].rpc) });

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/// POST to the relayer; throws with its message on refusal.
export async function relay(path: string, body: unknown): Promise<Record<string, string>> {
  const res = await fetch(`${RELAYER}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({ message: `relayer answered ${res.status}` }))) as Record<string, string>;
  if (!res.ok) throw new Error(out.message ?? `relayer answered ${res.status}`);
  return out;
}

/// "https://github.com/o/r/commit/<sha>", ".../pull/1/commits/<sha>" or "o/r@<sha>" → { repo, sha }.
export function parseCommitLink(s: string): { repo: string; sha: string } | null {
  const t = s.trim();
  const url = t.match(/github\.com\/([\w.-]+\/[\w.-]+)\/(?:pull\/\d+\/)?commits?\/([0-9a-f]{7,40})/i);
  if (url) return { repo: url[1]!, sha: url[2]!.toLowerCase() };
  const at = t.match(/^([\w.-]+\/[\w.-]+)@([0-9a-f]{7,40})$/i);
  return at ? { repo: at[1]!, sha: at[2]!.toLowerCase() } : null;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/// Wallets announced through EIP-6963 (so MetaMask and Phantom can both be installed without fighting over window.ethereum).
export interface WalletOption {
  name: string;
  provider: EIP1193Provider;
}
export function useWallets(): WalletOption[] {
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  useEffect(() => {
    const onAnnounce = (e: Event) => {
      const { info, provider } = (e as CustomEvent<{ info: { name: string; uuid: string }; provider: EIP1193Provider }>).detail;
      setWallets((ws) => (ws.some((w) => w.name === info.name) ? ws : [...ws, { name: info.name, provider }]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);
  return wallets.length > 0 ? wallets : window.ethereum ? [{ name: "Browser wallet", provider: window.ethereum }] : [];
}

/// Connects `w`, switches it to `key`'s chain (adding the chain if the wallet doesn't know it) and returns the wallet
/// client and the account to send from. `onStep` reports progress for the UI.
export async function connectWallet(w: WalletOption, key: ChainKey, onStep: (s: string) => void): Promise<{ wallet: ReturnType<typeof createWalletClient>; from: Address }> {
  const chain = CHAINS[key].chain;
  const wallet = createWalletClient({ chain, transport: custom(w.provider) });
  onStep(`Connecting ${w.name}…`);
  await wallet.requestAddresses();
  if ((await wallet.getChainId()) !== chain.id) {
    onStep(`Asking ${w.name} to switch to ${chain.name}…`);
    try {
      await wallet.switchChain({ id: chain.id });
    } catch (e) {
      if ((e as { code?: number }).code === 4902 || /unrecognized|not been added|4902/i.test(String((e as Error).message))) {
        await wallet.addChain({ chain });
        await wallet.switchChain({ id: chain.id });
      } else throw e;
    }
    for (let i = 0; i < 10 && (await wallet.getChainId()) !== chain.id; i++) await new Promise((r) => setTimeout(r, 300));
    const now = await wallet.getChainId();
    if (now !== chain.id) throw new Error(`${w.name} is still on chain ${now}. Switch it to ${chain.name} (chain id ${chain.id}) yourself, then try again.`);
  }
  // Wallets that authorize sites per network need access granted again on this network.
  const [from] = await wallet.requestAddresses();
  if (!from) throw new Error(`${w.name} returned no account`);
  return { wallet, from };
}
