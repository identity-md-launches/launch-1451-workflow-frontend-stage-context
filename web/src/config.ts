import {
  createPublicClient,
  createWalletClient,
  defineChain,
  fallback,
  http,
  custom,
  isAddress,
  keccak256,
  toBytes,
  parseAbi,
  type Abi,
  type Address,
} from "viem";
import type { Deployment, Runtime, WalletProvider } from "./types";

export const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [
              key,
              canonical((value as Record<string, unknown>)[key]),
            ]),
        )
      : value;
export const canonicalHash = (value: unknown) =>
  keccak256(toBytes(JSON.stringify(canonical(value)))).slice(2);
const safePath = (path: string) =>
  /^[\w./-]+$/.test(path) && !path.startsWith("/") && !path.includes("..");
async function getJson(path: string) {
  if (!safePath(path))
    throw Error("Unsafe deployment asset path. Reload a verified export.");
  const response = await fetch(
    new URL(path, new URL("./", window.location.href)),
    { cache: "no-cache" },
  );
  if (!response.ok)
    throw Error(`Unable to load ${path}. Check the static export and retry.`);
  return response.json();
}
export async function loadRuntime(): Promise<Runtime> {
  const deployment = (await getJson("imd-deployment.json")) as Deployment;
  const allowed = [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "contracts",
    "assets",
    "poolKey",
    "network",
    "walletAddChain",
  ];
  if (
    Object.keys(deployment).some((key) => !allowed.includes(key)) ||
    deployment.version !== 1 ||
    !Number.isSafeInteger(deployment.chainId) ||
    deployment.chainId !== deployment.network?.chainId ||
    !deployment.network.rpcUrls.length
  )
    throw Error("Invalid deployment configuration. Use a verified export.");
  if (
    deployment.network.rpcUrls.some((url) => !url.startsWith("https://")) ||
    !deployment.network.explorer.startsWith("https://")
  )
    throw Error("Deployment network URLs must use HTTPS.");
  if (
    deployment.walletAddChain &&
    BigInt(deployment.walletAddChain.chainId) !== BigInt(deployment.chainId)
  )
    throw Error("Wallet configuration has a different chain.");
  const contracts: Runtime["contracts"] = {};
  for (const contract of deployment.contracts) {
    if (
      !isAddress(contract.address) ||
      !/^[a-f0-9]{64}$/.test(contract.abiHash) ||
      contracts[contract.name]
    )
      throw Error("Invalid contract configuration.");
    const abi = (await getJson(contract.abiPath)) as Abi;
    if (!Array.isArray(abi) || canonicalHash(abi) !== contract.abiHash)
      throw Error(
        `The ${contract.name} ABI failed its integrity check. Transactions are disabled.`,
      );
    contracts[contract.name] = { address: contract.address, abi };
  }
  if (!contracts.Tribunal || !contracts.LaunchToken)
    throw Error("Deployment is missing Tribunal or LaunchToken.");
  const key = deployment.poolKey;
  if (
    key &&
    (!isAddress(key.currency0) ||
      !isAddress(key.currency1) ||
      !isAddress(key.hooks) ||
      BigInt(key.currency0) >= BigInt(key.currency1))
  )
    throw Error("The deployed pool key is invalid.");
  return { deployment, contracts };
}
export function chainOf(runtime: Runtime) {
  const { deployment: d } = runtime;
  return defineChain({
    id: d.chainId,
    name: d.network.name,
    nativeCurrency: d.network.nativeCurrency,
    rpcUrls: { default: { http: d.network.rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: d.network.explorer } },
  });
}
export function publicClient(runtime: Runtime, provider?: WalletProvider) {
  const transports = runtime.deployment.network.rpcUrls.map((url) =>
    http(url, { batch: { wait: 20 }, timeout: 8000, retryCount: 0 }),
  );
  return createPublicClient({
    chain: chainOf(runtime),
    transport: fallback(
      [
        ...transports,
        ...(provider ? [custom(provider, { retryCount: 0 })] : []),
      ],
      { retryCount: 0 },
    ),
    pollingInterval: 4000,
  });
}
export type ReadClient = ReturnType<typeof publicClient>;
export const walletClient = (
  runtime: Runtime,
  provider: WalletProvider,
  account: Address,
) =>
  createWalletClient({
    chain: chainOf(runtime),
    account,
    transport: custom(provider, { retryCount: 0 }),
  });

// Protocol interfaces have no addresses; all destinations are read from the runtime manifest.
export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);
export const permit2Abi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
export const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);
export const intakeAbi = parseAbi([
  "function priceOf(bytes32 action,address asset) view returns (uint256)",
]);
