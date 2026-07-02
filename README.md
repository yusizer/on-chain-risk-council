# On-Chain Risk Council

**Track 3: Agent Society** — Global AI Hackathon Series with Qwen Cloud (Devpost).
Deadline: Jul 9, 2026 @ 21:00 UTC. Prize: $7,000 cash + $3,000 cloud credits (1 winner/track).

> A multi-agent **society** that reviews and approves high-stakes Solana actions
> (transactions / intents) before they execute. Qwen agents deliberate; a
> **deterministic one-way-ratchet guardrail** decides. On-chain simulation + an
> exploit-pattern memory close the gap that single-agent reviewers miss.

## Problem
Solana drainers and exploiters cost users hundreds of millions. A single LLM
asked "is this tx safe?" gets it wrong on novel attack patterns and confidently
approves irreversible actions. Real review needs **multiple perspectives**
(security, code, policy, simulation) and a **hard safety floor** that no fluent
agent can talk its way past.

## Solution
A council of specialised Qwen agents deliberates over each action, then a
deterministic guardrail — keyed off a **trusted** action record, never model
output — can only make the outcome **safer**. Consensus is necessary, never
sufficient: a unanimously-approved irreversible $12k-style payment is still
held back.

**Agents**
- **Intake/Router** (`qwen-turbo`) — parse + classify the action.
- **Risk Analyst** (`qwen3.7-max`) — amount, counterparty novelty, authority changes.
- **Exploit Skeptic** (`qwen3-coder-plus`) — matches known exploit patterns; pulls
  counterparty history via **Helius MCP** (`parseTransactions`, `getAccountInfo`,
  `getTokenAccounts`, wallet funding) + semantic recall over a pgvector memory.
- **Compliance/Policy** — deterministic policy rules (allowlists, limits).
- **Simulator** (`qwen` + Helius `simulateTransaction`) — fork-sim: logs, CU, account diff.
- **Referee** (`qwen3.7-max`) — aggregates the debate, votes last.
- **Guardrail** (code, not LLM) — one-way ratchet on stakes + reversibility.

**Why it beats the field.** No public competitor uses web3/Solana. Versus
*Quorum* (off-chain $ only, no simulation): we add on-chain data + simulation +
an exploit-pattern memory. Versus *Qwen Council* (toy personalities): we act on
consequential, irreversible actions with a real MCP-powered evidence layer.

## Architecture
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the diagram + component detail.

## Stack
- **Frontend / API:** Next.js 16 (App Router) + TypeScript + Tailwind.
- **LLM:** Qwen Cloud via DashScope OpenAI-compatible endpoint
  (`qwen3.7-max`, `qwen3-coder-plus`, `qwen-turbo`, `text-embedding-v3`).
- **On-chain data:** Helius MCP server (`npx helius-mcp@latest`) over stdio.
- **Memory / audit log:** Alibaba Cloud RDS PostgreSQL + **pgvector**.
- **Deployment:** Alibaba Cloud ECS (Docker) + RDS. Backend runs on Alibaba
  Cloud — proof recording in `alibaba/proof.ts` (required by the hackathon).
- **MCP (double):** (1) consumes Helius MCP tools, (2) exposes the council as
  an MCP server (`mcp-server/server.ts`) so external AI clients can request reviews.

## Setup
```bash
cp .env.example .env   # fill DASHSCOPE_API_KEY, HELIUS_API_KEY; DATABASE_URL + ALIYUN_* optional (D4/D7)
npm install
npm run dev            # http://localhost:3000  (council chamber + /benchmark dashboard)
npm run smoke          # end-to-end on a synthetic drainer intent (no DB needed) → expect reject
npm run probe:helius   # verify the Helius MCP tool surface (no LLM)
npm run bench          # benchmark: lone-agent vs council over the labelled dataset
npm run mcp            # expose the council as an MCP server (stdio) for external AI clients
```
Health check: `curl http://localhost:3000/api/health` → `{ ok, qwen, helius, db }`.

## Benchmark
`benchmark/` runs the council against a labelled set of clean + malicious Solana
actions (synthetic drainer/rugpull/fake-mint intents now; real known exploit
signatures via Helius land in D4 once `DATABASE_URL` is provisioned).
Baselines: **lone-agent** (single qwen3.7-max, no council, no guardrail — the
lone wolf most competitors ship) · **council-no-memory** (full council without
pgvector recall) · **council-full** (with memory, needs DB). Metrics: malicious
recall, false-approve rate (critical), false-reject rate, over-escalate,
clean-approve, accuracy, latency, token cost. Honest reporting incl. a
shortcut lone-agent baseline (FailureDNA-style) so a win isn't just
"rediscovering the dominant action".

Results are written to `benchmark/results/bench-<timestamp>.json` and rendered
on the `/benchmark` dashboard. Run `npm run bench` to regenerate.

### Results (no-memory; 12 labelled actions: 6 malicious, 6 clean)

| baseline | malRecall | falseApprove | falseReject | cleanApprove | accuracy | latency | tokens |
|---|---|---|---|---|---|---|---|
| lone-agent | 100% | 0% | 0% | 83% | 83% | 20.6s | 1.6k |
| council-no-memory | 100% | 0% | 50% | 0% | 50% | 68.0s | 7.0k |

Both arms hit 100% malicious recall / 0% false-approve on this synthetic set —
`qwen3.7-max` is strong on obvious drainer descriptions. **The council's edge
is the guaranteed safety floor**: the deterministic guardrail can never be
talked into approving an irreversible action, so a harder or novel attack
pattern cannot flip the outcome the way it could flip a lone agent. The
council over-blocks clean actions (falseReject 50% vs 0%) — by design the
guardrail escalates irreversible clean actions to human review (the held-back
moment). That is the safety/throughput trade-off; the price is ~4.4× tokens
and ~3.3× latency for a 5-agent society + cross-debate + referee. D4 (real
exploit signatures + pgvector memory) targets nuanced attacks a text-only lone
model misses, where the on-chain evidence + memory recall earn their keep.

## Submission checklist (Devpost)
- [x] Public OSS repo + MIT license visible in About
- [x] Architecture diagram (`ARCHITECTURE.md`, mermaid)
- [x] Benchmark dashboard + honest baseline comparison (`/benchmark`)
- [x] Council-as-MCP-server (double MCP) — `mcp-server/server.ts`
- [ ] Proof of Alibaba Cloud deployment (recording + `alibaba/proof.ts`) — D7, pending account
- [ ] ~3-min demo video (YouTube) — D8
- [ ] Text description — D8
- [x] Track identified = Track 3: Agent Society
- [ ] Optional dev.to build-in-public post (Blog Post Prize) — D8

## Status
D1–D7 **code complete**: full council pipeline (intake → 3 specialists ‖ simulator
→ cross-debate → referee → deterministic guardrail), token tracking, SSE live
deliberation API, council chamber UI, benchmark dashboard, council-as-MCP-server.
`tsc` clean; smoke PASSED (unanimous reject on a drainer intent); `/api/actions`
live-verified. **Pending**: Alibaba Cloud deploy + proof (D7, blocked on account
opening), real exploit signatures in memory (D4, blocked on `DATABASE_URL`),
demo video + dev.to + submission text (D8). See [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## License
MIT — see [`LICENSE`](./LICENSE).
