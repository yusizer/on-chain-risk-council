/**
 * lib/auditChain.ts — tamper-evident hash chain for council decisions.
 *
 * Every decision commits to the previous event hash (ClearCrew-class audit
 * property). State is never the source of truth: the chain is. Verification
 * walks prevHash → eventHash and fails at the first broken link.
 *
 * In-process ring buffer for the live demo; DB also stores the hashes when
 * DATABASE_URL is set so the chain survives restarts.
 */
import { createHash } from "node:crypto";
import type { Decision, Outcome } from "./types";

export interface AuditEvent {
  id: string;
  ts: string;
  actionHash: string;
  outcome: Outcome;
  heldBack: boolean;
  tokens: number;
  latencyMs: number;
  voteSummary: string;
  guardrailRules: string[];
  prevHash: string;
  eventHash: string;
}

const GENESIS = "0".repeat(64);
const MAX_EVENTS = 200;

let lastHash = GENESIS;
const chain: AuditEvent[] = [];

function canonical(payload: Omit<AuditEvent, "eventHash">): string {
  return JSON.stringify({
    id: payload.id,
    ts: payload.ts,
    actionHash: payload.actionHash,
    outcome: payload.outcome,
    heldBack: payload.heldBack,
    tokens: payload.tokens,
    latencyMs: payload.latencyMs,
    voteSummary: payload.voteSummary,
    guardrailRules: payload.guardrailRules,
    prevHash: payload.prevHash,
  });
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function actionHashOf(action: unknown): string {
  return sha256Hex(JSON.stringify(action));
}

export function voteSummary(decision: Decision): string {
  return decision.votes.map((v) => `${v.agent}:${v.vote}`).join("|");
}

/** Append a decision to the in-process hash chain. Returns the new event. */
export function appendDecision(decision: Decision, action: unknown): AuditEvent {
  const id = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ts = new Date().toISOString();
  const prevHash = lastHash;
  const base: Omit<AuditEvent, "eventHash"> = {
    id,
    ts,
    actionHash: actionHashOf(action),
    outcome: decision.outcome,
    heldBack: decision.guardrail.heldBack,
    tokens: decision.tokens,
    latencyMs: decision.latencyMs,
    voteSummary: voteSummary(decision),
    guardrailRules: decision.guardrail.rules,
    prevHash,
  };
  const eventHash = sha256Hex(canonical(base));
  const event: AuditEvent = { ...base, eventHash };
  chain.push(event);
  if (chain.length > MAX_EVENTS) chain.shift();
  lastHash = eventHash;
  return event;
}

export function listAuditChain(limit = 50): AuditEvent[] {
  return chain.slice(-limit);
}

export function headHash(): string {
  return lastHash;
}

export function verifyChain(events: AuditEvent[] = chain): {
  ok: boolean;
  checked: number;
  brokenAt: number | null;
  reason?: string;
} {
  if (events.length === 0) return { ok: true, checked: 0, brokenAt: null };
  let expectedPrev = events[0].prevHash === GENESIS ? GENESIS : events[0].prevHash;
  // If we only have a tail, accept the first prevHash as given and verify forward.
  expectedPrev = events[0].prevHash;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.prevHash !== expectedPrev && i > 0) {
      return { ok: false, checked: i, brokenAt: i, reason: `prevHash mismatch at ${e.id}` };
    }
    if (i > 0 && e.prevHash !== events[i - 1].eventHash) {
      return { ok: false, checked: i, brokenAt: i, reason: `broken link at ${e.id}` };
    }
    const recomputed = sha256Hex(
      canonical({
        id: e.id,
        ts: e.ts,
        actionHash: e.actionHash,
        outcome: e.outcome,
        heldBack: e.heldBack,
        tokens: e.tokens,
        latencyMs: e.latencyMs,
        voteSummary: e.voteSummary,
        guardrailRules: e.guardrailRules,
        prevHash: e.prevHash,
      }),
    );
    if (recomputed !== e.eventHash) {
      return { ok: false, checked: i, brokenAt: i, reason: `eventHash mismatch at ${e.id}` };
    }
    expectedPrev = e.eventHash;
  }
  return { ok: true, checked: events.length, brokenAt: null };
}

/** Estimate catastrophic USD exposure a lone agent would have executed. */
export function estimateExposureBlockedUsd(
  amountUsd: number | null | undefined,
  outcome: Outcome,
  loneWouldExecute: boolean,
): number {
  if (!loneWouldExecute) return 0;
  if (outcome === "execute") return 0;
  return Math.max(0, amountUsd ?? 0);
}
