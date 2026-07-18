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
import { matchKnownExploit } from "@/lib/exploitSignatures";
import { appendDecision } from "@/lib/auditChain";
import { ensureSchema, insertDecision } from "@/lib/db";
import { AgentVoteSchema } from "@/lib/types";
import type { ActionInput, AgentVote, CouncilEvent, Decision, SimResult, TrustedActionRecord } from "@/lib/types";

export interface CouncilConfig {
  /** Run a cross-debate revision round (default true). */
  crossDebate?: boolean;
  /** Guardrail thresholds forwarded to guardrail(). */
  highStakesUsd?: number;
  lowConfidence?: number;
  /** Enable pgvector exploit-pattern recall when available (default true). */
  useMemory?: boolean;
  /** Abort long-running council work between phases. */
  signal?: AbortSignal;
}

type Emit = (e: CouncilEvent) => void;

const VOTE_SAFETY: Record<AgentVote["vote"], number> = { execute: 0, escalate: 1, reject: 2 };

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function preserveSafetyFloor(original: AgentVote, revised: AgentVote): AgentVote {
  const attemptedDowngrade = VOTE_SAFETY[revised.vote] < VOTE_SAFETY[original.vote];
  const vote = attemptedDowngrade ? original.vote : revised.vote;
  const flags = uniq([...original.flags, ...revised.flags]);
  const evidence = uniq([...revised.evidence, ...original.evidence]).slice(0, 12);
  const reasoning = attemptedDowngrade
    ? `${revised.reasoning} Safety floor: preserving round-1 ${original.vote} instead of lower-safety revision.`
    : revised.reasoning;
  return { ...revised, vote, flags, evidence, reasoning };
}

function fallbackVote(agent: string, err: unknown): AgentVote {
  return {
    agent,
    vote: "escalate",
    confidence: 0.5,
    reasoning: `${agent} failed or returned invalid JSON; fail-safe escalation.`,
    evidence: [String(err).slice(0, 240)],
    flags: ["agent_error"],
  };
}

async function failSoftVote(agent: string, emit: Emit | undefined, fn: () => Promise<AgentVote>): Promise<AgentVote> {
  try {
    return await fn();
  } catch (e) {
    const v = fallbackVote(agent, e);
    emit?.({ step: agent, agent, status: "error", data: v, message: v.reasoning });
    emit?.({ step: agent, agent, status: "vote", data: v });
    return v;
  }
}

async function reviseVoteSafely(
  vote: AgentVote,
  record: TrustedActionRecord,
  votes: AgentVote[],
  emit: Emit | undefined,
  budget: TokenBudget,
): Promise<AgentVote> {
  try {
    return await reviseVote(vote, record, votes, emit, budget);
  } catch (e) {
    emit?.({
      step: vote.agent,
      agent: vote.agent,
      status: "error",
      message: `round 2 revision failed; preserving round-1 vote: ${String(e).slice(0, 160)}`,
    });
    return vote;
  }
}

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
    `if your original evidence still holds. Vote execute | escalate | reject. ` +
    `Reject only on a concrete exploit signal — do not reject clean routine actions (normal transfer, swap, stake, self-mint); irreversible alone → escalate, not reject.`;
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

  const revised: AgentVote = {
    agent: self.agent,
    vote: raw.vote,
    confidence: raw.confidence,
    reasoning: raw.reasoning,
    evidence: raw.evidence ?? [],
    flags: raw.flags ?? [],
  };
  const v = preserveSafetyFloor(self, revised);
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

  const throwIfAborted = () => {
    if (cfg.signal?.aborted) throw new Error("council aborted");
  };

  throwIfAborted();
  emit?.({ step: "council", status: "start", message: "Council session opened", data: { action } });

  // 1. Intake — produce the structured action record.
  const record: TrustedActionRecord = await intake(action, emit, budget, cfg.signal);
  throwIfAborted();

  // Deterministic known-exploit check — computed BEFORE the agents vote so the
  // exploit match is available to both the Exploit Skeptic and the guardrail.
  const exploitMatch = matchKnownExploit(action);

  // 2. Round 1: specialists in parallel + the simulator in parallel.
  emit?.({ step: "council", status: "start", message: "Round 1 — specialists + simulation" });
  const [r1, sim] = await Promise.all([
    Promise.all([
      failSoftVote("riskAnalyst", emit, () => riskAnalyst(record, emit, budget)),
      failSoftVote("exploitSkeptic", emit, () => exploitSkeptic(record, emit, budget, { useMemory: cfg.useMemory ?? true, exploitMatch, signal: cfg.signal })),
      failSoftVote("compliance", emit, () => compliance(record, emit, budget)),
    ]),
    simulator(action.serializedTx, emit, cfg.signal),
  ]);
  throwIfAborted();
  let votes: AgentVote[] = r1;
  const simResult: SimResult = sim;

  // 3. Round 2: cross-debate revision.
  if (crossDebate) {
    emit?.({ step: "council", status: "start", message: "Round 2 — cross-debate revision" });
    votes = await Promise.all(votes.map((v) => reviseVoteSafely(v, record, votes, emit, budget)));
    throwIfAborted();
  }

  // 4. Referee — the last LLM voice, sees everything.
  const ref = await failSoftVote("referee", emit, () => referee(record, votes, simResult, emit, budget));
  throwIfAborted();
  const allVotes = [...votes, ref];

  // 5. Deterministic guardrail — the actual decision.
  // Pass the pre-computed exploitMatch so the guardrail rejects real on-chain
  // exploits at the code layer, independent of the agents.
  const g = guardrail(allVotes, record, {
    highStakesUsd: cfg.highStakesUsd,
    lowConfidence: cfg.lowConfidence,
    simulation: simResult,
    exploitMatch,
  });
  emit?.({ step: "guardrail", status: "guardrail", data: g, message: g.reason });

  const isUnanimous = unanimous(allVotes);
  const conflict = !isUnanimous;

  const decision: Decision = {
    outcome: g.outcome,
    unanimous: isUnanimous,
    votes: allVotes,
    guardrail: g,
    tokens: budget.tokens,
    latencyMs: Date.now() - t0,
    malicious: null,
    conflict,
  };

  // Tamper-evident hash chain — every decision commits to the previous one.
  const audit = appendDecision(decision, action);
  decision.audit = {
    id: audit.id,
    eventHash: audit.eventHash,
    prevHash: audit.prevHash,
    actionHash: audit.actionHash,
  };
  emit?.({
    step: "audit",
    status: "done",
    data: decision.audit as unknown as Record<string, unknown>,
    message: `eventHash=${audit.eventHash.slice(0, 16)}… prev=${audit.prevHash.slice(0, 12)}…`,
  });

  if (process.env.DATABASE_URL) {
    try {
      await ensureSchema();
      await insertDecision({
        action_hash: decision.audit.actionHash,
        track: record.kind,
        outcome: decision.outcome,
        agent_votes: allVotes,
        guardrail: { ...g, audit: decision.audit },
        malicious: decision.malicious ?? undefined,
        tokens: decision.tokens,
        latency_ms: decision.latencyMs,
      });
    } catch (e) {
      emit?.({ step: "council", status: "error", message: `audit log skipped: ${String(e).slice(0, 160)}` });
    }
  }

  emit?.({
    step: "council",
    status: "done",
    data: decision,
    message: `outcome=${g.outcome} conflict=${conflict} tokens=${budget.tokens} latency=${decision.latencyMs}ms hash=${audit.eventHash.slice(0, 12)}`,
  });
  return decision;
}
