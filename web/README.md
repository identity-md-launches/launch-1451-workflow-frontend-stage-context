# The Tribunal frontend

A static React + TypeScript application for the deployed Tribunal prediction markets and the attested VERDICT/IMD Uniswap v4 pool. The source lives in `web/`; the complete production export lives in repository-root `dist/`. Contracts and root build configuration are unchanged.

## Run and rebuild

Tested with Node 24.21.0 and npm 11.19.0. From the repository root:

```sh
cd web
npm ci
npm run typecheck
npm test
npm run build
npm run verify
npm run preview
```

`build` runs TypeScript, exports Vite with `base: './'`, copies the implementation ABIs from the pinned Git commit, and writes **then validates** `dist/imd-deployment.json`. The publisher can serve the committed export directly; it does not need to rebuild. Hash routes work under a gateway subdirectory without server rewrites. No backend, external fonts, image CDN, or secrets are required to serve the page. Live contract reads and wallet requests still need network access.

`npm run dev` runs Vite against the same manifest and ABI files in `dist/`; the development middleware serves those files without creating another runtime address map. Keep the committed export present, or run `npm run build` first.

For a literal subpath preview, run `node scripts/serve.mjs 0` from `web/`. It prints a local `/preview/` URL and stays in the foreground; stop it with Ctrl+C. The ordinary Vite preview prints its own URL.

## Deployment configuration and provenance

The browser fetches `./imd-deployment.json`, then each contract's `abiPath`. `src/config.ts` validates the manifest and canonical ABI Keccak hashes before constructing clients. This is the only runtime deployment configuration. Application contract ABIs are loaded from those referenced files, including for VERDICT writes. Small standard ERC-20, Intake-read, Permit2, StateView, Quoter, and Universal Router interfaces are also centralized in `config.ts`; their destinations come from the manifest or live Tribunal state.

Build-only inputs in `web/config/` preserve the supplied deployment and network handoffs after `.imd/reads/` is removed. They are never imported into the application bundle. When the pinned assignment inputs still exist, the builder compares the saved copies against them. The builder retrieves `docs/abi/<Contract>.json` with `git show` at deployed source commit `1d54cbd46a8850a58b36fa7af28a0b1f875310d5`, recursively sorts object keys (retaining array order), compact-serializes the ABI, and compares its Keccak-256 with the handoff. A Git clone retaining that source commit is required to rebuild; no Solidity compilation or protected-root edits are performed.

The exporter preserves the exact launch, chain, source and attestation identifiers, contract set, pool key, network object, and wallet-add-chain parameters. It inventories every other exported file using SHA-256, excluding the manifest itself. `npm run verify` checks the exact permitted top-level keys, contract/ABI binding, raw pinned ABI bytes, complete inventory, relative paths, every hash, file/count budgets, and relative entrypoint asset URLs. Run a complete build after any source/export change; editing an asset without regenerating the manifest invalidates the export.

Do not add addresses, RPC endpoints, chain tables, or alternative pools to components. A future deployment requires a new validated handoff and a regenerated export. There is no private RPC credential, WalletConnect project ID, guessed recipient, or alternate router in this app.

## Wallets and transaction behavior

EIP-6963 wallet discovery and the legacy injected EIP-1193 provider are supported. If more than one provider is discovered, the header offers a wallet selector. No WalletConnect credentials were supplied, so QR/mobile-bridge connections are not implemented. An Ethereum wallet's built-in browser can use its injected provider. Reload after installing a legacy wallet that injects late.

Connection is explicit. The app handles rejection, disconnect, account and chain changes. On unknown-chain error 4902 (including wrapped errors or an unknown-chain message), it offers the exact supplied `wallet_addEthereumChain` parameters, then switches again. Wrong-chain and unverified/stale-read states cannot submit transactions.

Public RPCs use the supplied ordered fallback transports. A connected wallet on the correct chain supplies the final read fallback. Reads verify chain ID and nonempty code for both application contracts; each transaction repeats that check and checks its target code. This is a chain/code-presence check, not independent runtime bytecode authentication. ABI integrity is verified separately.

Every write has a review dialog, a simulation, a fresh wallet account/chain check, and a per-action status. Controls lock through the receipt and refresh; only one write can be active at a time. Quotes additionally expire after 60 seconds and are checked again before signing. Repriced receipts follow the replacement hash; cancellation or a replacement with different intent is not reported as a successful requested action. Receipt tracking times out after three minutes with an explorer link and an instruction to inspect the transaction before retrying. Reloading the page clears in-memory tracking; the explorer remains the source for pending transactions.

The footer shows the read block and a manual refresh control. Background polling runs every 15 seconds while visible, refreshes when the tab becomes visible, and batches RPC requests. Data older than 60 seconds or a failed refresh disables writes. Positions are cleared on wallet changes. No real transaction was sent during worker validation.

## User flows

- **Markets:** latest eight cases, pagination, loaded-page search and filters, YES/NO stake shares, and derived closed/pending/final states. No demo cases are shipped. A zero market count has an honest empty state.
- **Case page:** exact stored question, evidence definitions, window, original Intake and signer; balances and positions; explicit VERDICT approval and YES/NO betting; Summon the jury; timeout-to-VOID; and claim eligibility/estimated entitlement. Titles never replace the stored question, and shares are not described as objective probabilities. Fees and rounding follow the implementation.
- **Create:** fixed observation timestamp, public evidence and criteria, separate close/resolution times, UTF-8-aware validation, escaped JSON preview, and an acknowledgement. Defaults are bool, panel evidence, panelSize 5, quorum 4, window 24 hours, validForSeconds 900. The form requires close ≤ observation ≤ resolution, all relative to a future betting close. Dates are entered in device-local time and reviewed in UTC. Tribunal and Intake settings/price are re-read before creation. A matured schedule can still be activated before inclusion; the contract does not provide an expected-configuration guard.
- **Trading:** buy and sell with the exact handoff pool key and the listed Uniswap v4 addresses. Quotes call `quoteExactInputSingle` by simulation. ERC-20 input uses exact token-to-Permit2 approval, then a bounded Permit2 router allowance expiring after 30 minutes, and finally `execute(0x10, inputs, deadline)`. Actions are `0x060c0f`; input ordering is computed, not assumed. Slippage is integer-rounded (0.1–5%), router deadline is 10 minutes, and ERC-20 swaps send zero native value. Native-input and six-field extended tuple encoders are tested as non-deployed variants; the actual handoff uses the standard five-field tuple and an IMD pair. No liquidity-management flow was commissioned.
- **Oracle retry:** validates the canonical 15-field object and signature encoding, obtains `attestationDigest`, compares the already-bound digest, and simulates `submitAttestation`. It does not ask a user to sign an oracle answer. Expired or unbound callbacks cannot be rescued by inventing another signature.
- **Protocol:** live custody/accounting values, explorer/copy links, ABI downloads, active/pending settings, 48-hour activation gates and recent events. The owner can lock the actual LaunchToken once, schedule/cancel settings, nominate a new owner, or explicitly acknowledge irreversible renunciation. The pending owner can accept. Permissionless activations are available to any connected wallet after their deadlines. Read-only addresses are checksummed; ENS lookup/input is not implemented.
- **Advanced token tools:** transfer, explicit allowance setting/revocation, and `transferFrom` with a fresh allowance check. Oracle callbacks (`onOracleResult`, `onOracleFailure`) and the self-only `finalizeOracleResult` are not visitor controls; the contract forbids ordinary wallets from using them.

## Validation and current deployment state

```sh
npm run test:browser
npm run format:check
node scripts/check-submission.mjs
```

The browser runner owns and closes its preview server and Chromium process. It uses the worker's available headless Chromium when present; elsewhere install Chromium with `npx playwright install chromium`, or set `TRIBUNAL_CHROMIUM` to its executable. The automated runner fulfills `/preview/` responses with the exact `dist/` bytes and intercepts public RPC requests with a deterministic, test-only model. It does not modify the manifest, ABIs, bundle, or application configuration. The initial delivery used the assigned browser tool for live HTTP inspection. This revision used installed Chromium directly against the real HTTP export and configured RPC; the connector itself could not find its expected executable. See the revision evidence for exact coverage.

The submission check rejects out-of-scope changes, caches, dependency archives and submodules, then measures a complete working-tree Git snapshot bundle in a disposable temporary repository against the 8 MiB limit. It never stages or commits the original checkout. It measures delivered files, not the upstream repository's historical Git objects.

Test fixtures remain under `web/tests/`, never in `dist/`. They exercise actual UI clicks, dialogs, EIP-1193 events and ABI-encoded calls. Screenshots named `*-mocked.png` contain test cases, not live markets. Unit checks cover ABI binding, amounts, timing, payouts/refunds/rounding, escaped request bodies, slippage, and both router tuple formats. See [the revision validation report](../docs/frontend/REVISION.md), [the initial worker validation report](../docs/frontend/VALIDATION.md) and [implemented design](../docs/DESIGN.md).

Live browser reads on 2026-10-12 confirmed Ethereum chain 1, code at both handoff contracts, zero markets, an unset Tribunal token, and no active liquidity at the pool's current price. The owner must complete the one-time token setup before market creation is usable; active liquidity is required for swaps. These are displayed as current onchain prerequisites, not filled with stand-ins. Funded transactions, actual oracle delivery, settlement, third-party wallet extensions and publication checks remain unperformed.

The delivered metadata includes product title/description/favicon and the exported 1200 × 630 `share.png`, with Open Graph dimensions/alt text and Twitter `summary_large_image`. Regenerate the committed image with `npm run share:image` using Playwright Chromium (or `TRIBUNAL_CHROMIUM`), then run `npm run build` to copy it and regenerate all manifest hashes. The generator renders the existing `CourtSeal` and CSS tokens without contacting RPCs. On a worker with read-only browser settings directories, set `XDG_CONFIG_HOME` and `XDG_CACHE_HOME` to task-specific directories under `/tmp`.

No final public domain was supplied, so the image paths remain `./share.png`, which works under an IPFS gateway subpath. When the public base URL is known, the publisher should replace both `og:image` and `twitter:image` with its absolute image URL in `web/index.html`, rebuild, and verify the regenerated manifest before pinning. Do not patch HTML after pinning or leave stale asset hashes. Actual social-crawler previews and absolute URLs remain publication checks. This worker does not publish the site or redeploy contracts. Git metadata is mounted read-only on this worker, so source/export files are provided for the worker's submission collector; local staging/committing failed at `.git/index.lock`.
