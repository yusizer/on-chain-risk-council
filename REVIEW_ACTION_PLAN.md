# Review Action Plan

This file preserves the deep review context so work can resume after an interruption.

## Status (2026-07-08)

- Resolved (safety/correctness): the guardrail-critical `reversible` field is now
  derived **only** from trusted structure (recognised action kind / serialized
  instructions), never from the LLM or user text. `intake.ts` uses
  `deterministic.reversible ?? false`; `actionExtract.ts` asserts `reversible=true`
  only for genuinely undoable kinds (revoke delegate, create token account) and
  ignores user `reversible/refundable` claims. New test
  `tests/reversible-invariant.test.ts` locks this in. This also unblocks a real
  APPROVE demo path (revoke/create) so the UI shows execute/escalate/reject.
- Resolved: cross-debate monotonicity (`preserveSafetyFloor` keeps blocking
  flags + never downgrades a prior vote); Serial SPL opcodes
  ApproveChecked/MintToChecked/BurnChecked; `council-no-memory` memory isolation;
  benchmark `errorRate` metric; lone-agent purity; guardrail records all fired
  rules; devnet rejected at schema; shallow `/api/health` + deep/schema variant.
- Added: real Wormhole/Cashio exploit signatures seeded into pgvector memory
  (`lib/exploitSeeds.ts` `REAL_EXPLOIT_SEEDS`) so `council-full` recalls ACTUAL
  exploits; GitHub Actions CI (`.github/workflows/ci.yml`); tests for the
  `reversible` invariant and the council gate.
- Verified clean on 2026-07-08 (after fixes): `npx tsc --noEmit`, `npm run lint`,
  `npm test` (7/7). Run `npm run build` once before pushing.
- Remaining submit blockers (not code): (1) record + upload the ~3-min demo
  video and replace `TODO_YOUTUBE_URL_AFTER_RECORDING` in `SUBMISSION.md`;
  (2) record the short Alibaba deployment proof video (separate from the demo);
  (3) make the GitHub repo public with MIT visible in About and push all
  qwen-risk-council changes to the `qwen` remote; (4) optionally regenerate the
  benchmark artifact with `npm run bench` so the dashboard reflects the latest
  model/code.
- Known non-blocking risk: `npm audit --audit-level=moderate` reports 9 moderate
  vulnerabilities (next/postcss, drizzle-kit/esbuild, @solana/web3.js/uuid);
  fixes are breaking — do not force-fix before submit.
- MCP server shares the in-process concurrency slot and stores only a global last
  decision (acceptable for the demo; note in docs if asked).

## Critical

- Submit readiness: code is healthy, but final submit is not complete until the
  demo video URL is recorded/uploaded and current changes are committed/pushed to
  the `qwen` remote.
- Repo state: stage only intended qwen-risk-council files and push to the `qwen`
  remote; the project lives under a parent git repo.
- Devpost text is incomplete: replace `TODO_YOUTUBE_URL_AFTER_RECORDING` in
  `SUBMISSION.md` after recording the demo, and add the Alibaba deployment
  recording per the hackathon proof requirements.

## High

- Serialized SPL Token decoder misses common checked opcodes (`ApproveChecked`, `MintToChecked`, `BurnChecked`) and should conservatively flag unresolved v0 address lookup usage.
- `council-no-memory` is not isolated from memory when `DATABASE_URL` is set.
- Benchmark runner treats crashes as safe escalations, which can improve malicious recall during outages. Metrics must report errors separately.
- `lone-agent` baseline uses intake/Helius/deterministic extraction despite docs saying pure single model.
- Public API endpoints now support optional `COUNCIL_API_TOKEN`, `COUNCIL_MAX_ACTIVE`, `COUNCIL_MAX_PER_WINDOW`, and `COUNCIL_WINDOW_MS`; remaining production risk is that limits are in-process, not distributed/persistent.
- UI cancel now passes the request abort signal into council execution; verify provider/subprocess cleanup under disconnects.
- Qwen calls now use `QWEN_TIMEOUT_MS`; Helius timeout still needs stuck-subprocess cleanup verification.

## Medium

- Guardrail `rules` only records rules that changed the outcome; audit can hide deterministic reasons.
- `network: devnet` is now rejected at schema validation until Helius MCP cluster routing is implemented.
- `/api/health` is now shallow liveness only; use `/api/health?deep=1&schema=1` for provider/DB/schema proof checks.
- MCP server shares the concurrency slot and stores only a global last decision.
- DB SSL uses `rejectUnauthorized: false` under `PGSSLMODE=require`.
- Non-submission architecture docs still overclaim `getTokenAccounts` usage; update if edit scope expands beyond the submission/deploy docs.

## Missing Verification

- No test script, no test files, no CI workflow.
- Smoke/probe/proof scripts are not strict pass/fail tests.

## Fix Order

1. Core safety invariants: cross-debate monotonicity, trusted reversibility, token decoding, guardrail audit rules.
2. Benchmark integrity: memory isolation, error metrics, dataset/docs/dashboard sync.
3. Runtime hardening: verify cancellation/provider cleanup, tune in-process API token/rate limits, and decide whether distributed limits are needed beyond the demo.
4. Tests: deterministic extractor, guardrail, benchmark metrics, council gate.
5. Final verification: `npm test`, `npx tsc`, `npm run lint`, `npm run build`, optional live smoke/bench only when ready to spend API credits.
