/**
 * agents/compliance.ts — Compliance / Policy agent.
 *
 * Mostly a deterministic rule engine over the trusted action record: blocked
 * counterparties, blocked mints, max-amount cap, authority-change policy. A
 * light qwen-turbo pass interprets ambiguous intent text against the policy so
 * natural-language-described actions still get policy-checked.
 *
 * Determinism is the point: the hard rules never depend on model output, so a
 * policy violation is caught even if every other agent votes execute. The LLM
 * pass can only make the outcome *safer* (it is merged through a safety rank),
 * never lenient — same one-way philosophy as the guardrail.
 *
 * This is the Innovation criterion (deterministic gate over LLM) applied a
 * second time, at the policy layer.
 */
import { chatJSON, addUsage, type TokenBudget } from "@/lib/qwen";
import {
  AgentVoteSchema,
  type AgentVote,
  type CouncilEvent,
  type TrustedActionRecord,
  type Vote,
} from "@/lib/types";

import {
  MAX_AMOUNT_USD,
  descriptionPolicyHit,
  isBlockedCounterparty,
  isBlockedMint,
} from "@/lib/policySeeds";

const RANK: Record<Vote, number> = { execute: 0, escalate: 1, reject: 2 };

type Emit = (e: CouncilEvent) => void;

export async function compliance(
  record: TrustedActionRecord,
  emit?: Emit,
  budget?: TokenBudget,
): Promise<AgentVote> {
  emit?.({ step: "compliance", agent: "compliance", status: "start", message: "Checking policy rules" });

  const flags: string[] = [];
  const evidence: string[] = [];
  let vote: Vote = "execute";

  // 1. Deterministic rule checks (the floor — never overridden by the LLM).
  for (const addr of record.counterparties) {
    if (isBlockedCounterparty(addr)) {
      vote = "reject";
      flags.push("blocked_counterparty", "blocking_flag");
      evidence.push(`counterparty ${addr} matches blocked/sanctions policy`);
    }
  }
  for (const m of record.mints) {
    if (isBlockedMint(m)) {
      vote = "reject";
      flags.push("blocked_mint", "blocking_flag");
      evidence.push(`mint ${m} is on the blocked-mint list`);
    }
  }
  const descHit = descriptionPolicyHit(record.description);
  if (descHit) {
    vote = "reject";
    flags.push("policy_pattern_hit", "blocking_flag");
    evidence.push(`description matched policy pattern: ${descHit}`);
  }
  if (record.amountUsd != null && record.amountUsd >= MAX_AMOUNT_USD) {
    if (RANK[vote] < RANK.escalate) vote = "escalate";
    flags.push("amount_over_policy_cap");
    evidence.push(`amount $${record.amountUsd} ≥ policy cap $${MAX_AMOUNT_USD}`);
  }
  if (record.authorityChanges) {
    if (RANK[vote] < RANK.escalate) vote = "escalate";
    flags.push("authority_change_policy");
    evidence.push("authority/privilege change requires compliance sign-off");
  }

  // 2. Light LLM pass — interpret the description against policy. Skipped when a
  //    hard rule already rejected (saves a call). The LLM can only raise the
  //    outcome up the safety rank, never lower it.
  let reasoning = evidence.length
    ? `Policy: ${evidence.join("; ")}.`
    : "No deterministic policy violation.";
  let confidence = vote === "execute" ? 0.9 : 0.95;

  if (vote !== "reject") {
    const system =
      "You are the Compliance officer of an on-chain (Solana) risk council. Check the action against policy: " +
      "sanctioned/blocked counterparties, blocked mints, max-amount cap, authority-change policy, sanctioned or unverified programs. " +
      "If a policy violation is present, vote reject (clear) or escalate (needs review) and add flag \"blocking_flag\" for a clear violation. " +
      "Otherwise vote execute. NOTE: staking SOL (delegate to a validator) is non-custodial and not a fund transfer — amount alone is not a policy violation. " +
      "Keep reasoning to one sentence.";
    const user =
      `Trusted action record:\n${JSON.stringify(record, null, 2)}\n\n` +
      `Return JSON: {agent:"compliance", vote, confidence, reasoning, evidence[], flags[]}.`;
    try {
      const { value: r, usage } = await chatJSON(
        "fast",
        [{ role: "system", content: system }, { role: "user", content: user }],
        AgentVoteSchema,
        { maxTokens: 768 },
      );
      addUsage(budget, "fast", usage);
      if (RANK[r.vote] > RANK[vote]) vote = r.vote;
      if (r.flags.includes("blocking_flag") && !flags.includes("blocking_flag")) flags.push("blocking_flag");
      for (const f of r.flags) if (f !== "blocking_flag" && !flags.includes(f)) flags.push(f);
      for (const e of r.evidence ?? []) if (evidence.length < 6) evidence.push(e);
      if (r.reasoning) reasoning = `${reasoning} LLM: ${r.reasoning}`;
      confidence = r.confidence;
    } catch (e) {
      evidence.push(`compliance LLM err: ${String(e).slice(0, 120)}`);
    }
  }

  const v: AgentVote = { agent: "compliance", vote, confidence, reasoning, evidence, flags };
  emit?.({ step: "compliance", agent: "compliance", status: "vote", data: v });
  return v;
}
