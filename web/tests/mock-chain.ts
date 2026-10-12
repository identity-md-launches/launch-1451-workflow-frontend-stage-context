// Test-only chain model. These identities and case titles never enter dist/.
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeAbiParameters,
  parseAbiParameters,
  parseUnits,
  stringToHex,
  numberToHex,
  zeroAddress,
  zeroHash,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  erc20Abi,
  intakeAbi,
  permit2Abi,
  quoterAbi,
  routerAbi,
  stateViewAbi,
} from "../src/config";
import type { Market, OracleConfig } from "../src/types";
export const handoff = JSON.parse(
  readFileSync(
    new URL("../config/deployment-handoff.json", import.meta.url),
    "utf8",
  ),
);
export const network = JSON.parse(
  readFileSync(
    new URL("../config/network-handoff.json", import.meta.url),
    "utf8",
  ),
);
export const tribunalAbi = JSON.parse(
  readFileSync(
    new URL("../../docs/abi/Tribunal.json", import.meta.url),
    "utf8",
  ),
) as Abi;
export const tokenAbi = JSON.parse(
  readFileSync(
    new URL("../../docs/abi/LaunchToken.json", import.meta.url),
    "utf8",
  ),
) as Abi;
export const tribunal = handoff.contracts.find(
  (c: { name: string }) => c.name === "Tribunal",
).address as Address;
export const token = handoff.contracts.find(
  (c: { name: string }) => c.name === "LaunchToken",
).address as Address;
export const pair = network.network.pairToken.address as Address;
export const user = "0x1111111111111111111111111111111111111111" as Address;
export const other = "0x2222222222222222222222222222222222222222" as Address;
export const e18 = (n: string | number) => parseUnits(String(n), 18);
export type MockTx = {
  from: Address;
  to: Address;
  data: Hex;
  value?: Hex;
  gas?: Hex;
};
export class MockChain {
  now = Math.floor(Date.now() / 1000);
  block = 26180000n;
  owner: Address = other;
  pendingOwner: Address = zeroAddress;
  verdictToken: Address = token;
  signer: Address = handoff.manifest.contracts[0].constructorArgs[5];
  pendingSigner: Address = zeroAddress;
  signerActivateAfter = 0n;
  configActivateAfter = 0n;
  oracle = {
    intake: handoff.manifest.contracts[0].constructorArgs[1] as Address,
    asset: pair,
    action: handoff.manifest.contracts[0].constructorArgs[3] as Hex,
    price: e18(".5"),
  };
  pendingOracle: OracleConfig = {
    intake: zeroAddress,
    asset: zeroAddress,
    action: zeroHash,
    price: 0n,
  };
  calls: { address: string; fn: string; args: unknown }[] = [];
  writes: { address: string; fn: string; args: unknown; value?: Hex }[] = [];
  methods: string[] = [];
  allowance = new Map<string, bigint>();
  permit = new Map<string, [bigint, number, number]>();
  receipts = new Map<string, unknown>();
  transactions = new Map<string, unknown>();
  markets = new Map<bigint, Market>();
  failSimulation = "";
  missingCode = false;
  rejectReads = false;
  delayReceipt = false;
  pendingReceipt: { hash: Hex; receipt: unknown } | undefined;
  constructor() {
    const titles = [
      "Will the orbital research mission launch before the deadline?",
      "Will the city publish its final air-quality report on time?",
      "Will the open-source network complete its scheduled upgrade?",
      "Will the observatory confirm its first image of the new comet?",
    ];
    for (let i = 1; i <= 4; i++) {
      const state = i === 1 ? 1 : i === 2 ? 2 : i === 3 ? 3 : 1;
      const body = {
        v: 1,
        question: `${titles[i - 1]} Use the fixed observation time and the official public record in the definitions.`,
        chainId: 1,
        window: { hours: 24 },
        answerType: "bool",
        evidence: "panel",
        panelSize: 5,
        quorum: 4,
        validForSeconds: 900,
        definitions: {
          observation: new Date((this.now + 7200) * 1000).toISOString(),
          evidence: "Official public event record (mocked test data)",
          criteria:
            "YES requires a dated public confirmation by the observation time.",
        },
      };
      this.markets.set(BigInt(i), {
        id: BigInt(i),
        creator: other,
        state,
        closeTime: BigInt(i === 1 ? this.now + 3600 : this.now - 4000),
        resolveAfter: BigInt(i === 1 ? this.now + 7200 : this.now - 3600),
        requestedAt: i === 2 ? BigInt(this.now - 100) : 0n,
        deadline: BigInt(i === 2 ? this.now + 604700 : this.now + 600000),
        panelSize: 5,
        quorum: 4,
        oracleSpent: i === 2 || i === 3,
        burnPaid: false,
        signer: this.signer,
        oracle: this.oracle,
        requestId:
          i === 2 ? stringToHex("fixture-request", { size: 32 }) : zeroHash,
        boundDigest:
          i === 2 ? stringToHex("bound-digest", { size: 32 }) : zeroHash,
        failureReason: zeroHash,
        yesPool: e18(i === 1 ? 4500 : 4000),
        noPool: e18(i === 1 ? 5500 : 6000),
        claimedWinnerStake: 0n,
        paidProfit: 0n,
        title: titles[i - 1],
        oracleBody: stringToHex(JSON.stringify(body)),
        position: { yes: e18(100), no: 0n, claimed: false },
      });
    }
  }
  key(...args: unknown[]) {
    return args.map(String).join(":").toLowerCase();
  }
  abi(to: Address): Abi {
    const address = to.toLowerCase();
    if (address === tribunal) return tribunalAbi;
    if (address === token) return tokenAbi;
    if (address === pair) return erc20Abi;
    const uni = network.network.uniswapV4;
    if (address === uni.quoter) return quoterAbi;
    if (address === uni.universalRouter) return routerAbi;
    if (address === uni.permit2) return permit2Abi;
    if (address === uni.stateView) return stateViewAbi;
    if (address === this.oracle.intake.toLowerCase()) return intakeAbi;
    return erc20Abi;
  }
  blockData() {
    return {
      number: numberToHex(this.block),
      hash: stringToHex("fixture-block", { size: 32 }),
      parentHash: zeroHash,
      nonce: "0x0000000000000000",
      sha3Uncles: zeroHash,
      logsBloom: "0x" + "0".repeat(512),
      transactionsRoot: zeroHash,
      stateRoot: zeroHash,
      receiptsRoot: zeroHash,
      miner: zeroAddress,
      difficulty: "0x0",
      totalDifficulty: "0x0",
      extraData: "0x",
      size: "0x400",
      gasLimit: "0x1c9c380",
      gasUsed: "0x0",
      timestamp: numberToHex(this.now),
      transactions: [],
      uncles: [],
      baseFeePerGas: "0x3b9aca00",
      mixHash: zeroHash,
    };
  }
  result(to: Address, data: Hex) {
    const abi = this.abi(to);
    const decoded = decodeFunctionData({ abi, data });
    const fn = decoded.functionName;
    const args = (decoded.args ?? []) as any[];
    this.calls.push({ address: to.toLowerCase(), fn, args });
    if (this.failSimulation === fn) throw Error("BettingClosed");
    let result: any;
    if (to.toLowerCase() === tribunal) {
      const market =
        typeof args[0] === "bigint" ? this.markets.get(args[0]) : undefined;
      const read: Record<string, unknown> = {
        marketCount: BigInt(this.markets.size),
        owner: this.owner,
        pendingOwner: this.pendingOwner,
        verdictToken: this.verdictToken,
        oracleSigner: this.signer,
        pendingSigner: this.pendingSigner,
        signerActivateAfter: this.signerActivateAfter,
        oracleConfig: Object.values(this.oracle),
        pendingOracleConfig: Object.values(this.pendingOracle),
        configActivateAfter: this.configActivateAfter,
        CREATOR_BOND: e18(10000),
        MIN_BET: e18(100),
        verdictLiability: e18(60000),
        oracleEscrow: e18(1),
        getMarket: market,
        positions: market?.position
          ? Object.values(market.position)
          : [0n, 0n, false],
        attestationDigest: stringToHex("bound-digest", { size: 32 }),
      };
      if (Object.hasOwn(read, fn)) result = read[fn];
      else if (fn === "createMarket") result = BigInt(this.markets.size + 1);
      else if (fn === "claim") result = e18(247);
      else if (fn === "requestResolution")
        result = stringToHex("new-request", { size: 32 });
    } else if (to.toLowerCase() === network.network.uniswapV4.permit2) {
      if (fn === "allowance")
        result = this.permit.get(this.key(args[0], args[1], args[2])) ?? [
          0n,
          0,
          0,
        ];
    } else if (to.toLowerCase() === network.network.uniswapV4.quoter)
      result = [args[0].exactAmount * 2n, 120000n];
    else if (to.toLowerCase() === network.network.uniswapV4.stateView)
      result =
        fn === "getSlot0" ? [1n << 96n, 0, 0, 12500] : 100000000000000000000n;
    else if (to.toLowerCase() === network.network.uniswapV4.universalRouter)
      result = undefined;
    else if (to.toLowerCase() === this.oracle.intake)
      result = this.oracle.price;
    else {
      const verdict = to.toLowerCase() === token;
      result = (
        {
          name: verdict ? "Verdict" : "Identity.md",
          symbol: verdict ? "VERDICT" : "IMD",
          decimals: 18,
          totalSupply: e18(1000000000),
          balanceOf: e18(200000),
          allowance: this.allowance.get(this.key(to, ...args)) ?? 0n,
          approve: true,
          transfer: true,
          transferFrom: true,
        } as Record<string, unknown>
      )[fn];
    }
    return encodeFunctionResult({ abi, functionName: fn, result });
  }
  send(tx: MockTx) {
    const { functionName: fn, args: raw } = decodeFunctionData({
      abi: this.abi(tx.to),
      data: tx.data,
    });
    const args = (raw ?? []) as any[];
    this.writes.push({
      address: tx.to.toLowerCase(),
      fn,
      args,
      value: tx.value,
    });
    if (fn === "approve") {
      if (tx.to.toLowerCase() === network.network.uniswapV4.permit2)
        this.permit.set(this.key(tx.from, args[0], args[1]), [
          args[2],
          Number(args[3]),
          0,
        ]);
      else this.allowance.set(this.key(tx.to, tx.from, args[0]), args[1]);
    }
    if (fn === "betYes" || fn === "betNo") {
      const k = this.key(token, tx.from, tribunal);
      this.allowance.set(k, (this.allowance.get(k) ?? 0n) - args[1]);
      const m = this.markets.get(args[0])!;
      const side = fn === "betYes" ? "yes" : "no";
      m[side === "yes" ? "yesPool" : "noPool"] += args[1];
      m.position![side] += args[1];
    }
    if (fn === "requestResolution") {
      const m = this.markets.get(args[0])!;
      m.state = 2;
      m.requestedAt = BigInt(this.now);
      m.deadline = BigInt(this.now + 604800);
      m.oracleSpent = true;
    }
    if (fn === "voidMarket") this.markets.get(args[0])!.state = 5;
    if (fn === "claim") this.markets.get(args[0])!.position!.claimed = true;
    if (fn === "submitAttestation") this.markets.get(args[0])!.state = 3;
    if (fn === "setVerdictToken") this.verdictToken = args[0];
    if (fn === "setOracleSigner") {
      this.pendingSigner = args[0];
      this.signerActivateAfter = BigInt(this.now + 172800);
    }
    if (fn === "activateOracleSigner") {
      this.signer = this.pendingSigner;
      this.pendingSigner = zeroAddress;
      this.signerActivateAfter = 0n;
    }
    if (fn === "cancelSignerChange") {
      this.pendingSigner = zeroAddress;
      this.signerActivateAfter = 0n;
    }
    if (fn === "setIntake" || fn === "setAction" || fn === "setPayment") {
      if (!this.configActivateAfter) this.pendingOracle = { ...this.oracle };
      if (fn === "setIntake") this.pendingOracle.intake = args[0];
      if (fn === "setAction") this.pendingOracle.action = args[0];
      if (fn === "setPayment") {
        this.pendingOracle.asset = args[0];
        this.pendingOracle.price = args[1];
      }
      this.configActivateAfter = BigInt(this.now + 172800);
    }
    if (fn === "cancelOracleConfigChange") this.configActivateAfter = 0n;
    if (fn === "activateOracleConfig") {
      this.oracle = { ...this.pendingOracle };
      this.configActivateAfter = 0n;
    }
    if (fn === "transferOwnership") this.pendingOwner = args[0];
    if (fn === "acceptOwnership") {
      this.owner = this.pendingOwner;
      this.pendingOwner = zeroAddress;
    }
    if (fn === "renounceOwnership") this.owner = zeroAddress;
    if (fn === "createMarket") {
      for (const [currency, amount] of [
        [token, e18(10000)],
        [pair, this.oracle.price],
      ] as const) {
        const k = this.key(currency, tx.from, tribunal);
        this.allowance.set(k, (this.allowance.get(k) ?? 0n) - amount);
      }
      const id = BigInt(this.markets.size + 1);
      this.markets.set(id, {
        ...this.markets.get(1n)!,
        id,
        creator: tx.from,
        title: args[0],
        oracleBody: args[1],
        closeTime: args[2],
        resolveAfter: args[3],
        deadline: args[3] + 604800n,
        yesPool: 0n,
        noPool: 0n,
        position: { yes: 0n, no: 0n, claimed: false },
      });
    }
    this.block++;
    const hash = numberToHex(BigInt(this.writes.length), { size: 32 });
    this.transactions.set(hash, {
      hash,
      from: tx.from,
      to: tx.to,
      input: tx.data,
      nonce: numberToHex(this.writes.length - 1),
      value: tx.value ?? "0x0",
      gas: "0x493e0",
      gasPrice: "0x3b9aca00",
      maxFeePerGas: "0x77359400",
      maxPriorityFeePerGas: "0x3b9aca00",
      type: "0x2",
      chainId: "0x1",
      accessList: [],
      v: "0x0",
      r: zeroHash,
      s: zeroHash,
      blockHash: this.blockData().hash,
      blockNumber: numberToHex(this.block),
      transactionIndex: "0x0",
    });
    const receipt = {
      transactionHash: hash,
      transactionIndex: "0x0",
      blockHash: this.blockData().hash,
      blockNumber: numberToHex(this.block),
      from: tx.from,
      to: tx.to,
      cumulativeGasUsed: "0x186a0",
      gasUsed: "0x186a0",
      contractAddress: null,
      logs: [],
      logsBloom: "0x" + "0".repeat(512),
      status: "0x1",
      type: "0x2",
      effectiveGasPrice: "0x3b9aca00",
    };
    if (this.delayReceipt) this.pendingReceipt = { hash, receipt };
    else this.receipts.set(hash, receipt);
    return hash;
  }
  rpc(req: any): any {
    this.methods.push(req.method);
    const [a, b] = req.params ?? [];
    let result: any;
    try {
      if (this.rejectReads) throw Error("RPC unavailable");
      switch (req.method) {
        case "eth_chainId":
          result = "0x1";
          break;
        case "eth_getCode":
          result = this.missingCode ? "0x" : "0x6001600055";
          break;
        case "eth_getBlockByNumber":
          result = this.blockData();
          break;
        case "eth_blockNumber":
          result = numberToHex(this.block);
          break;
        case "eth_getBalance":
          result = numberToHex(e18(2));
          break;
        case "eth_call":
          result = this.result(a.to, a.data);
          break;
        case "eth_estimateGas":
          result = "0x493e0";
          break;
        case "eth_gasPrice":
          result = "0x3b9aca00";
          break;
        case "eth_maxPriorityFeePerGas":
          result = "0x3b9aca00";
          break;
        case "eth_getTransactionCount":
          result = "0x0";
          break;
        case "eth_getTransactionByHash":
          result = this.transactions.get(a) ?? null;
          break;
        case "eth_getTransactionReceipt":
          result = this.receipts.get(a) ?? null;
          break;
        case "eth_getLogs":
          result = [];
          break;
        case "eth_sendTransaction":
          result = this.send(a);
          break;
        default:
          throw Error(`Unsupported mock RPC: ${req.method}`);
      }
      return { jsonrpc: "2.0", id: req.id, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message: (error as Error).message },
      };
    }
  }
}
