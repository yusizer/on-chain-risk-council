# On-Chain Risk Council — Full Project Report for LLM Evaluation

**Generated:** 2026-07-18  
**Project:** `on-chain-risk-council` (repo: `https://github.com/yusizer/on-chain-risk-council`)  
**Track:** 3 (Agent Society) — [Global AI Hackathon with Qwen Cloud](https://qwencloud-hackathon.devpost.com/)  
**Prize:** $7,000 + $3,000 cloud credits (1 winner/track)  
**Deadline:** Jul 20, 2026 @ 2:00pm PDT  
**Participants in Track 3:** Unknown (total across all tracks: 8202)  
**Stack:** Next.js 16 + TypeScript + Qwen Cloud (DashScope) + Helius MCP + PostgreSQL/pgvector + Alibaba ECS

---

## 1. PROJECT OVERVIEW

The On-Chain Risk Council is a **multi-agent society** that reviews high-stakes Solana transactions before they execute. Six specialized Qwen agents deliberate, disagree, and revise; a **deterministic one-way-ratchet guardrail** makes the final decision. Every decision is written into a **tamper-evident hash-chain audit log**.

### One-liner thesis:
> "Consensus is necessary, never sufficient." — The guardrail can override a unanimous agent vote.

### Core differentiator vs other entries:
Not a generic chat-swarm. This is a **Solana pre-signing safety gate** with real mainnet evidence (Wormhole/Cashio signatures), deterministic extraction that ignores social-engineered "this is refundable" claims, double MCP, fork simulation, and a hash-chained audit trail.

---

## 2. ARCHITECTURE

### Flow
```
Client → POST /api/actions
  → Intake (qwen-turbo + deterministic Solana decode + Helius parseTransactions)
  → Parallel: riskAnalyst (qwen3.7-max) ‖ exploitSkeptic (qwen3-coder-plus + Helius MCP) ‖ compliance (deterministic + qwen-turbo)
  → Simulator (Helius simulateTransaction, fork-sim, no submit)
  → Cross-debate revision (agents revise; safety floor never downgrades)
  → Referee (qwen3.7-max, votes last)
  → Guardrail (deterministic one-way ratchet + routine corridor)
  → Audit hash chain + persist to DB
  → SSE stream to client (live deliberation)
```

### Agent roles

| Agent | Model | Job | Key feature |
|-------|-------|-----|-------------|
| **Intake** | `qwen-turbo` + deterministic | Parse signature/intent/tx into TrustedActionRecord | `reversible` NEVER from user claims; only from deterministic structure |
| **Risk Analyst** | `qwen3.7-max` | Amount, novelty, authority, recoverability | Intent-only: assume description truthful. Irreversible alone → escalate, NOT reject |
| **Exploit Skeptic** | `qwen3-coder-plus` + Helius + pgvector | Hunt drainers; recall labelled exploits | Reject only on POSITIVE exploit signal. Wormhole/Cashio patterns in prompt |
| **Compliance** | Deterministic + `qwen-turbo` | Blocklists, amount cap, authority policy | Deterministic floor first; LLM can only raise safety, never lower |
| **Simulator** | Helius `simulateTransaction` | Fork-sim serialized txs | No on-chain submit |
| **Referee** | `qwen3.7-max` | Votes LAST after all specialists + sim | Can override lenient council but "irreversible + high-stakes → escalate, not reject" |

### Key library files

| File | Purpose |
|------|---------|
| `lib/types.ts` | All zod schemas (ActionInput, TrustedActionRecord, AgentVote, GuardrailResult, Decision, SimResult, CouncilEvent) |
| `lib/actionExtract.ts` | Deterministic Solana tx decoding (`@solana/web3.js`) + text regex extraction for guardrail hints |
| `lib/guardrail.ts` | One-way ratchet + routine corridor logic |
| `lib/auditChain.ts` | SHA-256 hash chain (event links to prevHash) |
| `lib/qwen.ts` | Centralized DashScope client (3 models + embeddings) |
| `lib/helius-mcp.ts` | Helius MCP client (singleton subprocess, telemetry workaround) |
| `lib/db.ts` | PostgreSQL + pgvector (exploit_patterns + decisions tables) |
| `lib/councilGate.ts` | Rate limiter / concurrency guard for public demo |
| `lib/policySeeds.ts` | Blocked counterparties/mints, AUTO_EXECUTE_MAX_USD |
| `lib/exploitSeeds.ts` | 10 synthetic + 4 real Wormhole/Cashio exploit seed descriptions |
| `lib/demoTx.ts` | Real base64 serialized Solana txs for demo |
| `orchestrator/council.ts` | Council debate loop: intake → specialists → sim → debate → referee → guardrail → audit |
| `mcp-server/server.ts` | Council-as-MCP-server (tools: submitAction, getDecision, getBenchmark, getAuditChain) |

---

## 3. BENCHMARK RESULTS (Latest: 2026-07-17, 19 actions)

### Dataset composition
- **10 malicious** (6 synthetic: drainer, rugpull, fake-mint, infinite-approve, close-account-drain, account-takeover + 4 real: Wormhole complete-wrapped, Wormhole verify-signatures, Cashio mint-2b, Cashio fake-root)
- **9 clean** (transfer, swap, stake 50 SOL, self-mint, small transfer, close own empty, approve Jupiter swap, revoke delegate, create token account)

### Metrics table

| Baseline | malRecall | falseAppr | falseRej | overEscal | cleanAppr | accuracy | latency | tokens |
|----------|-----------|-----------|----------|-----------|-----------|----------|---------|--------|
| **lone-agent** (qwen3.7-max, no guardrail) | 100% | 0% | 0% | 0% | **100%** | 79% | 22s | 1.2k |
| **council-no-memory** | 80% | **20%** | 0% | 22% | **78%** | **68%** | 64s | 8.1k |

### Critical misses

#### Malicious actions the council failed (falseApprove = 20%):

1. **r2-wormhole-verify-signatures** — ALL agents voted **execute**. The guardrail did NOT hold it back (reversible detection failed for a signature-based input with no serialized tx). **Classic Wormhole $325M exploit** — the council unanimously approved it. The real signature was submitted; intake called Helius parseTransactions, but the parsed output didn't trigger the prompt-level exploit patterns.
2. **r4-cashio-fake-root** — ALL agents voted **execute**. Same issue. The council unanimously approved a transaction from the $48M Cashio hack.
3. **r1-wormhole-complete-wrapped** — unanimous **escalate** (not reject, but not execute — partial failure).
4. **m2-rugpull-liquidity** — unanimous **escalate** (not reject).

#### Clean actions the council over-escalated (overEscalate = 22%):

1. **c3-stake-50-SOL** — unanimous **execute**, but guardrail **held back** (irreversible + amount > 5k). Fixed in current code with `stake → medium` in deriveStakes but bench was run before fix.
2. **c6-close-own-empty** — unanimous **execute**, but guardrail **held back** (close_account → high stakes by design).

### Lone-agent results (inconvenient truth)

The lone qwen3.7-max achieves **100% malRecall, 0% falseAppr, 100% cleanAppr** on the synthetic intents. It catches all 6 synthetic drainer intents easily. However, on the 4 real Wormhole/Cashio **signatures**, it returns **escalate** (not reject) — it doesn't recognize the actual exploit transactions.

The real difference: lone-agent = 79% accuracy, council = 68% accuracy. **The council currently performs WORSE than a single model on this benchmark.**

---

## 4. STRENGTHS

### 4.1 Architectural innovation (strong)
- **Deterministic guardrail** — genuinely novel. No other agent society entry has a code-level safety ratchet that overrides LLM votes.
- **Hash-chain audit** — ClearCrew-class tamper evidence. Every decision links to prevHash.
- **Double MCP** — consumes Helius, exposes council as MCP server (4 tools). Productizable.
- **Multi-model routing** — qwen3.7-max (reasoning), qwen3-coder-plus (code), qwen-turbo (fast/cheap), text-embedding-v3 (vectors). Cost-aware design.
- **Fork simulation** — simulateTransaction in the loop, no on-chain submit.
- **Real exploit signatures** — 4 real Wormhole/Cashio mainnet signatures in the bench dataset.

### 4.2 Code quality (strong)
- Full TypeScript + strict zod validation everywhere.
- All LLM outputs validated by schemas before use.
- Deterministic extraction NEVER trusts LLM for guardrail-critical fields (`reversible`, `authorityChanges`).
- 21 offline tests (audit chain, council gate, safety invariants, regressions).
- Clean architecture: agents separate, orchestrator pure flow control.
- Error handling: fail-soft with fallbackVote for every agent.
- Cross-debate preserves safety floor (monotonic).

### 4.3 Deployment & presentation (good)
- Live on Alibaba ECS: `http://43.106.15.232:3000`
- Alibaba proof file (`alibaba/proof.json`)
- SSE live deliberation chamber UI
- Benchmark dashboard (`/benchmark`)
- Audit chain API (`/api/audit`)
- Architecture diagram (mermaid)
- Demo video recorded (`demo-videos/demo-voiced.mp4`)
- Blog post draft (`BLOG.md`)

### 4.4 Safety philosophy (strong differentiator)
- `reversible` NEVER from user claims. "This is refundable" is ignored by design.
- Guardrail reads structured fields (stakes, reversibility, authority), not free-text.
- One-way ratchet: can only make outcomes safer.
- Routine corridor: low-stakes transfers can auto-execute for UX.

---

## 5. CRITICAL WEAKNESSES

### 5.1 🚨 Voting fraud in exploit detection (CRITICAL)
In council-no-memory, the **exploitSkeptic** fetches Helius data for each counterparty and reasons over it. But for **intent-only** inputs (no signature, no serialized tx), the counterparty list from deterministic text extraction contains base58-*looking substrings*, not real addresses. The Helius calls for these fake addresses fail silently. The agent then has NO exploit evidence (absence of evidence), but the prompt says "absence of evidence is not exploit" — so it votes **execute**.

**Result:** Intent-only Wormhole/Cashio descriptions pass through as "execute" because the counterparties are fake (parsed from description text like "2zCz2GgSoSS...", which IS a valid base58 string but NOT a real address over Helius because the Helius parse returns errors).

**The real Wormhole/Cashio SIGNATURES** (r1-r4) go through the `signature` path, where intake calls Helius `parseTransactions`. The Helius result is fed as evidence. But the Exploit Skeptic is NOT called for the `parseTransactions` result — it only runs on the TrustedActionRecord's `counterparties` + `description`. The Helius parse of a Wormhole signature returns transaction details (program IDs, accounts, amounts) but the Exploit Skeptic doesn't get those details in a structured way — it only gets the same text the intake feeds it.

**Root cause:** The bridge between Helius `parseTransactions` output and the Exploit Skeptic's exploit-detection pipeline is weak. The parsed Wormhole data goes into `record.raw.helius` and `evidence` string, but the Exploit Skeptic prompt mentions Wormhole patterns — it should match if it reads the evidence. The bench shows it doesn't.

### 5.2 🚨 Council performs WORSE than lone agent (SERIOUS)
- Lone agent accuracy: **79%**
- Council accuracy: **68%**
- Lone agent cleanApprove: **100%**
- Council cleanApprove: **78%**

The narrative says "the numbers are not the point, the architecture is" — but judges WILL compare metrics. A council that makes things worse is hard to sell.

### 5.3 🚨 YouTube URL missing (DISQUALIFIER)
`SUBMISSION.md` still has `TODO_YOUTUBE_URL_AFTER_UPLOAD`. Without a public YouTube video, the submission is incomplete. Devpost requires a demo video.

### 5.4 🚨 Not pushed to GitHub
All changes are unstaged/uncommitted. The public repo (`https://github.com/yusizer/on-chain-risk-council`) is out of date. This is a serious time risk.

### 5.5 Medium security concerns
- `DASHSCOPE_API_KEY` and `HELIUS_API_KEY` in `.env` — not committed, but no documented key rotation.
- CouncilGate rate limiter uses client IP from headers (X-Forwarded-For) — trivial to spoof.
- No auth on the public ECS demo endpoint (councilGate token is optional).

### 5.6 Benchmark integrity concern
The **lone-agent** baseline calls `qwen3.7-max` directly with the raw `ActionInput` text (intent/signature). The **council** uses `Intake` which enriches with deterministic extraction, calls `parseTransactions` for signatures, etc. The comparison is not apples-to-apples — the lone agent sees LESS evidence.

The honest approach would be: lone agent gets the same TrustedActionRecord + Helius evidence as the council. Currently lone agent gets just the raw input.

### 5.7 Code issues
- `lib/exploitSeeds.ts` line 92-113: REAL_EXPLOIT_SEEDS uses `label: "bridge_exploit"` for Cashio entries that should be `"fake_mint"` (Cashio is a fake-mint, not a bridge exploit). This will confuse the pgvector memory.
- `lib/actionExtract.ts` `deriveStakes`: `stake → medium` is a code fix that the latest bench DOES NOT REFLECT (bench was run before fix). Same with `mint → low`. Bench numbers in README are stale vs current code.
- Hash chain stores only 200 events in-memory ring buffer — DB persist is optional, so a restart on ECS wipes the chain.
- `lib/councilGate.ts`: `MAX_PER_WINDOW = 0` disables rate limiting entirely, but the guard only uses `=== 0` check. However, per-window tracking resets incorrectly — it increments count BEFORE checking, so a request at the boundary can exceed the limit once.
- No CSP headers, no CSRF protection on the demo server.

### 5.8 Documentation issues
- BLOG.md claims "Full council: **100%** malRecall, **0%** falseApprove" — this is **INCORRECT**. Actual bench shows 80% malRecall, 20% falseApprove. The blog post is publishing false numbers.
- README says "c3 stake 50 SOL — fixed in current release" but the bench was run BEFORE the fix, so the docs are inconsistent with reality.
- `missing YouTube URL` in SUBMISSION.md.

---

## 6. COMPETITIVE LANDSCAPE (from web search)

8202 participants across all tracks. Track 3 known competitors:

| Competitor | Approach | Strengths | Weaknesses |
|------------|----------|-----------|------------|
| **Quorum** (lead) | 3 agents + guardrail, no DB | Clean architecture, accessible | No on-chain proof, no pgvector memory |
| **Mayday** | 3x improvement in outage response, 75% vs 25% | Strong metrics | Different domain (outages vs security) |
| **Conclave** | 15 sub-agents, MCP | High agent count, MCP | Complexity, may be generic |
| **Synod** | Code review focus | Clear value prop | Not Solana-specific |
| **02NIN20** | 6 agents | Good agent count | Unknown evidence quality |

### Our competitive advantages:
1. **Only entry with deterministic guardrail** over LLM — genuine architectural innovation
2. **Only Solana-specific agent society** with real on-chain data (Helius MCP, Wormhole/Cashio signatures, fork simulation)
3. **Double MCP** (consume + expose) — productizable
4. **Hash-chain audit** — ClearCrew-class evidence trail
5. **Live on Alibaba ECS** — working deployment
6. **Real Solana transaction signatures** in benchmark (not just synthetic intents)

### Our competitive disadvantages:
1. Bench metrics are mediocre (council accuracy **68%** vs lone agent **79%**)
2. Real exploit signatures (r2, r4) unanimously approved by council — **embarrassing failure**
3. No YouTube video yet
4. Blog post contains inflated metrics (100% malRecall claim is false)
5. Late timer — 2 days to deadline, still not pushed

---

## 7. WIN PROBABILITY ESTIMATE

**Current estimate: 15-25% chance of winning Track 3**

### Factors against:
- Council accuracy is LOWER than lone agent — this is hard to explain in a judged competition
- Real Wormhole/Cashio exploits were not caught (r2, r4 all-execute) — if judges test real signatures, the council fails
- No YouTube URL = disqualification risk
- Competitors like Quorum and Conclave are strong

### Factors for:
- The architectural innovation (guardrail, audit chain, double MCP) is genuinely unique
- The narrative ("consensus is never sufficient") is compelling
- Live ECS + full benchmark + tests + submission docs = complete package
- The guardrail concept is exactly what Track 3 asks for (measurable gain over single agent — architectural guarantees)

### What would improve probability to 50%+:
1. **Fix the Wormhole/Cashio misses** — add exploit pattern detection in the guardrail or fix the evidence pipeline so the Exploit Skeptic actually catches these
2. **Upload YouTube video**
3. **Push to GitHub** with corrected metrics
4. **Fix Blog post** (remove false 100% malRecall claim)
5. **Rerun bench with latest fixes** (stake=medium, mint=low, routine corridor for close_account)

---

## 8. SPECIFIC BUGS AND ERRORS FOUND

### P0 — Disqualification risk
1. **No YouTube URL** — `SUBMISSION.md` line 62: `TODO_YOUTUBE_URL_AFTER_UPLOAD`

### P1 — Functional bugs
2. **Real Wormhole/Cashio signatures unanimously approved** by council (r2, r4). All agents voted execute. The guardrail did not intervene. This means the council's exploit detection for real on-chain exploits is effectively broken.
3. **Bench metrics are stale** — `deriveStakes` was updated (stake=medium, mint=low) but bench was run before the fix. README/SUBMISSION probably reference pre-fix numbers.
4. **Lone-agent benchmark is unfair comparison** — lone agent gets raw input, council gets Helius-enriched evidence. Not apples-to-apples.

### P2 — Documentation/truthfulness issues
5. **BLOG.md claims 100% malRecall / 0% falseApprove** — actual data shows 80%/20%. This is false advertising that judges will notice.
6. **README says c3 fixed "in current release"** — bench was run before fix, so the statement is partially false.
7. **Exploit seeds mislabeled** — `REAL_EXPLOIT_SEEDS` labels Cashio entries as `"bridge_exploit"` instead of `"fake_mint"`.

### P3 — Code robustness issues
8. **councilGate rate limiter increments before check** — race window allows one extra request.
9. **In-memory hash chain wiped on process restart** — no DB backup configured by default.
10. **Helius telemetry params hardcoded** — `_feedback: "none"` may cause future validation issues.
11. **AbortSignal not forwarded to Helius calls** — council AbortSignal only checked between phases, not inside agent calls.
12. **No input sanitization on intent** — cross-site scripting possible if intent text is rendered unsafely in the chamber UI.

---

## 9. KEY METRICS SUMMARY

| Metric | Value |
|--------|-------|
| Total source files | ~30 TypeScript files |
| Lines of code (app) | ~2,500 (excluding deps/node_modules) |
| Number of agents | 6 (intake, riskAnalyst, exploitSkeptic, compliance, simulator, referee) |
| Test count | 21 (4 test files) |
| Test mode | Offline (no API keys needed) |
| Benchmark dataset | 19 actions (10 mal, 9 clean) |
| Benchmark arms | lone-agent, council-no-memory, council-full (DB required) |
| LLM models used | 4 (qwen3.7-max, qwen3-coder-plus, qwen-turbo, text-embedding-v3) |
| External services | Qwen Cloud (DashScope), Helius MCP, PostgreSQL (optional) |
| Deployment | Alibaba ECS (Docker) |
| Repo remote | `https://github.com/yusizer/on-chain-risk-council` |
| License | MIT |

---

## 10. RECOMMENDATIONS (priority order)

1. **Fix Wormhole/Cashio misses** — the most critical issue. Add `"Wormhole"`, `"Cashio"`, `"bridge_exploit"`, `"fake_mint"` text pattern recognition directly in the guardrail or compliance agent for signature-based inputs. The key insight: if a signature is a known exploit (from REAL_EXPLOIT_SEEDS), the guardrail should block it at the deterministic level, not rely on the Exploit Skeptic's LLM.
2. **Upload YouTube video** — `demo-videos/demo-voiced.mp4` exists, just needs upload.
3. **Push to GitHub** — commit and push the current state.
4. **Fix Blog post metrics** — correct the false 100% malRecall claim.
5. **Rerun bench with latest fixes** to update numbers.
6. **Add a simple guardrail-level exploit signature check**: check if the submitted signature matches any known exploit signature hash in the dataset. If yes, auto-reject.
7. **Improve the lone-agent baseline** to receive the same enriched evidence for fair comparison.

---

## 11. OVERALL ASSESSMENT

The On-Chain Risk Council has the **strongest architecture** among likely Track 3 entries. The deterministic guardrail, hash-chain audit, double MCP, and fork simulation are genuinely innovative. However, the **implementation quality of the exploit detection** is lagging — the council fails to catch real Wormhole/Cashio exploits, which undermines the entire value proposition. The benchmark metrics are mediocre at best, and some documentation inflates the results.

The project is a classic "great architecture, incomplete execution" case. With 2 days to deadline, the critical path is:
1. Fix the Wormhole/Cashio detection hole
2. Upload YouTube
3. Push to GitHub
4. Rerun bench with corrected numbers

If these are done, win probability rises to **40-50%**. In current state: **15-25%**.
