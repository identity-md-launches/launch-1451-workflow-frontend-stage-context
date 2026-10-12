import { zeroAddress, type Address } from "viem";
import { erc20Abi, type ReadClient } from "./config";
import { eq } from "./domain";
import type { ChainState, Market, OracleConfig, Runtime, Token } from "./types";
export async function verifyDeployment(client: ReadClient, runtime: Runtime) {
  if ((await client.getChainId()) !== runtime.deployment.chainId)
    throw Error("RPC returned the wrong chain. Transactions are disabled.");
  const codes = await Promise.all(
    runtime.deployment.contracts.map((c) =>
      client.getCode({ address: c.address }),
    ),
  );
  if (codes.some((code) => !code || code === "0x"))
    throw Error(
      "A deployed contract has no code on this network. Transactions are disabled.",
    );
}
export async function tokenInfo(
  client: ReadClient,
  address: Address,
): Promise<Token> {
  const [name, symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
  ]);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw Error("Token decimals are unsupported. Transactions are disabled.");
  return { address, name, symbol, decimals };
}
const configTuple = (value: unknown): OracleConfig => {
  const [intake, asset, action, price] = value as [
    Address,
    Address,
    `0x${string}`,
    bigint,
  ];
  return { intake, asset, action, price };
};
export async function readMarket(
  client: ReadClient,
  runtime: Runtime,
  id: bigint,
  account?: Address,
  blockNumber?: bigint,
): Promise<Market> {
  const contract = runtime.contracts.Tribunal;
  const market = (await client.readContract({
    ...contract,
    functionName: "getMarket",
    args: [id],
    blockNumber,
  })) as Omit<Market, "id">;
  const position = account
    ? ((await client.readContract({
        ...contract,
        functionName: "positions",
        args: [id, account],
        blockNumber,
      })) as [bigint, bigint, boolean])
    : undefined;
  return {
    ...market,
    id,
    ...(position
      ? {
          position: { yes: position[0], no: position[1], claimed: position[2] },
        }
      : {}),
  };
}
export async function readState(
  client: ReadClient,
  runtime: Runtime,
  account?: Address,
  page = 0,
): Promise<ChainState> {
  await verifyDeployment(client, runtime);
  const block = await client.getBlock();
  const names = [
    "marketCount",
    "owner",
    "pendingOwner",
    "verdictToken",
    "oracleSigner",
    "pendingSigner",
    "signerActivateAfter",
    "oracleConfig",
    "pendingOracleConfig",
    "configActivateAfter",
    "CREATOR_BOND",
    "MIN_BET",
    "verdictLiability",
  ];
  const values = await Promise.all(
    names.map((functionName) =>
      client.readContract({
        ...runtime.contracts.Tribunal,
        functionName,
        blockNumber: block.number,
      }),
    ),
  );
  const [
    marketCount,
    owner,
    pendingOwner,
    verdictToken,
    signer,
    pendingSigner,
    signerActivateAfter,
    oracle,
    pendingOracle,
    configActivateAfter,
    bond,
    minBet,
    liability,
  ] = values as [
    bigint,
    Address,
    Address,
    Address,
    Address,
    Address,
    bigint,
    unknown,
    unknown,
    bigint,
    bigint,
    bigint,
    bigint,
  ];
  const active = configTuple(oracle);
  const [token, payment] = await Promise.all([
    tokenInfo(client, runtime.contracts.LaunchToken.address),
    tokenInfo(client, active.asset),
  ]);
  if (!eq(verdictToken, zeroAddress) && !eq(verdictToken, token.address))
    throw Error(
      "Tribunal is configured with a different token than the attested launch. Transactions are disabled.",
    );
  const top = marketCount - BigInt(page * 8);
  const ids = Array.from(
    { length: Math.max(0, Number(top > 8n ? 8n : top)) },
    (_, i) => top - BigInt(i),
  );
  const [markets, escrow, balances] = await Promise.all([
    Promise.all(
      ids.map((id) => readMarket(client, runtime, id, account, block.number)),
    ),
    client.readContract({
      ...runtime.contracts.Tribunal,
      functionName: "oracleEscrow",
      args: [active.asset],
      blockNumber: block.number,
    }) as Promise<bigint>,
    account
      ? Promise.all([
          client.readContract({
            address: token.address,
            abi: runtime.contracts.LaunchToken.abi,
            functionName: "balanceOf",
            args: [account],
            blockNumber: block.number,
          }) as Promise<bigint>,
          client.readContract({
            address: payment.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
            blockNumber: block.number,
          }),
          client.getBalance({ address: account, blockNumber: block.number }),
        ])
      : undefined,
  ]);
  return {
    block: block.number,
    timestamp: Number(block.timestamp),
    fetchedAt: Date.now(),
    marketCount,
    owner,
    pendingOwner,
    verdictToken,
    signer,
    pendingSigner,
    signerActivateAfter,
    oracle: active,
    pendingOracle: configTuple(pendingOracle),
    configActivateAfter,
    token,
    payment,
    bond,
    minBet,
    liability,
    escrow,
    markets,
    ...(balances
      ? {
          balance: balances[0],
          paymentBalance: balances[1],
          nativeBalance: balances[2],
        }
      : {}),
  };
}
