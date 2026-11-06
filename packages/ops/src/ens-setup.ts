// ENS on Sepolia (ENSv2): wildcard resolver + gateway signer for <user>.<parent>, a UserRegistry subregistry under the
// parent name, and the NameRegistrar that turns claims into real subnames. Resumable; writes
// contracts/deployments/ens.json (then run `bun run sync`).
//
//   PARENT_NAME=authorizedkeys.eth GATEWAY_URL=https://host/{sender}/{data}.json bun run ens-setup
import { join } from "node:path";
import { encodeDeployData, encodeFunctionData, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, CORE, ENS } from "@sereno/shared";
import { ROOT, artifact, clients, readJson, secretKey, writeJson } from "./env";

const PARENT = process.env.PARENT_NAME ?? "authorizedkeys.eth";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8787/{sender}/{data}.json";
const STATE = join(ROOT, "contracts/deployments/ens.json");
// Sepolia's base fee is a few wei; viem's defaults would overpay by orders of magnitude.
const FEES = { maxFeePerGas: 5000n, maxPriorityFeePerGas: 100n };

if (!CORE) throw new Error("core contracts not deployed (contracts/deployments/core.json)");
const label = PARENT.replace(/\.eth$/, "");
const { pub, wallet, account } = clients("sepolia", secretKey("deployer"));
const gatewaySigner = privateKeyToAccount(secretKey("gateway", true)).address;
const state = readJson<Record<string, string>>(STATE, {});
const save = () => writeJson(STATE, { parentName: PARENT, gatewaySigner, ...state });
const link = (h: Hex) => `${CHAINS.sepolia.explorer}/tx/${h}`;

const bits = (...ns: bigint[]) => ns.reduce((a, n) => a | (1n << n) | (1n << (n + 128n)), 0n); // role + admin
// RegistryRolesLib: REGISTRAR 0, SET_PARENT 8, UNREGISTER 12, RENEW 16, SET_SUBREGISTRY 20, SET_RESOLVER 24
const ROOT_ROLES = bits(0n, 8n, 12n, 16n, 20n, 24n);
const REGISTRAR_ROLES = bits(0n, 12n, 20n, 24n); // UNREGISTER lets NameRegistrar free stale names after a rename

const ethRegistry = parseAbi([
  "function getTokenId(uint256 anyId) view returns (uint256)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function roles(uint256 anyId, address account) view returns (uint256)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
]);
const userRegistry = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function setParent(address parent, string label)",
  "function grantRootRoles(uint256 roleBitmap, address account)",
]);
const factoryAbi = parseAbi(["function deployProxy(address implementation, uint256 salt, bytes data) returns (address)"]);

async function send(what: string, req: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) {
  const { request, result } = await pub.simulateContract({ account, ...req } as never);
  const gas = await pub.estimateContractGas({ account, ...req } as never);
  const hash = await wallet.writeContract({ ...(request as object), gas: (gas * 12n) / 10n, ...FEES } as never);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (r.status !== "success") throw new Error(`${what} reverted: ${link(hash)}`);
  console.log(`${what.padEnd(48)} gas ${String(r.gasUsed).padStart(9)}  ${link(hash)}`);
  return result as unknown;
}

async function deploy(what: string, art: { abi: unknown[]; bytecode: Hex }, args: unknown[]): Promise<Address> {
  const data = encodeDeployData({ abi: art.abi, bytecode: art.bytecode, args } as never);
  const gas = await pub.estimateGas({ account, data });
  const hash = await wallet.sendTransaction({ data, gas: (gas * 12n) / 10n, ...FEES } as never);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (r.status !== "success" || !r.contractAddress) throw new Error(`${what} failed: ${link(hash)}`);
  console.log(`${what.padEnd(48)} gas ${String(r.gasUsed).padStart(9)}  ${link(hash)}`);
  return r.contractAddress;
}

const tokenId = await pub.readContract({ address: ENS.ethRegistry, abi: ethRegistry, functionName: "getTokenId", args: [BigInt(keccak256(toHex(label)))] });
const roles = await pub.readContract({ address: ENS.ethRegistry, abi: ethRegistry, functionName: "roles", args: [tokenId, account.address] });
if (!((roles >> 20n) & 1n) || !((roles >> 24n) & 1n)) throw new Error(`${account.address} lacks SET_SUBREGISTRY/SET_RESOLVER on ${PARENT}`);
console.log(`${PARENT}: token ${tokenId}, deployer ${account.address}, gateway signer ${gatewaySigner}`);

if (!state.resolver) {
  state.resolver = await deploy("deploy OffchainResolver", artifact("OffchainResolver.sol", "OffchainResolver"), [account.address, GATEWAY_URL, gatewaySigner]);
  save();
}

if (!state.userRegistry) {
  const init = encodeFunctionData({ abi: userRegistry, functionName: "initialize", args: [[{ account: account.address, roleBitmap: ROOT_ROLES }]] });
  const salt = BigInt(keccak256(toHex(`sereno/v1/user-registry/${PARENT}`)));
  state.userRegistry = (await send("deploy UserRegistry (VerifiableFactory)", { address: ENS.verifiableFactory, abi: factoryAbi, functionName: "deployProxy", args: [ENS.userRegistryImpl, salt, init] })) as Address;
  save();
  await send("UserRegistry.setParent", { address: state.userRegistry as Address, abi: userRegistry, functionName: "setParent", args: [ENS.ethRegistry, label] });
}

if (!state.nameRegistrar) {
  const expiry = await pub.readContract({ address: ENS.ethRegistry, abi: ethRegistry, functionName: "getExpiry", args: [tokenId] });
  const coinTypes = [CHAINS.sepolia.coinType, CHAINS["base-sepolia"].coinType, CHAINS["arbitrum-sepolia"].coinType];
  state.nameRegistrar = await deploy("deploy NameRegistrar", artifact("NameRegistrar.sol", "NameRegistrar"), [
    state.userRegistry, ENS.verifiableFactory, ENS.permissionedResolverImpl, CORE.AccountFactory, CORE.KeyOracle, CORE.SshSigVerifier, PARENT, expiry, coinTypes,
  ]);
  save();
  await send("UserRegistry.grantRootRoles(registrar)", { address: state.userRegistry as Address, abi: userRegistry, functionName: "grantRootRoles", args: [REGISTRAR_ROLES, state.nameRegistrar as Address] });
}

const sub = await pub.readContract({ address: ENS.ethRegistry, abi: ethRegistry, functionName: "getSubregistry", args: [label] });
if (sub.toLowerCase() !== state.userRegistry!.toLowerCase()) {
  await send(`ETHRegistry.setSubregistry(${label})`, { address: ENS.ethRegistry, abi: ethRegistry, functionName: "setSubregistry", args: [tokenId, state.userRegistry as Address] });
}
const res = await pub.readContract({ address: ENS.ethRegistry, abi: ethRegistry, functionName: "getResolver", args: [label] });
if (res.toLowerCase() !== state.resolver!.toLowerCase()) {
  await send(`ETHRegistry.setResolver(${label})`, { address: ENS.ethRegistry, abi: ethRegistry, functionName: "setResolver", args: [tokenId, state.resolver as Address] });
}
save();
console.log(`done: ${PARENT} -> resolver ${state.resolver}, subregistry ${state.userRegistry}, registrar ${state.nameRegistrar}`);
