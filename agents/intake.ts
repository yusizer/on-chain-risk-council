/**
 * agents/intake.ts — Intake / Router.
 *
 * Turns an ActionInput (signature | serializedTx | intent) into a
 * TrustedActionRecord: kind, counterparties, mints, authorityChanges,
 * reversibility, stakes, amount. For on-chain signatures it first pulls a
 * human-readable parse via Helius MCP (parseTransactions) so the rest of the
 * council reasons over real data, not a guess.
 *
 * Conservative defaults: unknown reversibility → false; unknown authority
 * change → true. The guardrail then leans on these.
 */
import { z } from "zod";
import { chatJSON, addUsage, type TokenBudget } from "@/lib/qwen";
import { parseTransactions } from "@/lib/helius-mcp";
import {
  ActionKindSchema,
  type ActionInput,
  type CouncilEvent,
  type Stakes,
  type TrustedActionRecord,
} from "@/lib/types";

const IntakeResultSchema = z.object({
  kind: ActionKindSchema,
  counterparties: z.array(z.string()),
  mints: z.array(z.string()),
  authorityChanges: z.boolean(),
  reversible: z.boolean(),
  amountUsd: z.number().nullable(),
  description: z.string(),
});
type IntakeResult = z.infer<typeof IntakeResultSchema>;

/** Deterministic stakes from kind + amount. */
function deriveStakes(kind: string, amountUsd: number | null): Stakes {
  if (["authority_delegation", "close_account", "burn"].includes(kind)) return "high";
  if (amountUsd == null) return "medium";
  if (amountUsd >= 5000) return "high";
  if (amountUsd >= 500) return "medium";
  return "low";
}

type Emit = (e: CouncilEvent) => void;

export async function intake(input: ActionInput, emit?: Emit, budget?: TokenBudget): Promise<TrustedActionRecord> {
  // 1. Gather evidence — prefer on-chain parse via Helius MCP.
  let evidence = "";
  let raw: Record<string, unknown> = {};
  if (input.signature) {
    try {
      const parsed = await parseTransactions([input.signature]);
      evidence = typeof parsed === "string" ? parsed : JSON.stringify(parsed).slice(0, 6000);
      if (parsed && typeof parsed === "object") raw = { helius: parsed };
      emit?.({ step: "intake", status: "evidence", message: "Parsed on-chain tx via Helius MCP", data: { signature: input.signature } });
    } catch (e) {
      evidence = `Failed to parse signature ${input.signature}: ${String(e)}`;
      emit?.({ step: "intake", status: "error", message: evidence });
    }
  } else if (input.intent) {
    evidence = `Natural-language intent: ${input.intent}`;
  } else if (input.serializedTx) {
    evidence = `Serialized tx (base64, truncated): ${input.serializedTx.slice(0, 400)}`;
  }

  // 2. Classify with the fast model (qwen-turbo), structured output.
  const system =
    "You are the Intake router of an on-chain risk council. Given a Solana action description (a parsed on-chain transaction or a natural-language intent), extract a structured record. " +
    "Be CONSERVATIVE: if unsure about reversibility, mark reversible=false; if unsure about authorityChanges, mark true. counterparties = external accounts the action sends funds/authority to. amountUsd = numeric USD value or null if unknown.";
  const user =
    `Action evidence:\n${evidence}\n\n` +
    `Return JSON with: kind (one of transfer|swap|authority_delegation|config|mint|burn|stake|close_account|unknown), counterparties[], mints[], authorityChanges (bool), reversible (bool), amountUsd (number|null), description (one-sentence summary).`;

  const { value: r, usage } = await chatJSON("fast", [
    { role: "system", content: system },
    { role: "user", content: user },
  ], IntakeResultSchema);
  addUsage(budget, "fast", usage);

  const stakes = deriveStakes(r.kind, r.amountUsd);
  emit?.({
    step: "intake",
    status: "done",
    data: { kind: r.kind, stakes, amountUsd: r.amountUsd, reversible: r.reversible, authorityChanges: r.authorityChanges },
  });

  return { ...r, stakes, raw };
}
