/**
 * benchmark/baselines.ts — the comparison arms for the honest benchmark.
 *
 * Each baseline reviews the SAME labelled actions and returns a Decision, so
 * the runner can compare metrics across arms. The thesis: a deterministic
 * guardrail over a multi-agent society beats a lone strong model.
 *
 *   lone-agent        — single qwen3.7-max vote, NO council, NO guardrail.
 *                       (The "lone wolf" most competitors ship. Pure LLM.)
 *   council-no-memory — full runCouncil: 5 agents + cross-debate + guardrail,
 *                       WITHOUT pgvector exploit recall (recall stubs out
 *                       without DATABASE_URL).
 *   council-full      — same as no-memory + pgvector exploit memory. Requires
 *                       DATABASE_URL; skipped until D4.
 *
 * Fair comparison: every baseline that uses the guardrail uses the SAME intake
 * + the SAME guardrail code — only the council (agent diversity + debate) and
 * the memory vary. That isolates what each layer contributes.
 */
import { intake } from "@/agents/intake";
import { riskAnalyst } from "@/agents/riskAnalyst";
import { runCouncil, type CouncilConfig } from "@/orchestrator/council";
import { guardrail } from "@/lib/guardrail";
import { newBudget, type TokenBudget } from "@/lib/qwen";
import type { ActionInput, CouncilEvent, Decision, GuardrailResult } from "@/lib/types";

type Emit = (e: CouncilEvent) => void;

export interface Baseline {
  name: string;
  description: string;
  /** True if this arm needs pgvector memory (DATABASE_URL). */
  needsMemory: boolean;
  run: (action: ActionInput, emit?: Emit) => Promise<Decision>;
}

/** A guardrail placeholder for the raw lone-agent arm (no deterministic gate). */
function noGuardrail(outcome: Decision["outcome"]): GuardrailResult {
  return {
    outcome,
    heldBack: false,
    reason: "lone-agent raw — no deterministic guardrail applied",
    rules: [],
  };
}

/** Lone wolf: one qwen3.7-max vote, outcome = the vote, no guardrail. */
async function loneAgent(action: ActionInput, emit?: Emit): Promise<Decision> {
  const t0 = Date.now();
  const budget: TokenBudget = newBudget();
  const rec = await intake(action, emit, budget);
  const vote = await riskAnalyst(rec, emit, budget);
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
    run: (action, emit) => loneAgent(action, emit),
  },
  {
    name: "council-no-memory",
    description: "Full council (5 agents + cross-debate + guardrail) without pgvector exploit recall.",
    needsMemory: false,
    run: (action, emit) => council(action, emit, { crossDebate: true }),
  },
  {
    name: "council-full",
    description: "Full council WITH pgvector exploit-pattern memory (requires DATABASE_URL).",
    needsMemory: true,
    run: (action, emit) => council(action, emit, { crossDebate: true }),
  },
];

export function selectBaselines(withMemory: boolean): Baseline[] {
  return BASELINES.filter((b) => !b.needsMemory || withMemory);
}
