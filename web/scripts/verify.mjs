import assert from "node:assert/strict";
import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  dist,
  inputs,
  pinnedAbi,
  files,
  sha256,
  abiHash,
  same,
  json,
} from "./manifest-lib.mjs";
const { handoff, chain } = await inputs();
const manifest = await json(resolve(dist, "imd-deployment.json"));
const keys = [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
  "contracts",
  "assets",
  "network",
  ...(chain.walletAddChain ? ["walletAddChain"] : []),
  ...(handoff.poolKey ? ["poolKey"] : []),
];
assert.deepEqual(Object.keys(manifest).sort(), keys.sort());
for (const key of [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
  "poolKey",
])
  assert.ok(same(manifest[key], handoff[key]), key);
assert.ok(same(manifest.network, chain.network));
assert.ok(same(manifest.walletAddChain, chain.walletAddChain));
assert.equal(manifest.contracts.length, handoff.contracts.length);
const safePath = (p) =>
  typeof p === "string" &&
  !p.startsWith("/") &&
  !p.includes("..") &&
  !p.includes("\\") &&
  !p.includes(":") &&
  /^[\w./-]+$/.test(p);
for (const c of handoff.contracts) {
  const found = manifest.contracts.find((v) => v.name === c.name);
  assert.ok(
    found && found.address === c.address && found.abiHash === c.abiHash,
    c.name,
  );
  assert.deepEqual(
    Object.keys(found).sort(),
    ["name", "address", "abiHash", "abiPath"].sort(),
  );
  assert.ok(safePath(found.abiPath));
  const bytes = await readFile(resolve(dist, found.abiPath));
  assert.deepEqual(bytes, pinnedAbi(handoff, c).bytes);
  assert.equal(abiHash(JSON.parse(bytes)), c.abiHash);
}
const exported = (await files()).filter((p) => p !== "imd-deployment.json");
assert.deepEqual(manifest.assets.map((a) => a.path).sort(), exported);
assert.ok(exported.includes("index.html") && exported.length <= 128);
let total = (await lstat(resolve(dist, "imd-deployment.json"))).size;
for (const { path, sha256: hash } of manifest.assets) {
  assert.ok(safePath(path));
  const bytes = await readFile(resolve(dist, path));
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(sha256(bytes), hash, path);
  assert.ok(bytes.length <= 8388608);
  total += bytes.length;
}
assert.ok(total < 16 * 1024 * 1024, "Export must leave HTTP budget headroom");
const html = await readFile(resolve(dist, "index.html"), "utf8");
assert.ok(!/(?:src|href)="\/(?!\/)/.test(html), "Root absolute asset URL");
console.log(
  JSON.stringify(
    {
      result: "PASS",
      assets: exported.length,
      totalExportBytes: total,
      canonicalAbiHashes: manifest.contracts.map((c) => ({
        name: c.name,
        hash: c.abiHash,
      })),
      poolKeyExact: true,
      networkExact: true,
      sourceCommit: manifest.sourceCommit,
    },
    null,
    2,
  ),
);
