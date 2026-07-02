/**
 * agents/simulator.ts — Simulator (Helius simulateTransaction, fork-sim).
 *
 * Fork-simulates a PROPOSED serialized transaction (no on-chain submit) to get
 * logs, compute units, fee, and instruction success/failure — ground truth the
 * referee can weigh against the LLM votes. This is the simulation-in-the-loop
 * differentiator: we don't just ask the council "is this safe?", we run it in a
 * fork and read the result. (Innovation criterion.)
 *
 * For review-only inputs (an on-chain signature, or a natural-language intent)
 * there is no transaction to simulate, so the agent degrades gracefully and
 * emits a skip note — the council still runs, just without sim evidence.
 */
import { simulateTransaction } from "@/lib/helius-mcp";
import { SimResultSchema, type CouncilEvent, type SimResult } from "@/lib/types";

type Emit = (e: CouncilEvent) => void;

function pickString(obj: unknown, ...keys: string[]): string | undefined {
  if (obj && typeof obj === "object") {
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k];
      if (typeof v === "string") return v;
    }
  }
  return undefined;
}

function pickNumber(obj: unknown, ...keys: string[]): number | null {
  if (obj && typeof obj === "object") {
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k];
      if (typeof v === "number") return v;
    }
  }
  return null;
}

export async function simulator(
  serializedTx: string | undefined,
  emit?: Emit,
): Promise<SimResult> {
  if (!serializedTx) {
    const res: SimResult = {
      ran: false,
      reason: "no serialized tx (review-only input)",
      failed: false,
      computeUnits: null,
      logs: [],
      feeLamports: null,
      summary: "skipped — no serialized tx to simulate",
      raw: {},
    };
    emit?.({ step: "simulator", agent: "simulator", status: "done", data: res, message: res.reason });
    return res;
  }

  emit?.({ step: "simulator", agent: "simulator", status: "start", message: "Fork-simulating transaction via Helius MCP" });

  try {
    const out = await simulateTransaction(serializedTx);
    // Helius nests the sim under result/simulation/value; be tolerant of shape.
    const inner =
      (out as Record<string, unknown>)?.result ??
      (out as Record<string, unknown>)?.simulation ??
      (out as Record<string, unknown>)?.value ??
      out;

    const err = pickString(inner, "err", "error", "Err");
    const failed = err != null && err !== "null" && err !== "";
    const logs: string[] = Array.isArray((inner as Record<string, unknown>)?.logs)
      ? ((inner as Record<string, unknown>).logs as unknown[]).map(String)
      : [];
    const computeUnits = pickNumber(inner, "unitsConsumed", "computeUnits", "units_consumed", "cu");
    const feeLamports = pickNumber(inner, "fee", "feeLamports", "fee_lamports");
    const summary = failed
      ? `simulation FAILED: ${err}`
      : `simulation ok — ${computeUnits ?? "?"} CU, fee ${feeLamports ?? "?"} lamports, ${logs.length} log lines`;

    const res: SimResult = SimResultSchema.parse({
      ran: true,
      failed,
      computeUnits,
      logs: logs.slice(0, 50),
      feeLamports,
      summary,
      raw: { err, outer: out },
    });
    emit?.({ step: "simulator", agent: "simulator", status: "done", data: res, message: summary });
    return res;
  } catch (e) {
    const res: SimResult = {
      ran: false,
      reason: `sim error: ${String(e).slice(0, 160)}`,
      failed: true,
      computeUnits: null,
      logs: [],
      feeLamports: null,
      summary: "simulation error",
      raw: { error: String(e).slice(0, 300) },
    };
    emit?.({ step: "simulator", agent: "simulator", status: "error", data: res, message: res.reason });
    return res;
  }
}
