<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repository Notes

- This project is nested under a parent git repo; run npm commands in `qwen-risk-council/`, but inspect git from `01-solana-agents-skills/`. The on-chain council remote is `qwen` (`https://github.com/yusizer/on-chain-risk-council.git`), not the parent `origin`.
- Before resuming interrupted bugfix work, read `REVIEW_ACTION_PLAN.md`; it records the current review findings and fix order.
- Do not read or print `.env`. Scripts load it with Node's `--env-file=.env`; use `.env.example` for variable names.

# Commands

- Install: `npm install`.
- Dev server: `npm run dev` then open `http://localhost:3000` and `/benchmark`.
- Fast local verification that does not spend API credits: `npx tsc --noEmit --incremental false --pretty false`, then `npm run lint`, then `npm run build`.
- Tests: `npm test` runs the offline suite in `tests/` (deterministic extractor, guardrail, benchmark metrics, the `reversible`-trust invariant, and the council gate). They need no API keys.
- Live/expensive scripts use real Qwen/Helius and may touch the DB: `npm run smoke`, `npm run probe:helius`, `npm run bench`, `npm run proof`. Run them only when needed.
- MCP server entrypoint: `npm run mcp` (`mcp-server/server.ts`, stdio).

# Architecture Boundaries

- App/UI: `app/page.tsx`; benchmark dashboard: `app/benchmark/page.tsx`; API routes: `app/api/{actions,stream,health}/route.ts`.
- Council flow is wired in `orchestrator/council.ts`: intake -> specialists + simulator -> cross-debate -> referee -> deterministic guardrail.
- Agents live in `agents/`; shared schemas are in `lib/types.ts`; deterministic safety extraction is in `lib/actionExtract.ts`; final safety ratchet is `lib/guardrail.ts`.
- Helius MCP is consumed through `lib/helius-mcp.ts`; the project also exposes its own MCP tools from `mcp-server/server.ts`.
- DB/pgvector memory and audit log are in `lib/db.ts`; Alibaba ECS proof/deploy files are under `alibaba/`.

# Safety And Verification Gotchas

- Guardrail-critical fields (`authorityChanges`, `reversible`, `stakes`, `amountUsd`) must come from trusted parsing/deterministic extraction, not free-text agent reasoning or user claims.
- Cross-debate must never make a prior agent vote less safe or drop a `blocking_flag`; preserve safety evidence when revising votes.
- Benchmark numbers in docs/dashboard may be stale versus `benchmark/dataset.ts`; verify `datasetSize` in `benchmark/results/*.json` before quoting metrics.
- `council-no-memory` must stay memory-disabled even when `DATABASE_URL` is set; `council-full` is the memory-enabled arm.
- `helius-mcp` calls require injected telemetry params (`_feedback`, `_feedbackTool`, `_model`) in `lib/helius-mcp.ts`; omitting them causes MCP `-32602` validation errors.
- After standalone scripts that use Helius, call/keep `closeHelius()` cleanup to avoid orphan MCP subprocesses.
