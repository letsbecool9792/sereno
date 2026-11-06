// What the extension keeps in chrome.storage.local (besides the vault): who you are, settings, linked wallets and
// automation rules. Payees and rules store GitHub IDs, never names, so a rename can't redirect money.
import type { Address, Hex } from "viem";
import type { ChainKey } from "@sereno/shared";

export interface Profile {
  login: string;
  githubId: string;
  account: Address;
  avatarUrl?: string;
}

export interface Settings {
  /// Minutes of inactivity before the vault locks (up to 24 h when automations are on).
  autoLockMin: number;
  /// Payments above this (USDC) ask for the password again, even while unlocked.
  confirmAbove: string;
  /// Show bounty, balance and payment badges on GitHub pages (lookups on page view). Off = lookups only on click.
  badges: boolean;
  /// Total USDC automations may send per day.
  dailyCap: string;
  /// Automations on (they run only while the vault is unlocked and the browser runs).
  automations: boolean;
  /// Default relayer fee (USDC).
  fee: string;
}

export const DEFAULT_SETTINGS: Settings = { autoLockMin: 15, confirmAbove: "20", badges: false, dailyCap: "50", automations: false, fee: "0.02" };

export interface LinkedWallet {
  address: Address;
  signature: Hex;
  linkedAt: number;
  label?: string;
}

export interface SweepRule {
  id: string;
  type: "sweep";
  chain: ChainKey;
  to: Address; // a linked wallet
  keep: string;
  minAmount: string;
  everyMin: number;
  enabled: boolean;
  lastRun?: number;
  errors?: number;
  lastError?: string;
}

export interface RecurringRule {
  id: string;
  type: "recurring";
  chain: ChainKey;
  toGithubId: string;
  toLogin: string; // display only
  amount: string;
  everyMin: number;
  until?: number;
  maxRuns?: number;
  runs: number;
  nextRun: number;
  enabled: boolean;
  errors?: number;
  lastError?: string;
}

export type Rule = SweepRule | RecurringRule;

const local = chrome.storage.local;

export async function getProfile(): Promise<Profile | null> {
  return ((await local.get("profile")).profile as Profile | undefined) ?? null;
}
export const setProfile = (p: Profile | null) => (p ? local.set({ profile: p }) : local.remove("profile"));

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(((await local.get("settings")).settings as Partial<Settings> | undefined) ?? {}) };
}
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = { ...(await getSettings()), ...patch };
  s.autoLockMin = Math.max(1, Math.min(s.automations ? 24 * 60 : 12 * 60, Math.round(s.autoLockMin)));
  await local.set({ settings: s });
  return s;
}

export async function getWallets(): Promise<LinkedWallet[]> {
  return ((await local.get("wallets")).wallets as LinkedWallet[] | undefined) ?? [];
}
export const setWallets = (w: LinkedWallet[]) => local.set({ wallets: w });

export async function getRules(): Promise<Rule[]> {
  return ((await local.get("rules")).rules as Rule[] | undefined) ?? [];
}
export const setRules = (r: Rule[]) => local.set({ rules: r });

/// Automation spending per UTC day, for the daily cap.
export async function spentToday(): Promise<bigint> {
  const d = new Date().toISOString().slice(0, 10);
  const v = (await local.get("spent")).spent as { day: string; units: string } | undefined;
  return v?.day === d ? BigInt(v.units) : 0n;
}
export async function addSpent(units: bigint): Promise<void> {
  const d = new Date().toISOString().slice(0, 10);
  await local.set({ spent: { day: d, units: ((await spentToday()) + units).toString() } });
}
