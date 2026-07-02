/**
 * orchestrator/council.ts — the council debate loop + SSE event stream.
 *
 * Single entrypoint: runCouncil(action, emit?, cfg?) -> Decision.
 *
 * Flow:
 *   1. intake            -> TrustedActionRecord (real on-chain parse via Helius)
 *   2. round 1 (parallel): riskAnalyst + exploitSkeptic + compliance -> votes
 *      (parallel)         simulator -> SimResult (fork-sim, no submit)
 *   3. round 2 (cross-debate): each specialist sees the others' round-1 votes
 *      and may revise (one revision round; configurable, default on).
 *   4. referee           -> final AgentVote (sees record + all votes + sim)
 *   5. guardrail         -> deterministic one-way-ratchet outcome
 *
 * Emits a CouncilEvent stream via the emit callback (used by /api/stream SSE).
 * Totals token usage via a threaded TokenBudget (concurrent-safe across
 * requests — no module-global state).
 *
 * The LLM never decides alone: agents advise, the referee arbitrates, the
 * deterministic guardrail decides. That is the whole thesis.
 */
import { chatJSON, addUsage, newBudget, type Role, type TokenBudget } from "@/lib/qwen";
import { intake } from "@/agents/intake";
import { riskAnalyst } from "@/agents/riskAnalyst";
import { exploitSkeptic } from "@/agents/exploitSkeptic";
import { compliance } from "@/agents/compliance";
import { simulator } from "@/agents/simulator";
import { referee } from "@/agents/referee";
import { guardrail, unanimous } from "@/lib/guardrail";
import { AgentVoteSchema } from "@/lib/types";
import type { ActionInput, AgentVote, CouncilEvent, Decision, SimResult, TrustedActionRecord } from "@/lib/types";

export interface CouncilConfig {
  /** Run a cross-debate revision round (default true). */
  crossDebate?: boolean;
  /** Guardrail thresholds forwarded to guardrail(). */
  highStakesUsd?: number;
  lowConfidence?: number;
}

type Emit = (e: CouncilEvent) => void;

/** Pick the model role for an agent name (revision uses the same model). */
function roleFor(agent: string): Role {
  if (agent === "exploitSkeptic") return "coder";
  if (agent === "compliance") return "fast";
  return "reasoning";
}

/**
 * Cross-debate revision: a specialist sees the other councillors' round-1 votes
 * and may revise. Stays grounded in its own specialty — not mere conformity.
 */
async function reviseVote(
  self: AgentVote,
  record: TrustedActionRecord,
  allVotes: AgentVote[],
  emit: Emit | undefined,
  budget: TokenBudget,
): Promise<AgentVote> {
  const peers = allVotes.filter((v) => v.agent !== self.agent);
  const peerLine = peers
    .map((v) => `${v.agent}:${v.vote}(conf ${v.confidence.toFixed(2)})${v.flags.length ? `[${v.flags.join(",")}]` : ""}`)
    .join("  ");
  const role = roleFor(self.agent);

  const system =
    `You are the ${self.agent} of an on-chain (Solana) risk council, in a cross-debate round. ` +
    `You see the other councillors' votes. You may revise your own vote based on new evidence they raise, ` +
    `but stay grounded in your specialty — do not simply conform to the majority. Keep flag \"blocking_flag\" ` +
    `if your original evidence still holds. Vote execute | escalate | reject.`;
  const user =
    `Trusted action record:\n${JSON.stringify(record, null, 2)}\n\n` +
    `Your round-1 vote: ${self.vote} (conf ${self.confidence.toFixed(2)}), flags [${self.flags.join(",")}]\n` +
    `Your reasoning: ${self.reasoning}\n\n` +
    `Peers:\n${peerLine}\n\n` +
    `Return JSON: {agent:"${self.agent}", vote, confidence, reasoning, evidence[], flags[]}.`;

  const { value: raw, usage } = await chatJSON(
    role,
    [{ role: "system", content: system }, { role: "user", content: user }],
    AgentVoteSchema,
    { maxTokens: 1280 },
  );
  addUsage(budget, role, usage);

  const v: AgentVote = {
    agent: self.agent,
    vote: raw.vote,
    confidence: raw.confidence,
    reasoning: raw.reasoning,
    evidence: raw.evidence ?? [],
    flags: raw.flags ?? [],
  };
  emit?.({ step: self.agent, agent: self.agent, status: "vote", data: v, message: "round 2 revision" });
  return v;
}

export async function runCouncil(
  action: ActionInput,
  emit?: Emit,
  cfg: CouncilConfig = {},
): Promise<Decision> {
  const t0 = Date.now();
  const budget = newBudget();
  const crossDebate = cfg.crossDebate ?? true;

  emit?.({ step: "council", status: "start", message: "Council session opened", data: { action } });

  // 1. Intake — produce the trusted action record.
  const record: TrustedActionRecord = await intake(action, emit, budget);

  // 2. Round 1: specialists in parallel + the simulator in parallel.
  emit?.({ step: "council", status: "start", message: "Round 1 — specialists + simulation" });
  const [r1, sim] = await Promise.all([
    Promise.all([
      riskAnalyst(record, emit, budget),
      exploitSkeptic(record, emit, budget),
      compliance(record, emit, budget),
    ]),
    simulator(action.serializedTx, emit),
  ]);
  let votes: AgentVote[] = r1;
  const simResult: SimResult = sim;

  // 3. Round 2: cross-debate revision.
  if (crossDebate) {
    emit?.({ step: "council", status: "start", message: "Round 2 — cross-debate revision" });
    votes = await Promise.all(votes.map((v) => reviseVote(v, record, votes, emit, budget)));
  }

  // 4. Referee — the last LLM voice, sees everything.
  const ref = await referee(record, votes, simResult, emit, budget);
  const allVotes = [...votes, ref];

  // 5. Deterministic guardrail — the actual decision.
  const g = guardrail(allVotes, record, {
    highStakesUsd: cfg.highStakesUsd,
    lowConfidence: cfg.lowConfidence,
  });
  emit?.({ step: "guardrail", status: "guardrail", data: g, message: g.reason });

  const decision: Decision = {
    outcome: g.outcome,
    unanimous: unanimous(allVotes),
    votes: allVotes,
    guardrail: g,
    tokens: budget.tokens,
    latencyMs: Date.now() - t0,
    malicious: null,
  };
  emit?.({
    step: "council",
    status: "done",
    data: decision,
    message: `outcome=${g.outcome} tokens=${budget.tokens} latency=${decision.latencyMs}ms`,
  });
  return decision;
}
