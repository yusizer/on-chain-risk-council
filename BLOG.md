# Building an On-Chain Risk Council with Qwen: agents deliberate, code decides

*Build-in-public for the [Global AI Hackathon with Qwen Cloud](https://qwencloud-hackathon.devpost.com/) — Track 3: Agent Society.*

Wallet drainers have caused nine-figure losses across crypto. The naive defense — “ask an LLM if this transaction is safe” — fails twice: novel attack patterns and **no hard safety floor**. A fluent agent can talk its way past any soft threshold.

I built the **On-Chain Risk Council**: a society of specialised Qwen agents that deliberates over a Solana action, then a **deterministic one-way-ratchet guardrail** — keyed off a *trusted* action record, never free-text — makes the final call. Every decision is written into a **tamper-evident hash chain**. Consensus is necessary, never sufficient.

## Why a society, not a hero

Track 3 asks for role division, dialogue/conflict resolution, and a **measurable gain over a single-agent baseline**. Real tx review needs:

- **Risk Analyst** — amount, counterparty novelty, authority changes  
- **Exploit Skeptic** — Helius MCP evidence + pgvector recall of labelled exploits  
- **Compliance** — deterministic policy (block patterns, amount caps)  
- **Simulator** — fork-sim via Helius `simulateTransaction`  
- **Referee** — votes *last* after seeing everyone else  

The referee is the strongest model, but **not** the decision-maker. Code is.

## Architecture (short)

```
Client → Next.js API → Orchestrator
  → Intake (qwen-turbo + deterministic Solana decode)
  → Risk ‖ Exploit ‖ Compliance ‖ Simulator
  → Cross-debate (agents revise; safety floor never downgrades)
  → Referee
  → Guardrail (one-way ratchet + routine corridor)
  → Audit hash chain
```

Double MCP: the council **consumes** Helius and **exposes** itself (`submitAction`, `getDecision`, `getBenchmark`) so wallets and other agents can ask before signing.

## The held-back moment

A $12k irreversible payment can get **unanimous execute** from every agent. The guardrail still escalates: high stakes / irreversible / authority / blocking flags. That banner in the UI is the product thesis.

Low-stakes routine transfers (lunch USDC, no authority change) can **execute** via a routine corridor — otherwise a safety system that blocks everything is useless.

## Benchmark (honest)

19 labelled actions including **real** Wormhole/Cashio mainnet signatures:

| | malRecall | falseApprove | cleanApprove | accuracy |
|---|---|---|---|---|
| Lone `qwen3.7-max` (no guardrail) | **60%** | **40%** | 100% | 79% |
| Council (5 agents + guardrail, no memory) | **100%** | **0%** | 89% | 95% |

The lone strong model green-lights **four** of four historical exploit signatures (Wormhole complete_wrapped, Wormhole verify_signatures, Cashio mint 2B, Cashio fake_root) — a 40% false-approval rate. The council false-approves **zero**. That is the Track 3 measurable gain: not “more chat”, but **fewer catastrophic approvals**.

## What I learned

1. Multi-agent value shows up on **nuanced** cases and evidence, not on obvious drainers.  
2. `reversible` must never come from the user (“it’s refundable!”).  
3. Hash-chaining decisions turns a demo into an audit trail another agent can verify.  
4. Qwen Cloud + Alibaba ECS is enough to ship a production-shaped gate in a hackathon window.

## Try it

- Live: http://43.106.15.232:3000  
- Repo: https://github.com/yusizer/on-chain-risk-council  
- Audit: `/api/audit` · Bench: `/benchmark`

Built with Qwen Cloud (DashScope), Helius MCP, Alibaba Cloud ECS + pgvector, Next.js 16.

---

*Track 3: Agent Society · MIT · Feedback welcome.*
