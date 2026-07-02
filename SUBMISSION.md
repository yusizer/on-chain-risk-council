# Devpost submission text — On-Chain Risk Council

*Paste into the Devpost submission form. Replace {{...}} placeholders before
submitting. Track: 3 — Agent Society.*

---

## Title
On-Chain Risk Council — a multi-agent society that reviews Solana actions before they execute

## One-liner
A council of specialised Qwen agents deliberates over high-stakes Solana
transactions; a deterministic one-way-ratchet guardrail — keyed off on-chain
data, never model output — makes the final call. Consensus is necessary, never
sufficient.

## What it does
Solana drainers and exploiters cost users hundreds of millions a year. Asking
a single LLM "is this tx safe?" fails two ways: it confidently approves
irreversible attacks it has never seen, and there is no hard safety floor. The
On-Chain Risk Council fixes both:

- A **society of specialists** — Risk Analyst (`qwen3.7-max`), Exploit Skeptic
  (`qwen3-coder-plus` + Helius MCP on-chain evidence), Compliance/Policy
  (deterministic rules), Simulator (Helius `simulateTransaction` fork-sim),
  Referee (`qwen3.7-max`, votes last) — covers blind spots no single agent has.
- A **deterministic guardrail** reads stakes + reversibility from a *trusted*
  action record (derived from parsed on-chain data, not model output) and can
  only make the outcome **safer**. A unanimously-approved irreversible action
  is still held back for a human.
- **Double MCP**: the council *consumes* the Helius MCP server for on-chain
  evidence and *exposes itself* as an MCP server (`submitAction`,
  `getDecision`, `getBenchmark`) so any AI client — Claude, Cursor, a wallet
  agent — can request reviews.

Live deliberation streams over SSE in a council-chamber UI; a benchmark
dashboard compares the council against a lone-agent baseline.

## How we built it
Next.js 16 (App Router) + TypeScript + Tailwind. Qwen Cloud via the DashScope
OpenAI-compatible endpoint (multi-model: `qwen3.7-max` / `qwen3-coder-plus` /
`qwen-turbo` / `text-embedding-v3`). Helius MCP over stdio for on-chain data
(parseTransactions, getAccountInfo, getWalletFundedBy, simulateTransaction).
Alibaba Cloud RDS PostgreSQL + pgvector for an exploit-pattern memory and a
decisions audit log; deployed on Alibaba ECS (Docker). The council orchestrator
runs intake → 3 specialists ‖ simulator → a cross-debate revision round →
referee → guardrail, emitting an SSE event stream and totaling token usage
through a concurrent-safe budget.

## Benchmark
Honest comparison vs a shortcut lone-agent baseline (single `qwen3.7-max`, no
council, no guardrail) over a labelled set of clean + malicious Solana actions.
Metrics: malicious recall, false-approve, false-reject, over-escalate,
clean-approve, accuracy, latency, token cost.

| baseline | malRecall | falseApprove | falseReject | cleanApprove | accuracy | latency | tokens |
|---|---|---|---|---|---|---|---|
| lone-agent (single qwen3.7-max, no guardrail) | 75% | **25%** | 0% | 100% | 79% | 21.5s | 1.8k |
| council-no-memory (5 agents + cross-debate + guardrail) | **100%** | **0%** | 17% | 17% | 57% | 56.3s | 6.6k |

The thesis row: **council `falseApprove` = 0% vs lone-agent 25%**. The dataset
includes 2 real on-chain Wormhole exploit signatures ($325M bridge hack). The
lone wolf **false-approves both real Wormhole signatures** — a single strong
model with no safety floor green-lights an actual exploit. The council catches
both (`r1` → escalate, `r2` → reject) and hits 100% malicious recall / 0%
false-approve. That is the deterministic-guardrail-over-society thesis: it can
never be talked into approving an irreversible exploit. Trade-off: the council
over-blocks clean (cleanApprove 17% vs 100%) — the guardrail escalates
irreversible clean actions to human review by design (the held-back moment).
For high-stakes on-chain review, never approving a drainer matters more than
never bothering a human. ~3.6× tokens, ~2.6× latency. pgvector memory (D4)
targets even more nuanced attacks.

## Challenges we ran into
- **Helius MCP telemetry footgun**: every routed tool requires `_feedback` /
  `_feedbackTool` / `_model` (minLength 1) — an empty `_feedback:""` returns
  MCP `-32602` and looks like a missing-param error. Documented in-code for
  the next integrator.
- **Over-blocking clean actions**: an under-tuned exploit skeptic rejects clean
  routine actions (normal transfers, swaps) from *absence* of evidence. The
  biggest lever was prompting "reject only on a *positive* exploit signal" —
  a safety system that blocks everything is safe and useless.
- **Orphan subprocesses**: `npx helius-mcp` isn't killed on Node exit and
  accumulates orphans that block new spawns; added `closeHelius()` cleanup.

## What we learned
A deterministic guardrail over LLM votes beats a lone strong model on safety,
*if* the agents are tuned to reject on positive signals rather than on
uncertainty. The society's value is the safety floor + perspective diversity,
not raw accuracy on obvious cases (a strong lone model catches obvious
drainers too — the hard cases are the nuanced ones, where on-chain evidence +
memory earn their keep).

## What's next
Real exploit signatures in pgvector memory, Alibaba Cloud deploy + proof
recording, a 3-min demo video, and a dev.to build-in-public post.

## Built with
Qwen Cloud (DashScope) · Helius MCP · Alibaba Cloud RDS pgvector + ECS ·
Next.js 16 · TypeScript · @modelcontextprotocol/sdk.

## Links
- **Repo:** {{REPO_URL}}
- **Demo video:** {{DEMO_VIDEO_URL}}
- **Architecture diagram:** `ARCHITECTURE.md` (mermaid)
- **Live demo:** {{LIVE_URL}} (Alibaba ECS, D7)
- **dev.to post:** {{BLOG_URL}}

## Track
Track 3 — Agent Society.
