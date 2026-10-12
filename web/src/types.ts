import type { Abi, Address, Hex, EIP1193Provider } from "viem";
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type Token = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: unknown[];
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
    pairToken?: Token;
    otherPairTokens?: (Token & { id: string })[];
  };
  walletAddChain?: {
    chainId: Hex;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: Deployment["network"]["nativeCurrency"];
    blockExplorerUrls: string[];
  };
};
export type Runtime = {
  deployment: Deployment;
  contracts: Record<string, { address: Address; abi: Abi }>;
};
export type OracleConfig = {
  intake: Address;
  asset: Address;
  action: Hex;
  price: bigint;
};
export type Position = { yes: bigint; no: bigint; claimed: boolean };
export type Market = {
  id: bigint;
  creator: Address;
  state: number;
  closeTime: bigint;
  resolveAfter: bigint;
  requestedAt: bigint;
  deadline: bigint;
  panelSize: number;
  quorum: number;
  oracleSpent: boolean;
  burnPaid: boolean;
  signer: Address;
  oracle: OracleConfig;
  requestId: Hex;
  boundDigest: Hex;
  failureReason: Hex;
  yesPool: bigint;
  noPool: bigint;
  claimedWinnerStake: bigint;
  paidProfit: bigint;
  title: string;
  oracleBody: Hex;
  position?: Position;
};
export type ChainState = {
  block: bigint;
  timestamp: number;
  fetchedAt: number;
  marketCount: bigint;
  owner: Address;
  pendingOwner: Address;
  verdictToken: Address;
  signer: Address;
  pendingSigner: Address;
  signerActivateAfter: bigint;
  oracle: OracleConfig;
  pendingOracle: OracleConfig;
  configActivateAfter: bigint;
  token: Token;
  payment: Token;
  bond: bigint;
  minBet: bigint;
  liability: bigint;
  escrow: bigint;
  balance?: bigint;
  paymentBalance?: bigint;
  nativeBalance?: bigint;
  markets: Market[];
};
export type WalletProvider = EIP1193Provider & {
  on?: (event: string, callback: (...args: any[]) => void) => void;
  removeListener?: (event: string, callback: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
};
export type WalletOption = {
  id: string;
  name: string;
  provider: WalletProvider;
};
export type TxStatus = {
  stage: "simulating" | "signature" | "confirming" | "confirmed" | "error";
  label: string;
  message?: string;
  hash?: Hex;
};
