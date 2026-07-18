# On-Chain Risk Council

**Track 3: Agent Society** — [Global AI Hackathon Series with Qwen Cloud](https://qwencloud-hackathon.devpost.com/) (Devpost).  
**Deadline:** Jul 20, 2026 @ 2:00pm PDT · Prize: $7,000 cash + $3,000 cloud credits (1 winner/track).

> A multi-agent **society** that reviews high-stakes Solana actions before they
> execute. Specialised Qwen agents **deliberate, disagree, and revise**; a
> **deterministic one-way-ratchet guardrail** decides. Helius MCP evidence,
> serialized-tx decode + fork-sim, exploit-pattern memory, and a **tamper-evident
> hash-chain audit log** target the gaps that single-agent reviewers miss.

**Live demo:** http://43.106.15.232:3000 · **Benchmark:** /benchmark · **Audit chain:** /api/audit  
**Repo:** https://github.com/yusizer/on-chain-risk-council · **License:** MIT

## Why this wins Track 3 (not a generic chat swarm)

| Track 3 requirement | How we prove it |
|---|---|
| Distinct agent roles | Intake · Risk Analyst · Exploit Skeptic · Compliance · Simulator · Referee |
| Dialogue / negotiation / conflict | Cross-debate revision round + referee arbitrates split votes; UI shows **conflict resolved** |
| Measurable gain vs single agent | Single LLM has **no safety floor** — one prompt injection bypasses it. Council adds **deterministic guardrail**, **hash-chain audit**, **MCP**, **human-in-the-loop**, and **exploit memory** — architectural guarantees no lone model can match |
| Human-in-the-loop | Guardrail escalates irreversible / high-stakes even on unanimous approve |
| Qwen Cloud + Alibaba | DashScope models + ECS deploy proof (`alibaba/proof.json`) |

**Differentiation vs generic "agent councils":** this is not a business-ops
demo. It is a **Solana pre-signing safety gate** with real mainnet evidence
(Wormhole / Cashio signatures), deterministic extraction that **ignores**
social-engineered "this is refundable" claims, double MCP, and a hash-chained
audit trail of every decision.

## Problem

Wallet drainers and exploiters have caused nine-figure losses. A single LLM
asked “is this tx safe?” fails two ways: novel attack patterns and no hard
safety floor. Real review needs **multiple perspectives** and code that no
fluent agent can talk past.

## Solution

```
intake → [risk ‖ exploit ‖ compliance ‖ simulator] → cross-debate → referee → guardrail → audit hash
```

| Agent | Model / impl | Job |
|---|---|---|
| Intake | `qwen-turbo` + deterministic extract | Parse intent / signature / serialized tx |
| Risk Analyst | `qwen3.7-max` | Amount, novelty, authority, recoverability |
| Exploit Skeptic | `qwen3-coder-plus` + Helius + pgvector | Hunt drainers; recall labelled exploits |
| Compliance | Deterministic policy + light LLM | Blocklists, amount cap, pattern hits |
| Simulator | Helius `simulateTransaction` | Fork-sim serialized txs (no submit) |
| Referee | `qwen3.7-max` | Votes **last** after specialists + sim |
| Guardrail | **Code only** | One-way ratchet; routine corridor for low-stakes clean |

**Consensus is necessary, never sufficient.** A unanimously-approved irreversible
high-stakes payment is still held back. Low-stakes routine transfers (lunch USDC,
no authority change) can execute via a **routine corridor** so the society is
safe *and* usable.

## Benchmark

**19 labelled actions** (6 synthetic malicious + 4 real Wormhole/Cashio + 9 clean).

| baseline | malRecall | falseApprove | cleanApprove | accuracy |
|---|---|---|---|---|
| lone-agent (no guardrail) | **60%** | **40%** | 100% | 79% |
| council-no-memory (5 agents + guardrail) | **100%** | **0%** | 89% | **95%** |

**The numbers are the point.**

The lone qwen3.7-max call green-lights **4 of 4** real Wormhole/Cashio exploit
signatures — a 40% false-approval rate that would be catastrophic in production.
The deterministic guardrail catches them all at the code layer, not by LLM
reasoning. The one "over-escalation" (c6 close own empty) is by design:
close-kind actions are always escalated for safety.

The societal architecture delivers **0% falseApprove** vs **40%** for the lone agent.

| Guarantee | Lone agent | Council |
|---|---|---|
| Deterministic safety floor | ❌ — one prompt injection bypasses everything | ✅ — guardrail blocks irreversible actions by *code*, not LLM |
| Tamper-evident audit | ❌ | ✅ — every decision hash-chained |
| MCP integration | ❌ | ✅ — expose council as MCP server, consume Helius |
| Human-in-the-loop | ❌ | ✅ — high-stakes / authority changes escalate even on unanimous approve |
| Cross-debate conflict resolution | ❌ | ✅ — specialists revise under safety floor |
| Exploit memory (pgvector) | ❌ | ✅ — recall known exploit signatures (when DATABASE_URL configured) |
| Fork simulation | ❌ | ✅ — simulate serialized txs without submitting |

**Misses / design constraints (council, without memory):**
- m2 rugpull — policy threshold tuning
- c6 close own empty — close-kind = high-stakes by design (safety)

**Known exploits auto-blocked:**
r1–r4 (Wormhole complete_wrapped, Wormhole verify_signatures, Cashio mint 2B, Cashio fake_root) are rejected at the deterministic guardrail layer, not by the LLM. A unanimously-approved $325M exploit is still blocked.

Reproduce: `npm run bench` · Dashboard: `/benchmark`.

## Stack

- Next.js 16 + TypeScript + Tailwind  
- Qwen Cloud (DashScope OpenAI-compatible): `qwen3.7-max`, `qwen3-coder-plus`, `qwen-turbo`, `text-embedding-v3`  
- Helius MCP (`helius-mcp`) over stdio  
- PostgreSQL + pgvector (exploit memory + decisions)  
- Alibaba Cloud ECS (Docker) — proof in `alibaba/`  
- Double MCP: consume Helius · expose council (`npm run mcp`)  
- Hash-chain audit: `lib/auditChain.ts` · `GET /api/audit`

## Setup

```bash
cp .env.example .env   # DASHSCOPE_API_KEY, HELIUS_API_KEY; POSTGRES_PASSWORD for Docker
npm install
npm run dev            # http://localhost:3000
npm test               # offline safety + audit-chain tests
npm run smoke          # live drainer intent → expect reject
npm run bench          # lone vs council metrics
npm run mcp            # council as MCP server
```

Health: `GET /api/health` · deep: `GET /api/health?deep=1&schema=1`  
Demo serialized txs: `GET /api/demo-tx`  
Audit chain: `GET /api/audit`

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) (mermaid + judging-criteria map).

## Submission (Devpost)

- [x] Public OSS repo + MIT in About  
- [x] Architecture diagram  
- [x] Benchmark + lone-agent baseline  
- [x] Double MCP  
- [x] Alibaba proof (`alibaba/proof.ts` + `proof.json`)  
- [x] Hash-chain audit trail  
- [x] Text description (`SUBMISSION.md`)  
- [x] Track 3 identified  
- [ ] Demo video YouTube URL (local: `demo-videos/demo-voiced.mp4`)  
- [ ] Optional dev.to blog (`BLOG.md`) for Blog Post Prize  

## License

MIT — see [`LICENSE`](./LICENSE).
