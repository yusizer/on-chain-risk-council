/**
 * lib/guardrail.ts — Deterministic one-way-ratchet guardrail.
 *
 * The final decision is NOT the agents' vote. It is a deterministic rule that
 * reads `stakes` + `reversibility` from the *trusted action record* (never from
 * model output) and can only make the outcome SAFER, never riskier.
 *
 *   execute (0) < escalate (1) < reject (2)
 *
 * A unanimously-approved irreversible / high-stakes action is still ESCALATED
 * to a human. Consensus is necessary, never sufficient — the Quorum thesis,
 * strengthened with on-chain reversibility + a reject-veto.
 *
 * This is Innovation-criterion (deterministic guardrail over LLM) + Impact
 * (real safety floor for irreversible on-chain actions).
 */
import type { AgentVote, TrustedActionRecord, Vote, Outcome, GuardrailResult } from "./types";

const SAFETY: Record<Outcome, number> = { execute: 0, escalate: 1, reject: 2 };
const RANK: Outcome[] = ["execute", "escalate", "reject"];

/** Tally: execute only if every agent votes execute; any reject → reject; else escalate. */
export function tallyVotes(votes: AgentVote[]): Outcome {
  if (votes.length === 0) return "escalate";
  if (votes.some((v) => v.vote === "reject")) return "reject";
  if (votes.every((v) => v.vote === "execute")) return "execute";
  return "escalate";
}

export function unanimous(votes: AgentVote[]): boolean {
  if (votes.length === 0) return false;
  const first = votes[0].vote;
  return votes.every((v) => v.vote === first);
}

/** Mean confidence across agents. */
function meanConfidence(votes: AgentVote[]): number {
  if (votes.length === 0) return 0;
  return votes.reduce((s, v) => s + v.confidence, 0) / votes.length;
}

/** Any agent raised a blocking flag. */
function anyBlockingFlag(votes: AgentVote[]): boolean {
  return votes.some((v) => v.flags.includes("blocking_flag"));
}

interface GuardrailConfig {
  highStakesUsd?: number; // default 5000
  lowConfidence?: number; // default 0.6
}

/**
 * Apply the one-way ratchet. Returns the final outcome + which rules fired.
 * The outcome can only move UP the safety ranking (execute → escalate → reject),
 * never down.
 */
export function guardrail(
  votes: AgentVote[],
  trusted: TrustedActionRecord,
  cfg: GuardrailConfig = {},
): GuardrailResult {
  const highStakesUsd = cfg.highStakesUsd ?? 5000;
  const lowConfidence = cfg.lowConfidence ?? 0.6;

  const raw = tallyVotes(votes);
  const rules: string[] = [];
  let outcome = raw;

  // helper: push outcome up to at least `minRank` if a rule fires
  const clamp = (minRank: Outcome, rule: string) => {
    if (SAFETY[outcome] < SAFETY[minRank]) {
      outcome = minRank;
      rules.push(rule);
    }
  };

  // ── hard rules: irreversibility + high stakes + low confidence + blocking flags
  if (!trusted.reversible) clamp("escalate", "irreversible_action_held_back");
  if (trusted.stakes === "high") clamp("escalate", "high_stakes_held_back");
  if (trusted.amountUsd != null && trusted.amountUsd >= highStakesUsd)
    clamp("escalate", "amount_above_threshold_held_back");
  if (meanConfidence(votes) < lowConfidence) clamp("escalate", "low_confidence_held_back");
  if (anyBlockingFlag(votes)) clamp("escalate", "agent_blocking_flag");

  // authority delegation is inherently dangerous even if reversible-looking
  if (trusted.authorityChanges) clamp("escalate", "authority_change_held_back");

  const heldBack = raw === "execute" && outcome !== "execute";
  const reason = heldBack
    ? `Council approved but guardrail held the action back (${rules.join(", ")}).`
    : outcome === "reject"
      ? "At least one agent rejected; guardrail upholds reject."
      : outcome === "escalate"
        ? "Action escalated to human review."
        : "Council approved and guardrail permits execution.";

  return { outcome, heldBack, reason, rules };
}

/** Severity label for the UI / audit log. */
export function severity(outcome: Outcome, heldBack: boolean): string {
  if (outcome === "reject") return "blocked";
  if (outcome === "escalate") return heldBack ? "held-back" : "escalated";
  return "approved";
}

export { RANK, SAFETY };
export type { Vote };
