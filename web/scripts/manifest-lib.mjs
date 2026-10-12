import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, relative, join } from "node:path";
import { keccak256, toBytes } from "viem";
export const root = fileURLToPath(new URL("../../", import.meta.url));
export const dist = resolve(root, "dist");
export const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
export const abiHash = (abi) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const json = async (path) => JSON.parse(await readFile(path, "utf8"));
export const same = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export async function inputs() {
  const handoff = await json(
    resolve(root, "web/config/deployment-handoff.json"),
  );
  const chain = await json(resolve(root, "web/config/network-handoff.json"));
  if (handoff.version !== 1 || handoff.chainId !== chain.network.chainId)
    throw Error("Handoff version or chain mismatch");
  // If original assignment inputs are still present, fail closed on any divergence.
  for (const [name, copy] of [
    ["deployment", handoff],
    ["network", chain],
  ]) {
    try {
      const pinned = await json(resolve(root, `.imd/reads/${name}.json`));
      if (!same(copy, pinned))
        throw Error(`Pinned ${name} differs from the retained build input`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { handoff, chain };
}
export function pinnedAbi(handoff, contract) {
  const path = `docs/abi/${contract.name}.json`;
  const bytes = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:${path}`],
    { cwd: root },
  );
  const abi = JSON.parse(bytes.toString());
  if (!Array.isArray(abi) || abiHash(abi) !== contract.abiHash)
    throw Error(`Pinned ABI hash mismatch: ${contract.name}`);
  return { bytes, abi };
}
export async function files(dir = dist) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isSymbolicLink()) throw Error("Export cannot contain symlinks");
    if (item.isDirectory()) result.push(...(await files(path)));
    else if (item.isFile())
      result.push(relative(dist, path).split("\\").join("/"));
  }
  return result.sort();
}
