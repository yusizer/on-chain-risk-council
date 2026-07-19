# Devpost submission text — On-Chain Risk Council

*Paste into the Devpost submission form. Track: 3 — Agent Society.*

---

## Title
On-Chain Risk Council — multi-agent society that reviews Solana actions before they execute

## One-liner
Specialised Qwen agents deliberate over high-stakes Solana transactions; a deterministic one-way-ratchet guardrail and a tamper-evident hash-chain audit log make the final call. Consensus is necessary, never sufficient.

## What it does

Wallet drainers have caused nine-figure losses. A single LLM asked "is this tx safe?" has **no safety floor** — one prompt injection or hallucination bypasses it entirely.

**On-Chain Risk Council** is a Track 3 Agent Society built for real Solana risk.
The council catches exploits, but the **real innovation** is the architectural
guarantees no lone model can provide:

1. **Role division** — Intake, Risk Analyst, Exploit Skeptic (Helius MCP + pgvector exploit memory), Compliance (deterministic policy), Simulator (fork-sim), Referee (votes last).
2. **Dialogue / conflict resolution** — parallel specialist votes → **cross-debate revision** (monotonic safety floor) → referee arbitration when agents disagree. The UI surfaces "conflict resolved" with the vote split.
3. **Deterministic guardrail** — the final decision is *code, not LLM*. One-way ratchet: can only make outcomes safer. Irreversible actions held back even on unanimous approve.
4. **Human-in-the-loop** — high-stakes / authority / low-confidence / blocking flags escalate to human review. Low-stakes routine transfers use a **routine corridor** so the system stays usable.
5. **Double MCP** — consumes Helius for on-chain evidence; exposes `submitAction` / `getDecision` / `getBenchmark` so wallets and agents plug in.
6. **Tamper-evident audit** — every decision is hash-chained (`GET /api/audit`); rewriting a past outcome breaks verification.
7.  **Benchmark** — 19 labelled actions (incl. real Wormhole/Cashio signatures). Council **malRecall 100%, falseApprove 0%, accuracy 95%**. Lone agent (no guardrail) malRecall 60%, falseApprove **40%** — green-lights 4 of 4 real Wormhole/Cashio signatures. Real exploit signatures (Wormhole $325M, Cashio $48M) auto-rejected by deterministic guardrail — not by LLM reasoning. Lone agent is fast but provides **zero** of the guarantees above.

Live chamber streams deliberation over SSE. Benchmark dashboard compares baselines honestly.

## How we built it

Next.js 16 + TypeScript + Tailwind. Qwen Cloud via DashScope (`qwen3.7-max`, `qwen3-coder-plus`, `qwen-turbo`, `text-embedding-v3`). Helius MCP over stdio. PostgreSQL + pgvector on Alibaba ECS. Deterministic Solana extraction (`@solana/web3.js`) feeds the guardrail so free-text cannot unlock irreversible actions. Orchestrator: intake → specialists ‖ sim → cross-debate → referee → guardrail → audit hash.

## Challenges

- Helius MCP telemetry params (`_feedback` / `_feedbackTool` / `_model`) — empty strings fail with -32602.
- Over-blocking clean actions — fixed by “reject only on positive exploit signal” + routine corridor for low-stakes transfers.
- Social-engineering “this is refundable” — `reversible` is derived only from trusted structure, never user claims.

## Accomplishments

- Deterministic guardrail that no LLM agent can talk past — irreversible actions always held back.
- Live Alibaba ECS deployment with Qwen + Helius + pgvector all green.
- Productizable MCP server + hash-chain audit (ClearCrew-class integrity for decisions).

## What we learned

A multi-agent society earns its keep on **nuanced** cases and **evidence**, not on obvious drainers a strong lone model already catches. The hard floor must be code; the society supplies perspectives and conflict resolution the floor cannot invent.

## What's next

More real exploit signatures in pgvector, wallet browser extension that calls the council MCP before sign, and continuous bench on new mainnet drainers.

## Built with

Qwen Cloud (DashScope) · Helius MCP · Alibaba Cloud ECS + pgvector · Next.js 16 · TypeScript · @modelcontextprotocol/sdk · @solana/web3.js

## Links

- **Repo:** https://github.com/yusizer/on-chain-risk-council
- **Demo video:** https://youtu.be/U1kYVl1zM70
- **Live demo:** http://43.106.15.232:3000
- **Architecture:** `ARCHITECTURE.md`
- **Alibaba proof:** `alibaba/proof.ts` + `alibaba/proof.json`
- **Audit chain API:** http://43.106.15.232:3000/api/audit
- **dev.to post:** optional — draft in `BLOG.md`

## Track
Track 3 — Agent Society

## Testing instructions for judges

1. Open http://43.106.15.232:3000  
2. Click **Drainer reject** → Convene Council → expect **REJECT** with live vote stream  
3. Click **Clean low-risk** → expect **APPROVE** (routine corridor) or escalate  
4. Click **Held-back consensus** / **$12k** → expect **ESCALATE** / held-back banner  
5. Open `/benchmark` for lone-agent vs council table  
6. Open `/api/audit` for hash-chain verification  
7. Optional: `npm run mcp` and call `submitAction` from any MCP client  

No private keys. Mainnet read-only + fork simulation only.
