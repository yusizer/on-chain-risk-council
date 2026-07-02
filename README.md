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
cp .env.example .env            # fill DASHSCOPE_API_KEY, HELIUS_API_KEY, DATABASE_URL, ALIYUN_*
npm install
npm run dev                     # http://localhost:3000
```
Health check: `curl http://localhost:3000/api/health` → `{ ok, qwen, helius, db }`.

## Benchmark
`benchmark/` runs the council against a labelled set of clean + malicious Solana
actions (real known exploit signatures via Helius + synthetic drainer patterns).
Baselines: **lone-agent** (single Qwen, no council) · **council-no-memory** ·
**full council**. Metrics: malicious recall, false-approve rate (critical),
false-reject rate, latency, token cost. Honest reporting incl. shortcut baselines
(FailureDNA-style) so a win isn't just "rediscovering the dominant action".

## Submission checklist (Devpost)
- [ ] Public OSS repo + MIT license visible in About
- [ ] Proof of Alibaba Cloud deployment (recording + `alibaba/proof.ts`)
- [ ] Architecture diagram
- [ ] ~3-min demo video (YouTube)
- [ ] Text description
- [ ] Track identified = Track 3: Agent Society
- [ ] Optional dev.to build-in-public post (Blog Post Prize)

## Status
WIP — Day 1 scaffold. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and the project
plan. Agents, benchmark, frontend, and Alibaba deployment land Days 2–7.

## License
MIT — see [`LICENSE`](./LICENSE).
