import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  accountFactoryAbi,
  CHAINS,
  CORE,
  ENS,
  ENS_DEPLOYMENT,
  githubKeys,
  githubUser,
  keyHash,
  keyOracleAbi,
  type ChainKey,
  type GithubUser,
} from "@sereno/shared";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const PAY_CHAINS: ChainKey[] = ["base-sepolia", "arbitrum-sepolia"];
const ensClient = createPublicClient({ chain: CHAINS.sepolia.chain, transport: http(CHAINS.sepolia.rpc) });
const clientFor = (key: ChainKey) => createPublicClient({ chain: CHAINS[key].chain, transport: http(CHAINS[key].rpc) });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

interface Lookup {
  user: GithubUser;
  name: string;
  ensAddress: Address | null;
  factoryAddress: Address;
  claimed: boolean;
  deployed: boolean;
  balance: bigint;
  keys: { type: string; comment: string; listed: boolean }[];
}

export function App() {
  const [login, setLogin] = useState("");
  const [chainKey, setChainKey] = useState<ChainKey>("base-sepolia");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<string | null>(null);
  const chain = CHAINS[chainKey];

  async function find(e?: React.FormEvent, key = chainKey) {
    e?.preventDefault();
    if (!login.trim() || !CORE || !ENS_DEPLOYMENT) return;
    setBusy("Looking up…");
    setError(null);
    setPaid(null);
    setLookup(null);
    try {
      const user = await githubUser(login.trim());
      const name = `${user.login.toLowerCase()}.${ENS_DEPLOYMENT.parentName}`;
      const c = CHAINS[key];
      const pub = clientFor(key);
      const [ensAddress, resolver, factoryAddress] = await Promise.all([
        ensClient.getEnsAddress({ name, coinType: c.coinType, universalResolverAddress: ENS.universalResolver, gatewayUrls: ["x-batch-gateway:true"] }).catch(() => null),
        ensClient.getEnsResolver({ name, universalResolverAddress: ENS.universalResolver }).catch(() => null),
        pub.readContract({ address: CORE.AccountFactory, abi: accountFactoryAbi, functionName: "addressOf", args: [user.id] }),
      ]);
      const [code, balance, lines] = await Promise.all([
        pub.getCode({ address: factoryAddress }),
        pub.readContract({ address: c.usdc, abi: erc20Abi, functionName: "balanceOf", args: [factoryAddress] }),
        githubKeys(user.id).catch(() => [] as string[]),
      ]);
      const keys = await Promise.all(
        lines.map(async (line) => {
          const since = await pub.readContract({ address: CORE!.KeyOracle, abi: keyOracleAbi, functionName: "firstSeen", args: [user.id, keyHash(line)] });
          const [type = "", , comment = ""] = line.split(" ");
          return { type, comment, listed: since > 0n };
        }),
      );
      setLookup({
        user,
        name,
        ensAddress: ensAddress ? getAddress(ensAddress) : null,
        factoryAddress,
        claimed: !!resolver && resolver.toLowerCase() !== ENS_DEPLOYMENT.resolver.toLowerCase(),
        deployed: !!code && code !== "0x",
        balance,
        keys,
      });
    } catch (err) {
      setError((err as Error).message.includes("not found") ? `No GitHub user "${login.trim()}"` : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!lookup?.ensAddress) return;
    if (!window.ethereum) return setError("No browser wallet found. Install MetaMask, Rabby or Phantom.");
    setError(null);
    setPaid(null);
    try {
      const wallet = createWalletClient({ chain: chain.chain, transport: custom(window.ethereum) });
      const [from] = await wallet.requestAddresses();
      setBusy(`Switching your wallet to ${chain.chain.name}…`);
      try {
        await wallet.switchChain({ id: chain.chain.id });
      } catch {
        await wallet.addChain({ chain: chain.chain });
        await wallet.switchChain({ id: chain.chain.id });
      }
      setBusy("Confirm the payment in your wallet…");
      const hash: Hex = await wallet.writeContract({
        account: from!,
        address: chain.usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [lookup.ensAddress, parseUnits(amount, 6)],
      });
      setBusy("Waiting for the transaction…");
      await clientFor(chainKey).waitForTransactionReceipt({ hash });
      setPaid(`${chain.explorer}/tx/${hash}`);
      await find(undefined, chainKey);
    } catch (err) {
      setError((err as Error).message.split("\n")[0] ?? "payment failed");
    } finally {
      setBusy(null);
    }
  }

  const mismatch = lookup && lookup.ensAddress && lookup.ensAddress !== lookup.factoryAddress;

  return (
    <main>
      <header>
        <h1>Sereno</h1>
        <p className="tagline">Pay any developer by their GitHub username. They spend with the SSH key they already have.</p>
      </header>

      <form onSubmit={find} className="search">
        <span className="at">github.com/</span>
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="username" autoFocus spellCheck={false} />
        <select value={chainKey} onChange={(e) => { const k = e.target.value as ChainKey; setChainKey(k); if (lookup) void find(undefined, k); }}>
          {PAY_CHAINS.map((k) => (
            <option key={k} value={k}>{CHAINS[k].chain.name}</option>
          ))}
        </select>
        <button disabled={!!busy || !login.trim()}>Find</button>
      </form>

      {busy && <p className="busy">{busy}</p>}
      {error && <p className="error">{error}</p>}

      {lookup && (
        <section className="card">
          <div className="who">
            <img src={lookup.user.avatarUrl} alt="" width={64} height={64} />
            <div>
              <div className="login">{lookup.user.name ?? lookup.user.login} <span className="muted">@{lookup.user.login}</span></div>
              <div className="muted">GitHub ID {lookup.user.id.toString()} (the account follows this ID, not the username)</div>
            </div>
          </div>

          <dl>
            <dt>ENS name</dt>
            <dd>
              {lookup.name} {lookup.claimed ? <span className="tag ok">claimed, owned by the account</span> : <span className="tag">wildcard</span>}
            </dd>
            <dt>Account on {chain.chain.name}</dt>
            <dd>
              <a href={`${chain.explorer}/address/${lookup.factoryAddress}`} target="_blank" rel="noreferrer">{lookup.factoryAddress}</a>
              <div className="muted">{lookup.deployed ? "deployed" : "not deployed yet; it can already receive"} · balance {formatUnits(lookup.balance, 6)} USDC</div>
            </dd>
            <dt>Keys that can spend</dt>
            <dd>
              {lookup.keys.length === 0 && <span className="muted">No SSH keys on this GitHub profile yet; money waits until they add one.</span>}
              {lookup.keys.map((k, i) => (
                <div key={i}>
                  <code>{k.type}</code> {k.comment && <span className="muted">{k.comment}</span>}{" "}
                  {k.listed ? <span className="tag ok">watched on-chain</span> : <span className="tag">not synced yet</span>}
                </div>
              ))}
            </dd>
          </dl>

          {mismatch && <p className="error">The ENS name and the account factory disagree ({short(lookup.ensAddress!)} vs {short(lookup.factoryAddress)}). Not paying.</p>}
          {!lookup.ensAddress && <p className="error">The ENS name did not resolve (is the gateway reachable?).</p>}

          <div className="pay">
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span>USDC</span>
            <button onClick={pay} disabled={!!busy || !lookup.ensAddress || !!mismatch || !(Number(amount) > 0)}>
              Pay {lookup.name}
            </button>
          </div>
          {paid && <p className="ok-msg">Paid. <a href={paid} target="_blank" rel="noreferrer">View transaction</a></p>}
        </section>
      )}

      <footer>
        No sign-up, no seed phrase, no trackers. Open source (MIT). Testnet: {PAY_CHAINS.map((k) => CHAINS[k].chain.name).join(" and ")}, Circle USDC.
      </footer>
    </main>
  );
}
