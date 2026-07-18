/**
 * benchmark/baselines.ts — the comparison arms for the honest benchmark.
 *
 * Each baseline reviews the SAME labelled actions and returns a Decision, so
 * the runner can compare metrics across arms. The thesis: a deterministic
 * guardrail over a multi-agent society beats a lone strong model.
 *
 *   lone-agent        — single qwen3.7-max vote, SAME intake + Helius evidence
 *                       as the council, but NO multi-agent debate and NO
 *                       deterministic guardrail. (Fair: the lone model sees the
 *                       same on-chain data, only lacks the society + code floor.)
 *   council-no-memory — full runCouncil: 5 agents + cross-debate + guardrail,
 *                       WITHOUT pgvector exploit recall (recall stubs out
 *                       without DATABASE_URL).
 *   council-full      — same as no-memory + pgvector exploit memory. Requires
 *                       DATABASE_URL; skipped until D4.
 *
 * Fair comparison: lone-agent now gets the SAME intake + Helius evidence as
 * the council arms — only the multi-agent debate and deterministic guardrail
 * differ. That isolates what the society contributes.
 */
import { AgentVoteSchema } from "@/lib/types";
import { runCouncil, type CouncilConfig } from "@/orchestrator/council";
import { addUsage, chatJSON, newBudget, type TokenBudget } from "@/lib/qwen";
import { intake } from "@/agents/intake";
import type { ActionInput, AgentVote, CouncilEvent, Decision, GuardrailResult } from "@/lib/types";

type Emit = (e: CouncilEvent) => void;

export interface Baseline {
  name: string;
  description: string;
  /** True if this arm needs pgvector memory (DATABASE_URL). */
  needsMemory: boolean;
  run: (action: ActionInput, emit?: Emit, signal?: AbortSignal) => Promise<Decision>;
}

/** A guardrail placeholder for the lone-agent arm (no deterministic gate). */
function noGuardrail(outcome: Decision["outcome"]): GuardrailResult {
  return {
    outcome,
    heldBack: false,
    reason: "lone-agent raw — no deterministic guardrail applied",
    rules: [],
  };
}

/** Lone wolf: same intake + Helius as council, then one qwen3.7-max vote, no guardrail. */
async function loneAgent(action: ActionInput, emit?: Emit, signal?: AbortSignal): Promise<Decision> {
  const t0 = Date.now();
  const budget: TokenBudget = newBudget();
  emit?.({ step: "lone-agent", status: "start", message: "Single model baseline (with intake + Helius evidence)" });

  // Run the SAME intake as the council — deterministic extraction + Helius parse.
  emit?.({ step: "lone-agent", agent: "intake", status: "start", message: "Intaking action (same path as council)" });
  const record = await intake(action, emit, budget, signal);

  const evidence = [
    `Trusted action record: ${JSON.stringify({
      kind: record.kind,
      amountUsd: record.amountUsd,
      counterparties: record.counterparties,
      mints: record.mints,
      authorityChanges: record.authorityChanges,
      reversible: record.reversible,
      stakes: record.stakes,
    }, null, 2)}`,
    `Description: ${record.description}`,
  ];
  if (record.raw?.helius) {
    evidence.push(`Helius on-chain evidence: ${JSON.stringify(record.raw.helius).slice(0, 3000)}`);
  }

  const system =
    "You are a single Solana transaction risk reviewer. " +
    "Given a trusted on-chain action record with Helius evidence, vote execute | escalate | reject. " +
    "Reject concrete exploit/drainer behavior; escalate uncertainty or high-stakes irreversible actions; " +
    "execute clearly routine low-risk actions. " +
    "Return strict JSON.";
  const user = `Trusted action record:\n${JSON.stringify(record, null, 2)}\n\nEvidence:\n${evidence.join("\n")}\n\nReturn JSON: {agent:"riskAnalyst", vote, confidence, reasoning, evidence[], flags[]}.`;
  const { value: raw, usage } = await chatJSON(
    "reasoning",
    [{ role: "system", content: system }, { role: "user", content: user }],
    AgentVoteSchema,
    { maxTokens: 1536 },
  );
  addUsage(budget, "reasoning", usage);
  const vote: AgentVote = {
    agent: "riskAnalyst",
    vote: raw.vote,
    confidence: raw.confidence,
    reasoning: raw.reasoning,
    evidence: raw.evidence ?? [],
    flags: raw.flags ?? [],
  };
  emit?.({ step: "lone-agent", agent: "riskAnalyst", status: "vote", data: vote });
  const latencyMs = Date.now() - t0;
  return {
    outcome: vote.vote,
    unanimous: true,
    votes: [vote],
    guardrail: noGuardrail(vote.vote),
    tokens: budget.tokens,
    latencyMs,
    malicious: null,
  };
}

/** Full council, with configurable cross-debate (used by both council arms). */
async function council(action: ActionInput, emit: Emit | undefined, cfg: CouncilConfig): Promise<Decision> {
  return runCouncil(action, emit, cfg);
}

export const BASELINES: Baseline[] = [
  {
    name: "lone-agent",
    description: "Single qwen3.7-max vote; no council, no deterministic guardrail (pure-LLM lone wolf).",
    needsMemory: false,
    run: (action, emit, signal) => loneAgent(action, emit, signal),
  },
  {
    name: "council-no-memory",
    description: "Full council (5 agents + cross-debate + guardrail) without pgvector exploit recall.",
    needsMemory: false,
    run: (action, emit, signal) => council(action, emit, { crossDebate: true, useMemory: false, signal }),
  },
  {
    name: "council-full",
    description: "Full council WITH pgvector exploit-pattern memory (requires DATABASE_URL).",
    needsMemory: true,
    run: (action, emit, signal) => council(action, emit, { crossDebate: true, useMemory: true, signal }),
  },
];

export function selectBaselines(withMemory: boolean): Baseline[] {
  return BASELINES.filter((b) => !b.needsMemory || withMemory);
}
