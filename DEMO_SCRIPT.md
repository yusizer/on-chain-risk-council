# Demo video script — On-Chain Risk Council (~3 min)

Record with the local dev server (no Alibaba needed). Run `npm run dev`, then
record the browser at `http://localhost:3000`. Narrate the scenes below.

## Pre-roll (title card, 5s)
**On-Chain Risk Council** — a multi-agent society that reviews Solana actions
before they execute. Track 3: Agent Society. Qwen Cloud hackathon.

## Scene 1 — Problem (15s)
Solana drainers stole $300M+ from 324k+ users. The naive defense — "ask an LLM
is this tx safe" — confidently approves irreversible attacks it has never seen,
and has no hard safety floor. We need multiple perspectives **and** a
deterministic guardrail.

## Scene 2 — Architecture (20s)
Show `docs/architecture.png` (or the mermaid in `ARCHITECTURE.md`).
Walk the flow: intake → 3 specialists (risk / exploit-skeptic / compliance) ‖
simulator → cross-debate → referee → **deterministic guardrail** → outcome.
Mention double MCP: consumes Helius MCP, exposes itself as an MCP server.

## Scene 3 — Live council chamber, drainer → REJECT (75s)
- Browser: `http://localhost:3000` (council chamber).
- Keep the default intent: *"setAuthority on SPL mint XYZ to a freshly-funded
  unknown wallet, then transfer all holder tokens to it"*.
- Click **Convene Council**.
- Narrate the SSE stream as it arrives:
  - intake classifies → `authority_delegation`, high stakes, irreversible.
  - Round 1: riskAnalyst, exploitSkeptic, compliance vote cards fill in.
  - simulator: skipped (intent, no serialized tx).
  - Round 2: cross-debate revision.
  - referee votes last (qwen3.7-max).
- Final card: **REJECT**, unanimous, tokens + latency.
- Point out the `blocking_flag` chips on the vote cards.

## Scene 4 — Held-back moment (30s)
- Submit a clean-ish but **irreversible** action, e.g.
  *"transfer 12 SOL to a new counterparty for an OTC deal"* (irreversible, high
  stakes, no authority change).
- If the council approves (execute) but the guardrail escalates → the amber
  **⚠ Held back despite consensus** banner appears. Narrate: "the council said
  approve, but the deterministic guardrail overrode it — irreversible +
  high-stakes → human review. Consensus is necessary, never sufficient."

## Scene 5 — Benchmark dashboard (30s)
- Browser: `http://localhost:3000/benchmark`.
- Show the metrics table: lone-agent vs council-no-memory.
  - Both 100% malicious recall / 0% false-approve.
  - Council edge = **guaranteed safety floor** (guardrail never approves
    irreversible).
  - Council over-blocks clean (falseReject) — the safety/throughput trade-off.
- Per-action outcomes table — show the real Wormhole signatures (r1, r2) → reject.

## Scene 6 — Double MCP (20s)
- Editor: `mcp-server/server.ts`. Show the three tools: `submitAction`,
  `getDecision`, `getBenchmark`.
- Narrate: "any AI client — Claude, Cursor, a wallet agent — can request a
  review over MCP. Council-as-a-tool is the productization story."
- (Optional) Terminal: `npm run mcp` → "[on-chain-risk-council] MCP server
  ready on stdio".

## Scene 7 — Close (10s)
Repo + MIT license in the About. Track 3 — Agent Society. Built with Qwen
Cloud, Helius MCP, Alibaba Cloud RDS pgvector. "Consensus is necessary, never
sufficient."

---

## Recording checklist
- [ ] `npm run dev` running, both pages load.
- [ ] Browser width ~1280px, dark theme (chamber is dark).
- [ ] Submit drainer intent first (Scene 3) so the stream is ready to narrate.
- [ ] Have the held-back action text ready (Scene 4).
- [ ] `/benchmark` has results (run `npm run bench` first if empty).
- [ ] Upload to YouTube public, paste link into Devpost + `SUBMISSION.md`.
