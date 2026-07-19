# I Let 5 AIs Argue About a $325M Hack — Then Made Code the Boss

*Build-in-public for the [Global AI Hackathon with Qwen Cloud](https://qwencloud-hackathon.devpost.com/) — Track 3: Agent Society. Originally built as the On-Chain Risk Council.*

A single LLM asked "is this transaction safe?" is a trap. It misses novel attack patterns, and — worse — it has **no hard safety floor**. A fluent model can talk its way past any soft threshold. I'd watched wallet drainers steal nine figures, and I knew one smart model wasn't the answer. So I built a *society* of specialised Qwen agents that deliberates over a Solana action — and then a **deterministic one-way-ratchet guardrail** makes the final call. Every decision is written into a **tamper-evident hash chain**. Consensus is necessary, never sufficient.

▶️ Watch the demo: https://youtu.be/U1kYVl1zM70

## The problem I kept hitting

The naive version failed twice in ways that mattered. First, a strong lone model green-lit **four of four** real historical exploit signatures — Wormhole's `$325M` `complete_wrapped`, Wormhole `verify_signatures`, Cashio's `$48M` `mint 2B`, Cashio `fake_root`. It sounded confident every time. Second, when I first wired multiple agents, they *over-blocked*: a clean "send 0.5 SOL to a friend" got rejected because someone smelled "transfer." I had built a system that was safe but useless.

The fix wasn't more prompting. It was architecture: derive `reversible` and `authorityChanges` only from trusted Solana decoding — never from the user's word ("it's refundable!") — and let a **routine corridor** fast-pass low-stakes transfers while the council still convenes on anything irreversible.

## Why a society, not a hero

Track 3 asks for role division, dialogue/conflict resolution, and a **measurable gain over a single-agent baseline**. Real transaction review needs more than one perspective:

- **Intake** — `qwen-turbo` + deterministic Solana decode normalises free-text or a raw tx into a structured action record.
- **Risk Analyst** — amount, counterparty novelty, authority changes.
- **Exploit Skeptic** — pulls on-chain evidence via Helius MCP and semantically recalls labelled exploits from pgvector.
- **Compliance** — deterministic policy (block patterns, amount caps).
- **Simulator** — fork-simulates the tx via Helius `simulateTransaction`.
- **Referee** — votes *last*, after seeing everyone else; the strongest model, but **not** the decision-maker. Code is.

## A case on screen

Take the intent *"Approve a dodgy token and let a site drain my SOL via a malicious delegate."* Intake classifies it as authority delegation. Risk flags the delegate privilege; Exploit Skeptic recalls similar drainer signatures from pgvector; Compliance marks it a blocking pattern. All three vote **reject**, the Referee agrees, and the guardrail confirms — unanimous reject, no human override needed. Contrast that with *"Send 0.5 SOL to a friend, no approvals"*: routine corridor, unanimously **approve**. Same council, opposite calls — because the structure, not the vibe, drives the outcome.

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

Double MCP: the council **consumes** Helius for on-chain evidence and **exposes** itself (`submitAction`, `getDecision`, `getBenchmark`) so wallets and other agents can ask before signing.

## Benchmark (honest)

19 labelled actions including **real** Wormhole/Cashio mainnet signatures:

| | malRecall | falseApprove | cleanApprove | accuracy |
|---|---|---|---|---|
| Lone `qwen3.7-max` (no guardrail) | **60%** | **40%** | 100% | 79% |
| Council (5 agents + guardrail, no memory) | **100%** | **0%** | 89% | 95% |

The lone strong model false-approves **40%** of exploits. The council false-approves **zero**. That is the Track 3 measurable gain: not "more chat", but **fewer catastrophic approvals**.

## Running on Qwen Cloud + Alibaba

The whole thing runs on an Alibaba Cloud ECS instance (Singapore, `43.106.15.232`) — Qwen Cloud via DashScope for the agents, PostgreSQL + pgvector for exploit memory and the audit log. The deployment self-verifies through `alibaba/proof.ts`: ECS instance check, pgvector installed, Qwen reachable, Helius MCP returning 10 tools, council end-to-end green. At submit time the free-trial credit was 84% intact.

## What I learned

1. Multi-agent value shows up on **nuanced** cases and evidence, not on obvious drainers.
2. `reversible` must never come from the user — derive it only from trusted structure.
3. Hash-chaining decisions turns a demo into an audit trail another agent can verify.
4. Qwen Cloud + Alibaba ECS is enough to ship a production-shaped gate inside a hackathon window.

## Try it / what's next

- Live: http://43.106.15.232:3000
- Repo: https://github.com/yusizer/on-chain-risk-council
- Audit: `/api/audit` · Bench: `/benchmark`

Built with Qwen Cloud (DashScope), Helius MCP, Alibaba Cloud ECS + pgvector, Next.js 16, TypeScript.

Next: more real exploit signatures in pgvector, a wallet browser extension that calls the council MCP before every sign, and a continuously-running bench on new mainnet drainers. If you're building agents that touch value, star the repo and tell me what your guardrail looks like.

---

*Track 3: Agent Society · Feedback welcome.*
