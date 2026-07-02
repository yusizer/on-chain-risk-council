/**
 * lib/types.ts — shared zod schemas for the On-Chain Risk Council.
 *
 * Every agent produces a well-typed object validated by a schema. The guardrail
 * never trusts free text: it reads the *trusted action record* (derived from
 * parsed on-chain data, not from model output).
 */
import { z } from "zod";

/* ── Input ─────────────────────────────────────────────────────────────────── */

export const ActionInputSchema = z
  .object({
    signature: z.string().optional(), // Solana tx signature to review
    serializedTx: z.string().optional(), // base64 serialized tx
    intent: z.string().optional(), // natural-language intent
    requester: z.string().optional(),
    network: z.string().default("mainnet"),
  })
  .refine(
    (a) => a.signature || a.serializedTx || a.intent,
    "Provide one of: signature | serializedTx | intent",
  );
export type ActionInput = z.infer<typeof ActionInputSchema>;

/* ── Trusted action record (derived, NOT from LLM) ─────────────────────────── */

export const ActionKindSchema = z.enum([
  "transfer",
  "swap",
  "authority_delegation",
  "config",
  "mint",
  "burn",
  "stake",
  "close_account",
  "unknown",
]);
export type ActionKind = z.infer<typeof ActionKindSchema>;

export const StakesSchema = z.enum(["low", "medium", "high"]);
export type Stakes = z.infer<typeof StakesSchema>;

export const TrustedActionRecordSchema = z.object({
  kind: ActionKindSchema,
  amountUsd: z.number().nullable(),
  counterparties: z.array(z.string()), // external accounts the action touches
  mints: z.array(z.string()),
  authorityChanges: z.boolean(), // setAuthority / approve delegate / close-authority
  reversible: z.boolean(), // can the effect be undone?
  stakes: StakesSchema,
  description: z.string(), // human-readable parsed summary
  raw: z.record(z.string(), z.unknown()).default({}),
});
export type TrustedActionRecord = z.infer<typeof TrustedActionRecordSchema>;

/* ── Simulation result (Helius simulateTransaction, fork-sim — no submit) ──── */

export const SimResultSchema = z.object({
  ran: z.boolean(), // false if skipped (intent-only / no serialized tx)
  reason: z.string().optional(), // why skipped, when ran=false
  failed: z.boolean().default(false), // instruction error / runtime failure
  computeUnits: z.number().nullable(),
  logs: z.array(z.string()).default([]),
  feeLamports: z.number().nullable(),
  summary: z.string().default(""), // one-line human-readable
  raw: z.record(z.string(), z.unknown()).default({}),
});
export type SimResult = z.infer<typeof SimResultSchema>;

/* ── Agent votes ───────────────────────────────────────────────────────────── */

export const VoteSchema = z.enum(["execute", "escalate", "reject"]);
export type Vote = z.infer<typeof VoteSchema>;

export const AgentVoteSchema = z.object({
  agent: z.string().catch("unknown"),
  vote: VoteSchema.catch("escalate"),
  // Models occasionally return confidence >1 or as a string; coerce + clamp to [0,1].
  confidence: z.coerce
    .number()
    .catch(0.5)
    .transform((c) => Math.max(0, Math.min(1, c))),
  reasoning: z.string().catch(""),
  // Models sometimes return evidence as objects; stringify them for the audit log.
  evidence: z
    .array(z.any())
    .catch([])
    .transform((arr) => arr.map((x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)))),
  flags: z
    .array(z.any())
    .catch([])
    .transform((arr) => arr.map((x: unknown) => String(x))),
});
export type AgentVote = z.infer<typeof AgentVoteSchema>;

/* ── Council decision ──────────────────────────────────────────────────────── */

export const OutcomeSchema = VoteSchema; // execute | escalate | reject
export type Outcome = z.infer<typeof OutcomeSchema>;

export const GuardrailResultSchema = z.object({
  outcome: OutcomeSchema,
  heldBack: z.boolean(), // true if ratchet overrode a unanimous execute
  reason: z.string(),
  rules: z.array(z.string()).default([]),
});
export type GuardrailResult = z.infer<typeof GuardrailResultSchema>;

export const DecisionSchema = z.object({
  outcome: OutcomeSchema,
  unanimous: z.boolean(),
  votes: z.array(AgentVoteSchema),
  guardrail: GuardrailResultSchema,
  tokens: z.number().default(0),
  latencyMs: z.number().default(0),
  malicious: z.boolean().nullable().default(null), // ground truth (benchmark only)
});
export type Decision = z.infer<typeof DecisionSchema>;

/* ── SSE event (live deliberation) ─────────────────────────────────────────── */

export const CouncilEventSchema = z.object({
  step: z.string(), // "intake" | "riskAnalyst" | "exploitSkeptic" | ...
  agent: z.string().optional(),
  status: z.enum(["start", "evidence", "vote", "done", "guardrail", "error"]),
  data: z.record(z.string(), z.unknown()).optional(),
  message: z.string().optional(),
});
export type CouncilEvent = z.infer<typeof CouncilEventSchema>;
