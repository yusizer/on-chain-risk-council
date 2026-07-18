/**
 * lib/guardrail.ts — Deterministic one-way-ratchet guardrail.
 *
 * The final decision is NOT the agents' vote. It is a deterministic rule that
 * reads `stakes` + `reversibility` from the structured action record, not from
 * free-text agent reasoning, and can only make the outcome SAFER, never riskier.
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
import type { AgentVote, TrustedActionRecord, Vote, Outcome, GuardrailResult, SimResult } from "./types";
import type { ExploitMatch } from "./exploitSignatures";
import { AUTO_EXECUTE_MAX_USD, descriptionPolicyHit } from "./policySeeds";

const SAFETY: Record<Outcome, number> = { execute: 0, escalate: 1, reject: 2 };
const RANK: Outcome[] = ["execute", "escalate", "reject"];
const ROUTINE_KINDS = new Set(["transfer", "swap", "stake", "config", "mint"]);

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
  autoExecuteMaxUsd?: number; // default AUTO_EXECUTE_MAX_USD (routine corridor)
  simulation?: SimResult;
  /**
   * Deterministic known-exploit hit (exact signature match). When present, the
   * guardrail auto-rejects REGARDLESS of the agents' votes — this is the code
   * floor that makes "consensus is necessary, never sufficient" real. A
   * unanimously-approved Wormhole/Cashio signature is still blocked here.
   */
  exploitMatch?: ExploitMatch | null;
}

/**
 * Low-stakes routine corridor: irreversible alone does not force escalate when
 * the action is a plain transfer/swap/stake/config, no authority change, low
 * stakes, and under the auto-execute USD cap. High-stakes / authority / policy
 * flags still hold back. Improves clean throughput without unlocking drainers.
 */
export function isRoutineCorridor(
  trusted: TrustedActionRecord,
  autoExecuteMaxUsd = AUTO_EXECUTE_MAX_USD,
): boolean {
  if (trusted.authorityChanges) return false;
  if (trusted.stakes === "high") return false;
  if (!ROUTINE_KINDS.has(trusted.kind)) return false;
  if (trusted.amountUsd != null && trusted.amountUsd >= autoExecuteMaxUsd) return false;
  return true;
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
  const autoExecuteMaxUsd = cfg.autoExecuteMaxUsd ?? AUTO_EXECUTE_MAX_USD;
  const routine = isRoutineCorridor(trusted, autoExecuteMaxUsd);

  const rules: string[] = [];

  // ── deterministic known-exploit floor ──────────────────────────────────
  // Code decides before any tally: a real on-chain exploit signature is rejected
  // no matter what the agents voted. This is the architectural safety floor.
  if (cfg.exploitMatch) {
    rules.push("known_exploit_signature_reject");
    return {
      outcome: "reject",
      heldBack: false,
      reason:
        `Deterministic guardrail rejected a KNOWN on-chain exploit signature ` +
        `(${cfg.exploitMatch.name}, ${cfg.exploitMatch.label}): ${cfg.exploitMatch.detail}`,
      rules,
    };
  }

  // ── deterministic policy-pattern floor (intent-only / synthetic demos) ──
  // When the action description itself is clearly drainer / rugpull / fake-mint /
  // authority-to-freshly-funded-wallet language, consensus is never enough: the
  // code ratchets up to escalate so a human reviews it. Prevents an LLM council
  // from "approving" a self-described drainer intent.
  const policyHit = descriptionPolicyHit(trusted.description);
  if (policyHit) {
    rules.push("policy_pattern_hit_escalated");
    const escalated = tallyVotes(votes) === "execute" ? "escalate" : tallyVotes(votes);
    return {
      outcome: escalated,
      heldBack: tallyVotes(votes) === "execute",
      reason:
        `Deterministic guardrail escalated a clear policy-pattern hit (${policyHit}) ` +
        `in the action description; a unanimous execute is not sufficient for drainer/rugpull/fake-mint language.`,
      rules,
    };
  }

  const raw = tallyVotes(votes);
  let outcome = raw;

  // helper: record every fired rule, and push outcome up to at least `minRank`.
  const clamp = (minRank: Outcome, rule: string) => {
    rules.push(rule);
    if (SAFETY[outcome] < SAFETY[minRank]) {
      outcome = minRank;
    }
  };

  // ── hard rules: irreversibility + high stakes + low confidence + blocking flags
  // Routine low-stakes corridor skips the pure-irreversibility hold (efficiency).
  if (!trusted.reversible && !routine) clamp("escalate", "irreversible_action_held_back");
  if (routine && raw === "execute") rules.push("routine_corridor_allowed");
  if (trusted.stakes === "high") clamp("escalate", "high_stakes_held_back");
  // When the routine corridor already passed, skip the amount threshold check
  // to avoid over-escalating routine actions that have legitimately large amounts
  // (e.g. staking 50 SOL to an established validator — non-custodial).
  if (!routine && trusted.amountUsd != null && trusted.amountUsd >= highStakesUsd)
    clamp("escalate", "amount_above_threshold_held_back");
  if (meanConfidence(votes) < lowConfidence) clamp("escalate", "low_confidence_held_back");
  if (anyBlockingFlag(votes)) clamp("escalate", "agent_blocking_flag");
  if (cfg.simulation?.failed) clamp("escalate", "simulation_failed_held_back");

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
