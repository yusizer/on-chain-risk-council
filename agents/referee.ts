/**
 * agents/referee.ts — Referee (qwen3.7-max), the last voice before the guardrail.
 *
 * Sees the trusted action record, every prior agent vote (riskAnalyst,
 * exploitSkeptic, compliance), and the simulator result (logs / CU / failure).
 * It arbitrates the council and returns a final AgentVote. The deterministic
 * guardrail then has the last word — the referee is the strongest LLM voice,
 * not the decision-maker.
 *
 * Voting last + seeing all evidence is the "society" in Agent Society: a
 * heavier model arbitrates the lighter specialists rather than any one agent
 * deciding alone. (Innovation criterion: multi-model + role-specialised debate.)
 */
import { chatJSON, addUsage, type TokenBudget } from "@/lib/qwen";
import {
  AgentVoteSchema,
  type AgentVote,
  type CouncilEvent,
  type SimResult,
  type TrustedActionRecord,
} from "@/lib/types";

type Emit = (e: CouncilEvent) => void;

export async function referee(
  record: TrustedActionRecord,
  priorVotes: AgentVote[],
  sim: SimResult,
  emit?: Emit,
  budget?: TokenBudget,
): Promise<AgentVote> {
  emit?.({ step: "referee", agent: "referee", status: "start", message: "Arbitrating council votes + simulation" });

  const tally = priorVotes
    .map((v) => `${v.agent}:${v.vote}(conf ${v.confidence.toFixed(2)})${v.flags.length ? `[${v.flags.join(",")}]` : ""}`)
    .join("  ");
  const simLine = sim.ran
    ? `Simulation: ${sim.failed ? "FAILED" : "ok"}, CU=${sim.computeUnits ?? "?"}, fee=${sim.feeLamports ?? "?"} lamports. ${sim.summary}`.slice(0, 800)
    : `Simulation: skipped (${sim.reason ?? "no serialized tx"})`;

  const system =
    "You are the Referee of an on-chain (Solana) risk council. You vote LAST, after the specialists (riskAnalyst, exploitSkeptic, compliance) and after on-chain simulation. " +
    "Weigh their votes and confidence against the trusted action record and the simulation result. A simulation failure, or high compute units combined with authority changes, is a strong negative signal. " +
    "Vote execute | escalate | reject. You may override a lenient council when the evidence is damning, but do NOT over-block either: a unanimous execute on a clean irreversible action (normal transfer, DEX swap, stake to an established counterparty) should be execute or escalate, NOT reject. " +
    "Reserve reject for a concrete exploit. Irreversible + high-stakes + genuinely uncertain → escalate (human review), not reject. " +
    "Set confidence 0..1. Add flag \"blocking_flag\" only if you conclude the action is a concrete exploit (drainer / account-takeover / rugpull).";

  const user =
    `Trusted action record:\n${JSON.stringify(record, null, 2)}\n\n` +
    `Council votes so far:\n${tally}\n\n` +
    `${simLine}\n\n` +
    `Return JSON: {agent:"referee", vote, confidence, reasoning, evidence[], flags[]}.`;

  const { value: raw, usage } = await chatJSON(
    "reasoning",
    [{ role: "system", content: system }, { role: "user", content: user }],
    AgentVoteSchema,
    { maxTokens: 1536 },
  );
  addUsage(budget, "reasoning", usage);

  const v: AgentVote = {
    agent: "referee",
    vote: raw.vote,
    confidence: raw.confidence,
    reasoning: raw.reasoning,
    evidence: [...(raw.evidence ?? []), simLine],
    flags: raw.flags ?? [],
  };
  emit?.({ step: "referee", agent: "referee", status: "vote", data: v });
  return v;
}
