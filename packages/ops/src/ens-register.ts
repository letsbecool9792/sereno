// Registers <label>.eth on Sepolia ENSv2 to the deployer (paid in Circle Sepolia USDC; commit, wait, register).
// Resolver and subregistry are set afterwards by ens-setup.ts.
//
//   LABEL=sereno bun src/ens-register.ts
import { erc20Abi, keccak256, parseAbi, toHex, zeroAddress, type Hex } from "viem";
import { CHAINS } from "@sereno/shared";
import { clients, secretKey } from "./env";

const LABEL = process.env.LABEL ?? "sereno";
const REGISTRAR = "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3";
const USDC = CHAINS.sepolia.usdc;
const DURATION = 365n * 24n * 3600n;
const REFERRER = `0x${"00".repeat(32)}` as Hex;
const FEES = { maxFeePerGas: 5000n, maxPriorityFeePerGas: 100n };
const abi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256, uint256)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
]);

const { pub, wallet, account } = clients("sepolia", secretKey("deployer"));
const send = async (what: string, req: object) => {
  const gas = await pub.estimateContractGas({ account, ...req } as never);
  const hash = await wallet.writeContract({ ...req, gas: (gas * 12n) / 10n, ...FEES } as never);
  // public RPCs lag; keep asking for the receipt instead of failing on the first timeout
  let r;
  for (let i = 0; !r; i++) {
    try {
      r = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    } catch (e) {
      if (i >= 5) throw e;
    }
  }
  if (r.status !== "success") throw new Error(`${what} reverted`);
  console.log(`${what.padEnd(28)} ${CHAINS.sepolia.explorer}/tx/${hash}`);
};

if (!(await pub.readContract({ address: REGISTRAR, abi, functionName: "isAvailable", args: [LABEL] }))) throw new Error(`${LABEL}.eth is not available`);
const [base, premium] = await pub.readContract({ address: REGISTRAR, abi, functionName: "getRegisterPrice", args: [LABEL, DURATION, USDC] });
console.log(`${LABEL}.eth: ${Number(base + premium) / 1e6} USDC for a year, owner ${account.address}`);
const secret = keccak256(toHex(`sereno-${LABEL}-${Date.now()}`));
const commitment = await pub.readContract({ address: REGISTRAR, abi, functionName: "makeCommitment", args: [LABEL, account.address, secret, zeroAddress, zeroAddress, DURATION, REFERRER] });
await send("commit", { address: REGISTRAR, abi, functionName: "commit", args: [commitment] });
const wait = Number(await pub.readContract({ address: REGISTRAR, abi, functionName: "MIN_COMMITMENT_AGE" })) + 15;
console.log(`waiting ${wait}s for the commitment to age`);
await new Promise((r) => setTimeout(r, wait * 1000));
const allowance = () => pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [account.address, REGISTRAR] });
if ((await allowance()) < base + premium) {
  await send("approve USDC", { address: USDC, abi: erc20Abi, functionName: "approve", args: [REGISTRAR, base + premium] });
}
// public RPCs are load-balanced: wait until the approval is visible before estimating the registration
for (let i = 0; i < 20; i++) {
  if ((await allowance()) >= base + premium) break;
  await new Promise((r) => setTimeout(r, 3000));
}
await send(`register ${LABEL}.eth`, { address: REGISTRAR, abi, functionName: "register", args: [LABEL, account.address, secret, zeroAddress, zeroAddress, DURATION, USDC, REFERRER] });
