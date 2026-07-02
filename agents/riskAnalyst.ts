/**
 * agents/riskAnalyst.ts — Risk Analyst (qwen3.7-max).
 *
 * Assesses the action across risk dimensions: amount at risk, counterparty
 * novelty, authority/privilege changes, recoverability. Returns one structured
 * AgentVote. Raises `blocking_flag` only for clear danger so the guardrail can
 * hold the action even when other agents are lenient.
 */
import { chatJSON, addUsage, type TokenBudget } from "@/lib/qwen";
import { AgentVoteSchema, type AgentVote, type CouncilEvent, type TrustedActionRecord } from "@/lib/types";

type Emit = (e: CouncilEvent) => void;

export async function riskAnalyst(record: TrustedActionRecord, emit?: Emit, budget?: TokenBudget): Promise<AgentVote> {
  const system =
    "You are the Risk Analyst of an on-chain (Solana) risk council. Evaluate the action across: (a) amount at risk, (b) counterparty novelty — fresh/unknown accounts are riskier, " +
    "(c) authority or privilege changes (setAuthority, approve delegate, close-account), (d) recoverability. " +
    "Vote one of: execute (safe to proceed), escalate (needs human check), reject (clearly malicious/unsafe). " +
    "Set confidence 0..1. List concrete evidence lines. Add flag \"blocking_flag\" ONLY for clear danger " +
    "(e.g., setAuthority to an unknown account, large transfer to a freshly-funded wallet, burn of user funds).";

  const user = `Trusted action record:\n${JSON.stringify(record, null, 2)}\n\n` +
    `Return JSON: {agent:"riskAnalyst", vote, confidence, reasoning, evidence[], flags[]}.`;

  emit?.({ step: "riskAnalyst", agent: "riskAnalyst", status: "start", message: "Analysing risk dimensions" });
  const { value: raw, usage } = await chatJSON(
    "reasoning",
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    AgentVoteSchema,
    { maxTokens: 1536 },
  );
  addUsage(budget, "reasoning", usage);

  const v: AgentVote = {
    agent: "riskAnalyst",
    vote: raw.vote,
    confidence: raw.confidence,
    reasoning: raw.reasoning,
    evidence: raw.evidence ?? [],
    flags: raw.flags ?? [],
  };
  emit?.({ step: "riskAnalyst", agent: "riskAnalyst", status: "vote", data: v });
  return v;
}
