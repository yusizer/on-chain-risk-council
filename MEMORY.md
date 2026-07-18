# Project Memory — On-Chain Risk Council (qwen-risk-council)

> Updated 2026-07-16 — win-push pack: hash-chain, routine corridor, policy seeds, docs.

## Goal
Submit to **Devpost Global AI Hackathon Series with Qwen Cloud**, Track 3: Agent Society, and maximise score vs S-tier competitors (ClearCrew, Arbiter, Split Decision, yanzaaa/Quorum).

## Deadline
**Jul 20, 2026 @ 2:00pm PDT** — confirmed extended. ~4 days left.

## What was shipped in win-push (2026-07-16)
- `lib/auditChain.ts` — tamper-evident hash chain (ClearCrew-class)
- `GET /api/audit` — verify chain
- `GET /api/demo-tx` — real base64 serialized txs for Simulator path
- `lib/policySeeds.ts` + stronger compliance pattern hits
- Guardrail **routine corridor** — low-stakes clean transfers can execute
- UI: conflict banner, audit hashes, Wormhole sig preset, serialized presets, metrics 20%
- MCP tool `getAuditChain`
- Docs: README, SUBMISSION, ARCHITECTURE, BLOG, **SUBMIT_NOW.md**
- Tests: `tests/audit-chain.test.ts` (tsc clean; tsx runner flaky in this env)

## Only Yusif (accounts)
See **SUBMIT_NOW.md**:
1. Upload `demo-videos/demo-voiced.mp4` → YouTube public
2. Submit Devpost form (paste SUBMISSION.md)
3. Optional: publish BLOG.md to dev.to
4. Push latest to `qwen` remote + set GitHub homepage/topics

## Live
- http://43.106.15.232:3000 (ECS — was green 2026-07-16)
- Repo: https://github.com/yusizer/on-chain-risk-council

## Competitive position
- Not last: mid-upper Track 3 with strong Solana moat
- Win requires: submit + video + clear pitch vs Quorum clones
- HM $500 realistic; Track win hard vs ClearCrew/Arbiter

## Git
- Parent: `01-solana-agents-skills`
- Remote `qwen` = on-chain-risk-council
- Push: `git subtree split --prefix=qwen-risk-council -b council-subtree && git push qwen council-subtree:main`
