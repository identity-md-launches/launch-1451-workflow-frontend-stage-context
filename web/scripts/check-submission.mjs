// Git writes are confined to a disposable /tmp repository, never the mounted .git.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { root, json } from "./manifest-lib.mjs";
const git = (args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
  .split("\0")
  .filter(Boolean);
const changed = git(["diff", "HEAD", "--name-only", "-z"])
  .split("\0")
  .filter(Boolean);
const deleted = new Set(git(["ls-files", "--deleted", "-z"]).split("\0"));
const allowed = (p) =>
  p === ".imd-responses.json" ||
  ((p.startsWith("web/") || p.startsWith("dist/") || p.startsWith("docs/")) &&
    (p === "web/.gitignore" ||
      !p.split("/").some((part) => part.startsWith("."))));
const extras = [...changed, ...untracked].filter(
  (path) => !path.startsWith("test/scratch/"),
);
assert.ok(
  extras.every(allowed),
  `Out-of-scope working tree paths: ${extras.filter((p) => !allowed(p)).join(", ")}`,
);
assert.ok(
  !git(["ls-files", "--stage"])
    .split("\n")
    .some((line) => line.startsWith("160000 ")),
  "A submodule exists",
);
const submitted = [...new Set([...tracked, ...untracked.filter(allowed)])]
  .filter((p) => !p.startsWith("test/scratch/") && !deleted.has(p))
  .sort();
assert.ok(
  !submitted.some((p) =>
    /(^|\/)(node_modules|\.npm|\.cache|\.vite|vendor\/npm)(\/|$)|\.tgz$/.test(
      p,
    ),
  ),
  "Dependency/cache packaging artifact",
);
let totalFileBytes = 0;
for (const path of submitted)
  totalFileBytes += (await stat(resolve(root, path))).size;
const tmp = await mkdtemp(join(tmpdir(), "tribunal-submission-"));
let bundleBytes;
try {
  const gitDir = join(tmp, "snapshot.git");
  execFileSync("git", ["init", "--bare", gitDir], { stdio: "pipe" });
  const args = [`--git-dir=${gitDir}`, `--work-tree=${root}`];
  execFileSync(
    "git",
    [...args, "add", "--pathspec-from-file=-", "--pathspec-file-nul"],
    {
      cwd: root,
      input: submitted.join("\0") + "\0",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  execFileSync(
    "git",
    [
      ...args,
      "-c",
      "user.name=Tribunal validation",
      "-c",
      "user.email=validation@example.invalid",
      "commit",
      "-m",
      "Disposable submission size check",
    ],
    { cwd: root, stdio: "pipe" },
  );
  const bundle = join(tmp, "submission.bundle");
  execFileSync(
    "git",
    [`--git-dir=${gitDir}`, "bundle", "create", bundle, "HEAD"],
    { stdio: "pipe" },
  );
  bundleBytes = (await stat(bundle)).size;
  assert.ok(
    bundleBytes <= 8388608,
    `Submission snapshot bundle is ${bundleBytes} bytes`,
  );
} finally {
  await rm(tmp, { recursive: true, force: true });
}
const deployment = await json(resolve(root, "dist/imd-deployment.json"));
console.log(
  JSON.stringify(
    {
      result: "PASS",
      scope:
        "Only web/**, dist/** and docs/**; explicit web/.gitignore and revision .imd-responses.json exceptions; test/scratch excluded",
      changedOrNewFiles: extras.length,
      fullSnapshotFiles: submitted.length,
      totalFileBytes,
      fullSnapshotBundleBytes: bundleBytes,
      limit: 8388608,
      exportAssets: deployment.assets.length,
      gitCommit:
        "Not created in mounted checkout: .git is read-only. Size measured with a disposable complete working-tree Git snapshot; historical objects are not included.",
    },
    null,
    2,
  ),
);
