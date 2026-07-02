/**
 * benchmark/runner.ts — run the baselines over the labelled dataset + metrics.
 *
 * For each baseline × action, run a review and record the outcome against the
 * ground-truth label. Compute, per baseline:
 *   maliciousRecall    — (reject + escalate) on malicious / total malicious  [↑]
 *   falseApproveRate   — execute on malicious / total malicious              [↓] KEY
 *   falseRejectRate    — reject on clean / total clean                       [↓]
 *   overEscalateRate   — escalate on clean / total clean                     [↓]
 *   cleanApproveRate   — execute on clean / total clean                      [↑]
 *   accuracy           — (clean execute + malicious reject) / total
 *   meanLatencyMs, meanTokens
 *
 * The core thesis is one row: council falseApproveRate < lone-agent
 * falseApproveRate on the malicious set.
 *
 * Run:  npm run bench
 *   BENCH_ONLY=lone-agent,council-no-memory   — restrict arms
 *   (uses DATABASE_URL if set → adds council-full)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DATASET } from "@/benchmark/dataset";
import { selectBaselines } from "@/benchmark/baselines";
import { ensureSchema } from "@/lib/db";
import { seedExploits } from "@/lib/exploitSeeds";
import { closeHelius } from "@/lib/helius-mcp";
import type { Decision } from "@/lib/types";

interface ActionResult {
  id: string;
  label: "clean" | "malicious";
  category: string;
  expected: string;
  outcome: string;
  unanimous: boolean;
  heldBack: boolean;
  votes: string;
  tokens: number;
  latencyMs: number;
}

interface Metrics {
  maliciousTotal: number;
  cleanTotal: number;
  maliciousRecall: number;
  falseApproveRate: number;
  falseRejectRate: number;
  overEscalateRate: number;
  cleanApproveRate: number;
  accuracy: number;
  meanLatencyMs: number;
  meanTokens: number;
}

interface BaselineResult {
  description: string;
  metrics: Metrics;
  actions: ActionResult[];
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function computeMetrics(actions: ActionResult[]): Metrics {
  const mal = actions.filter((a) => a.label === "malicious");
  const clean = actions.filter((a) => a.label === "clean");
  const malReject = mal.filter((a) => a.outcome === "reject").length;
  const malEscalate = mal.filter((a) => a.outcome === "escalate").length;
  const malApprove = mal.filter((a) => a.outcome === "execute").length;
  const cleanApprove = clean.filter((a) => a.outcome === "execute").length;
  const cleanReject = clean.filter((a) => a.outcome === "reject").length;
  const cleanEscalate = clean.filter((a) => a.outcome === "escalate").length;
  return {
    maliciousTotal: mal.length,
    cleanTotal: clean.length,
    maliciousRecall: mal.length ? (malReject + malEscalate) / mal.length : 0,
    falseApproveRate: mal.length ? malApprove / mal.length : 0,
    falseRejectRate: clean.length ? cleanReject / clean.length : 0,
    overEscalateRate: clean.length ? cleanEscalate / clean.length : 0,
    cleanApproveRate: clean.length ? cleanApprove / clean.length : 0,
    accuracy: actions.length ? (cleanApprove + malReject) / actions.length : 0,
    meanLatencyMs: mean(actions.map((a) => a.latencyMs)),
    meanTokens: mean(actions.map((a) => a.tokens)),
  };
}

function toResult(a: (typeof DATASET)[number], d: Decision): ActionResult {
  return {
    id: a.id,
    label: a.label,
    category: a.category,
    expected: a.expected,
    outcome: d.outcome,
    unanimous: d.unanimous,
    heldBack: d.guardrail.heldBack,
    votes: d.votes.map((v) => `${v.agent.split("/")[0]}:${v.vote}`).join(" | "),
    tokens: d.tokens,
    latencyMs: d.latencyMs,
  };
}

function printTable(results: Record<string, BaselineResult>): void {
  console.log("\n=== METRICS ===");
  const cols = ["malRecall", "falseAppr", "falseRej", "overEscal", "cleanAppr", "accuracy", "latency", "tokens"];
  console.log("baseline".padEnd(20) + cols.map((c) => c.padStart(10)).join(""));
  for (const [name, r] of Object.entries(results)) {
    const m = r.metrics;
    const row = [
      pct(m.maliciousRecall),
      pct(m.falseApproveRate),
      pct(m.falseRejectRate),
      pct(m.overEscalateRate),
      pct(m.cleanApproveRate),
      pct(m.accuracy),
      `${m.meanLatencyMs}ms`,
      `${m.meanTokens}`,
    ];
    console.log(name.padEnd(20) + row.map((v) => v.padStart(10)).join(""));
  }
  console.log("\n(lower falseAppr/falseRej/overEscal is better; higher malRecall/cleanAppr/accuracy is better)");

  // Per-action comparison across arms.
  console.log("\n=== PER-ACTION ===");
  const names = Object.keys(results);
  for (const a of DATASET) {
    const cells = names.map((n) => results[n].actions.find((x) => x.id === a.id)?.outcome ?? "?");
    console.log(`  ${a.id.padEnd(26)} [${a.label.padEnd(9)}] exp=${a.expected.padEnd(8)} ${names.map((n, i) => `${n.split("-")[0]}:${cells[i]}`).join("  ")}`);
  }
}

function saveJson(results: Record<string, BaselineResult>, withMemory: boolean): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = join(here, "results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(outDir, `bench-${stamp}.json`);
  const payload = {
    timestamp: new Date().toISOString(),
    withMemory,
    datasetSize: DATASET.length,
    results,
  };
  writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

async function main(): Promise<void> {
  const withMemory = !!process.env.DATABASE_URL;
  console.log(`=== ON-CHAIN RISK COUNCIL — BENCHMARK ===`);
  console.log(`memory: ${withMemory ? "ON (council-full included)" : "OFF (council-full skipped — no DATABASE_URL)"}`);

  if (withMemory) {
    console.log("[db] ensuring schema + seeding exploit patterns…");
    try {
      await ensureSchema();
      const s = await seedExploits();
      console.log("[db] seeds:", s);
    } catch (e) {
      console.log("[db] skipped:", String(e).slice(0, 160));
    }
  }

  let baselines = selectBaselines(withMemory);
  const only = process.env.BENCH_ONLY;
  if (only) {
    const want = only.split(",").map((s) => s.trim());
    baselines = baselines.filter((b) => want.includes(b.name));
  }
  console.log(`baselines: ${baselines.map((b) => b.name).join(", ")} × ${DATASET.length} actions\n`);

  const results: Record<string, BaselineResult> = {};
  for (const b of baselines) {
    console.log(`\n--- ${b.name} ---  (${b.description})`);
    const actions: ActionResult[] = [];
    for (const a of DATASET) {
      const t0 = Date.now();
      let decision: Decision;
      try {
        decision = await b.run(a.action);
      } catch (e) {
        console.log(`  ${a.id.padEnd(26)} ERROR ${String(e).slice(0, 160)}`);
        // Treat a crash as a fail-soft escalate (never silently approve).
        decision = {
          outcome: "escalate",
          unanimous: false,
          votes: [],
          guardrail: { outcome: "escalate", heldBack: false, reason: `runner error: ${String(e).slice(0, 120)}`, rules: [] },
          tokens: 0,
          latencyMs: Date.now() - t0,
          malicious: null,
        };
      }
      const r = toResult(a, decision);
      actions.push(r);
      console.log(`  ${a.id.padEnd(26)} [${a.label.padEnd(9)}] exp=${a.expected.padEnd(8)} -> ${r.outcome.padEnd(8)} tokens=${r.tokens} ${r.latencyMs}ms`);
    }
    results[b.name] = { description: b.description, metrics: computeMetrics(actions), actions };
  }

  printTable(results);
  const file = saveJson(results, withMemory);
  console.log(`\nresults written: ${file}`);
}

main()
  .catch((e) => {
    console.error("BENCH FAIL:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeHelius();
  });
