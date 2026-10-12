import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dist, inputs, pinnedAbi, files, sha256 } from "./manifest-lib.mjs";
const { handoff, chain } = await inputs();
await mkdir(resolve(dist, "abi"), { recursive: true });
const contracts = [];
for (const contract of handoff.contracts) {
  const { bytes } = pinnedAbi(handoff, contract);
  const abiPath = `abi/${contract.name}.json`;
  await writeFile(resolve(dist, abiPath), bytes);
  contracts.push({
    name: contract.name,
    address: contract.address,
    abiHash: contract.abiHash,
    abiPath,
  });
}
const assets = [];
for (const path of (await files()).filter((p) => p !== "imd-deployment.json")) {
  const bytes = await readFile(resolve(dist, path));
  if (bytes.length > 8388608) throw Error(`Oversize asset: ${path}`);
  assets.push({ path, sha256: sha256(bytes) });
}
if (assets.length > 128) throw Error("Too many exported assets");
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: chain.network,
  ...(chain.walletAddChain ? { walletAddChain: chain.walletAddChain } : {}),
};
await writeFile(
  resolve(dist, "imd-deployment.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await import("./verify.mjs");
