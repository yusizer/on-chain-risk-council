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
import { deriveStakes, extractDeterministicHints } from "@/lib/actionExtract";
import {
  ActionKindSchema,
  type ActionInput,
  type CouncilEvent,
  type TrustedActionRecord,
} from "@/lib/types";

const IntakeResultSchema = z.object({
  kind: ActionKindSchema.catch("unknown"),
  counterparties: z.array(z.any()).catch([]).transform((arr) => arr.map(String)),
  mints: z.array(z.any()).catch([]).transform((arr) => arr.map(String)),
  authorityChanges: z.boolean().catch(true),
  reversible: z.boolean().catch(false),
  amountUsd: z.union([z.number(), z.string(), z.null()]).catch(null).transform((v) => {
    if (v == null) return null;
    const n = Number(String(v).replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }),
  description: z.string().catch("Unspecified Solana action"),
});

type Emit = (e: CouncilEvent) => void;

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export async function intake(input: ActionInput, emit?: Emit, budget?: TokenBudget, signal?: AbortSignal): Promise<TrustedActionRecord> {
  // 1. Gather evidence — prefer on-chain parse via Helius MCP.
  let evidence = "";
  let raw: Record<string, unknown> = {};
  if (input.signature) {
    try {
      const parsed = await parseTransactions([input.signature], signal);
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

  const deterministic = extractDeterministicHints(input, evidence);
  if (deterministic.evidence.length) {
    evidence += `\n\nDeterministic extraction:\n${deterministic.evidence.join("\n")}`;
    emit?.({
      step: "intake",
      status: "evidence",
      message: "Deterministic action extraction complete",
      data: {
        kind: deterministic.kind,
        authorityChanges: deterministic.authorityChanges,
        amountUsd: deterministic.amountUsd,
        counterparties: deterministic.counterparties?.length ?? 0,
      },
    });
  }

  // 2. Classify with the fast model (qwen-turbo), structured output.
  const system =
    "You are the Intake router of an on-chain risk council. Given a Solana action description (a parsed on-chain transaction or a natural-language intent), extract a structured record. " +
    "Be CONSERVATIVE about reversibility: if unsure, mark reversible=false. " +
    "authorityChanges = true ONLY for an EXPLICIT authority/privilege delegation or change — setAuthority, approve(delegate), close-authority, mint-authority transfer, or owner change. A plain SOL/SPL transfer, DEX swap, stake delegation, or mint-to-self does NOT change authority (mark false). If you are genuinely unsure whether authority changes, mark true. " +
    "counterparties = external accounts the action sends funds or authority to. amountUsd = numeric USD value or null if unknown.";
  const user =
    `Action evidence:\n${evidence}\n\n` +
    `Return JSON with: kind (one of transfer|swap|authority_delegation|config|mint|burn|stake|close_account|unknown), counterparties[], mints[], authorityChanges (bool), reversible (bool), amountUsd (number|null), description (one-sentence summary).`;

  let r = {
    kind: deterministic.kind ?? "unknown",
    counterparties: [] as string[],
    mints: [] as string[],
    authorityChanges: deterministic.authorityChanges ?? true,
    reversible: deterministic.reversible ?? false,
    amountUsd: deterministic.amountUsd ?? null,
    description: deterministic.description ?? (evidence.slice(0, 500) || "Unparsed Solana action"),
  };

  try {
    const { value, usage } = await chatJSON("fast", [
      { role: "system", content: system },
      { role: "user", content: user },
    ], IntakeResultSchema);
    r = value;
    addUsage(budget, "fast", usage);
  } catch (e) {
    emit?.({
      step: "intake",
      status: "error",
      message: `Qwen intake unavailable; using deterministic conservative record: ${String(e).slice(0, 160)}`,
    });
  }

  const kind = deterministic.kind ?? r.kind;
  const amountUsd = deterministic.amountUsd ?? r.amountUsd;
  const authorityChanges = deterministic.authorityChanges || r.authorityChanges;
  // Guardrail-critical: never trust the LLM's reversibility. Only the
  // deterministic extractor (which ignores user claims and keys off the
  // recognised action kind / serialized instructions) may assert reversible.
  const reversible = deterministic.reversible ?? false;
  const counterparties = uniq([...(deterministic.counterparties ?? []), ...r.counterparties]);
  const mints = uniq([...(deterministic.mints ?? []), ...r.mints]);
  const stakes = deriveStakes(kind, amountUsd);
  const description = deterministic.description ?? r.description;

  emit?.({
    step: "intake",
    status: "done",
    data: { kind, stakes, amountUsd, reversible, authorityChanges, deterministic: deterministic.evidence.length > 0 },
  });

  return {
    kind,
    amountUsd,
    counterparties,
    mints,
    authorityChanges,
    reversible,
    stakes,
    description,
    raw: { ...raw, ...deterministic.raw },
  };
}
