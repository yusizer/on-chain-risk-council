# Demo video script — On-Chain Risk Council (~3 min)

Record against the Alibaba ECS live URL after opening Security Group TCP `3000`:
`http://43.106.15.232:3000`. Local fallback: run `npm run dev`, then record
`http://localhost:3000`. Narrate the scenes below.

Fastest recording path: run the one-command terminal demo bot while recording
the screen:

```bash
npm run demo:record
```

Dry run without Qwen/Helius calls:

```bash
DEMO_DRY_RUN=1 npm run demo:record
```

Optional envs: `DEMO_LOCAL=1` for localhost, `DEMO_AUTO_OPEN=0` to avoid browser
tabs, `DEMO_SKIP_HELD_BACK=1` to skip the second council review, `DEMO_FAST=1`
for shorter pauses.

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
Mention deterministic extraction: intent/evidence parsing and serialized Solana
tx decoding happen before the LLM debate. Mention double MCP: consumes Helius
MCP, exposes itself as an MCP server.

## Scene 3 — Live council chamber, drainer → REJECT (75s)
- Browser: `http://43.106.15.232:3000` (or local fallback) — council chamber.
- Keep the default intent: *"setAuthority on SPL mint XYZ to a freshly-funded
  unknown wallet, then transfer all holder tokens to it"*.
- Or click the **Drainer reject** preset.
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
- Click the **Held-back consensus** preset, or submit:
  *"transfer 2 SOL to a known Binance deposit address with long prior transaction history"*.
- This is a clean benchmark-style action. The agents usually approve it, but the
  deterministic guardrail escalates because the action is irreversible.
- When the amber **⚠ Held back despite consensus** banner appears, narrate: "the
  council said approve, but the deterministic guardrail overrode it — consensus
  is evidence, not authorization."

## Scene 5 — Benchmark dashboard (30s)
- Browser: `http://43.106.15.232:3000/benchmark` (or local fallback).
- Show the metrics table: lone-agent vs council-no-memory.
  - Latest checked-in artifact: 19 actions (6 synthetic malicious + 4 real Wormhole/Cashio malicious + 9 clean).
  - Lone-agent: 90% malicious recall / 10% false-approve.
  - Council: 100% malicious recall / 0% false-approve.
  - Council edge = deterministic safety floor over a multi-agent society.
  - Council over-blocks clean (falseReject) — the safety/throughput trade-off.
- Per-action outcomes table — if still on the 14-action artifact, show the real
  Wormhole signatures (`r1`, `r2`): council reject/escalate; lone-agent executes.
  If a regenerated 19-action artifact exists, also point out the Cashio rows.

## Scene 6 — Double MCP (20s)
- Editor: `mcp-server/server.ts`. Show the three tools: `submitAction`,
  `getDecision`, `getBenchmark`.
- Narrate: "any AI client — Claude, Cursor, a wallet agent — can request a
  review over MCP. Council-as-a-tool is the productization story."
- (Optional) Terminal: `npm run mcp` → "[on-chain-risk-council] MCP server
  ready on stdio".

## Scene 7 — Close (10s)
Repo + MIT license in the About. Track 3 — Agent Society. Built with Qwen
Cloud, Helius MCP, Alibaba ECS + pgvector. "Consensus is necessary, never
sufficient."

---

## Recording checklist
- [x] Alibaba Security Group inbound TCP `3000` is open.
- [x] Both pages load: `/` and `/benchmark`.
- [ ] Browser width ~1280px, dark theme (chamber is dark).
- [ ] Submit drainer intent first (Scene 3) so the stream is ready to narrate.
- [ ] Use the Held-back consensus preset (Scene 4).
- [ ] `/benchmark` has results. If the stale-artifact warning is visible, either
  regenerate with `npm run bench` or disclose it in Scene 5.
- [ ] Show `alibaba/proof.json` or terminal `npm run proof` output: ECS/Qwen/Helius/DB ok.
- [ ] Upload to YouTube public, paste link into Devpost + `SUBMISSION.md`.
