/**
 * app/benchmark/page.tsx — benchmark dashboard (server component).
 *
 * Reads the latest benchmark/results/*.json (written by `npm run bench`) and
 * renders the metrics comparison table + per-action outcome table. The core
 * thesis row: council falseApproveRate < lone-agent falseApproveRate.
 *
 * force-dynamic so a fresh bench run shows up on reload (no static caching).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
interface BaselineResult {
  description: string;
  metrics: Metrics;
  actions: ActionResult[];
}
interface BenchData {
  timestamp: string;
  withMemory: boolean;
  datasetSize: number;
  results: Record<string, BaselineResult>;
}

function loadLatest(): BenchData | null {
  const dir = join(process.cwd(), "benchmark", "results");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("bench-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  try {
    return JSON.parse(readFileSync(join(dir, files[files.length - 1]), "utf8")) as BenchData;
  } catch {
    return null;
  }
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const OUTCOME_CELL: Record<string, string> = {
  execute: "bg-emerald-500/15 text-emerald-400",
  escalate: "bg-amber-500/15 text-amber-400",
  reject: "bg-rose-500/15 text-rose-400",
};

const METRIC_COLS: { key: keyof Metrics; label: string; better: "up" | "down"; fmt: (m: Metrics) => string }[] = [
  { key: "maliciousRecall", label: "malRecall", better: "up", fmt: (m) => pct(m.maliciousRecall) },
  { key: "falseApproveRate", label: "falseApprove", better: "down", fmt: (m) => pct(m.falseApproveRate) },
  { key: "falseRejectRate", label: "falseReject", better: "down", fmt: (m) => pct(m.falseRejectRate) },
  { key: "overEscalateRate", label: "overEscalate", better: "down", fmt: (m) => pct(m.overEscalateRate) },
  { key: "cleanApproveRate", label: "cleanApprove", better: "up", fmt: (m) => pct(m.cleanApproveRate) },
  { key: "accuracy", label: "accuracy", better: "up", fmt: (m) => pct(m.accuracy) },
  { key: "meanLatencyMs", label: "latency", better: "down", fmt: (m) => `${m.meanLatencyMs}ms` },
  { key: "meanTokens", label: "tokens", better: "down", fmt: (m) => `${m.meanTokens}` },
];

/** Find the best value per metric column (for highlighting). */
function bestPerCol(data: BenchData): Record<string, number> {
  const best: Record<string, number> = {};
  for (const col of METRIC_COLS) {
    const vals = Object.values(data.results).map((r) => r.metrics[col.key] as number);
    if (!vals.length) continue;
    best[col.key] = col.better === "up" ? Math.max(...vals) : Math.min(...vals);
  }
  return best;
}

export default function BenchmarkPage() {
  const data = loadLatest();

  if (!data) {
    return (
      <div className="min-h-full bg-zinc-950 px-6 py-20 text-center text-zinc-100">
        <h1 className="text-xl font-semibold">Benchmark</h1>
        <p className="mt-4 text-sm text-zinc-500">
          No benchmark results yet. Run <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">npm run bench</code> to generate the comparison.
        </p>
        <p className="mt-2 text-xs text-zinc-600">
          (lone-agent vs council-no-memory over the labelled dataset — requires DASHSCOPE_API_KEY + HELIUS_API_KEY)
        </p>
      </div>
    );
  }

  const best = bestPerCol(data);
  const baselineNames = Object.keys(data.results);
  const actions = baselineNames.length ? data.results[baselineNames[0]].actions : [];

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Benchmark Dashboard</h1>
            <p className="text-xs text-zinc-500">
              {new Date(data.timestamp).toLocaleString()} · memory: {data.withMemory ? "ON" : "OFF"} · {data.datasetSize} actions
            </p>
          </div>
          <nav className="flex gap-4 text-sm">
            <a href="/" className="text-zinc-400 underline-offset-4 hover:underline">
              Chamber
            </a>
            <a href="/benchmark" className="text-zinc-300 underline-offset-4 hover:underline">
              Benchmark
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Metrics table */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
            Metrics by baseline
          </h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="p-3 text-left font-medium text-zinc-400">baseline</th>
                  {METRIC_COLS.map((c) => (
                    <th key={c.key} className="p-3 text-right font-mono text-xs text-zinc-400">
                      {c.label}
                      <span className="ml-1 text-zinc-600">{c.better === "up" ? "↑" : "↓"}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {baselineNames.map((name) => {
                  const m = data.results[name].metrics;
                  return (
                    <tr key={name} className="border-t border-white/5">
                      <td className="p-3 font-mono text-xs text-zinc-200">{name}</td>
                      {METRIC_COLS.map((c) => {
                        const val = c.fmt(m);
                        const isBest = m[c.key] === best[c.key];
                        return (
                          <td
                            key={c.key}
                            className={`p-3 text-right font-mono text-xs ${
                              isBest ? "font-bold text-emerald-400" : "text-zinc-300"
                            }`}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            ↑ higher is better · ↓ lower is better · <span className="text-emerald-400">green</span> = best in column.
            The thesis: council <code className="font-mono">falseApprove</code> &lt; lone-agent.
          </p>
        </section>

        {/* Per-action table */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
            Per-action outcomes
          </h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="p-3 text-left font-medium text-zinc-400">action</th>
                  <th className="p-3 text-left font-mono text-xs text-zinc-400">label</th>
                  <th className="p-3 text-left font-mono text-xs text-zinc-400">expected</th>
                  {baselineNames.map((n) => (
                    <th key={n} className="p-3 text-right font-mono text-xs text-zinc-400">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actions.map((a, i) => (
                  <tr key={a.id} className="border-t border-white/5">
                    <td className="p-3 font-mono text-xs text-zinc-200">{a.id}</td>
                    <td className="p-3 font-mono text-xs">
                      <span className={a.label === "malicious" ? "text-rose-400" : "text-emerald-400"}>
                        {a.label}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-zinc-500">{a.expected}</td>
                    {baselineNames.map((n) => {
                      const r = data.results[n].actions[i];
                      return (
                        <td key={n} className="p-3 text-right">
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${OUTCOME_CELL[r?.outcome] ?? "text-zinc-600"}`}>
                            {r?.outcome ?? "?"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
