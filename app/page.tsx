"use client";

/**
 * app/page.tsx — the Council Chamber.
 *
 * Submit a Solana action (intent / signature / serializedTx) and watch the
 * multi-agent council deliberate LIVE via the /api/stream SSE endpoint — agent
 * votes stream in as they happen, then the deterministic guardrail decides.
 * The "held-back despite consensus" moment is highlighted when the guardrail
 * overrides a unanimous execute.
 *
 * SSE is consumed with a fetch() POST + ReadableStream reader (EventSource
 * cannot POST). This is the Presentation-criterion live demo surface.
 */
import { useCallback, useRef, useState } from "react";
import type {
  ActionInput,
  AgentVote,
  CouncilEvent,
  Decision,
  Outcome,
} from "@/lib/types";

type InputKind = "intent" | "signature" | "serializedTx";
type Status = "idle" | "running" | "done" | "error";

const PRESETS: Record<InputKind, string> = {
  intent:
    "setAuthority on SPL mint XYZ to a freshly-funded unknown wallet, then transfer all holder tokens to it",
  signature: "",
  serializedTx: "",
};

const OUTCOME_STYLE: Record<Outcome, { bg: string; text: string; label: string; emoji: string }> = {
  execute: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "APPROVE", emoji: "✓" },
  escalate: { bg: "bg-amber-500/15", text: "text-amber-400", label: "ESCALATE", emoji: "⚠" },
  reject: { bg: "bg-rose-500/15", text: "text-rose-400", label: "REJECT", emoji: "✕" },
};

function VoteCard({ v }: { v: AgentVote }) {
  const o = OUTCOME_STYLE[v.vote];
  return (
    <div className={`rounded-lg border border-white/10 ${o.bg} p-3`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold">{v.agent}</span>
        <span className={`font-mono text-xs font-bold ${o.text}`}>
          {o.emoji} {o.label} · conf {v.confidence.toFixed(2)}
        </span>
      </div>
      {v.reasoning && <p className="mt-2 text-xs text-zinc-400 line-clamp-3">{v.reasoning}</p>}
      {v.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {v.flags.map((f) => (
            <span
              key={f}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                f === "blocking_flag" ? "bg-rose-500/25 text-rose-300" : "bg-white/10 text-zinc-300"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ e }: { e: CouncilEvent }) {
  const statusColor =
    e.status === "error"
      ? "text-rose-400"
      : e.status === "vote"
        ? "text-sky-400"
        : e.status === "guardrail"
          ? "text-amber-400"
          : e.status === "done"
            ? "text-emerald-400"
            : "text-zinc-400";
  return (
    <div className="flex gap-2 py-1 font-mono text-xs">
      <span className="text-zinc-600">▸</span>
      <span className="w-32 shrink-0 text-zinc-300">{e.step}</span>
      <span className={`w-20 shrink-0 ${statusColor}`}>{e.status}</span>
      {e.agent && <span className="w-28 shrink-0 text-zinc-500">{e.agent}</span>}
      <span className="text-zinc-400">
        {e.message}
        {e.status === "vote" && e.data ? (
          <span className="ml-1 text-sky-300">
            → {(e.data as AgentVote).vote} ({((e.data as AgentVote).confidence ?? 0).toFixed(2)})
          </span>
        ) : null}
      </span>
    </div>
  );
}

export default function Home() {
  const [kind, setKind] = useState<InputKind>("intent");
  const [value, setValue] = useState(PRESETS.intent);
  const [events, setEvents] = useState<CouncilEvent[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback(async () => {
    if (!value.trim()) return;
    setEvents([]);
    setDecision(null);
    setError(null);
    setStatus("running");
    const action: ActionInput = { network: "mainnet" };
    if (kind === "intent") action.intent = value;
    else if (kind === "signature") action.signature = value;
    else action.serializedTx = value;

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream failed: HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = raw.startsWith("data: ") ? raw.slice(6) : raw;
          if (!line) continue;
          try {
            const evt = JSON.parse(line) as { step: string; status?: string; data?: unknown; message?: string };
            if (evt.step === "decision" && evt.data) {
              setDecision(evt.data as Decision);
              setStatus("done");
            } else {
              setEvents((prev) => [...prev, evt as CouncilEvent]);
            }
          } catch {
            /* skip malformed chunk */
          }
        }
      }
      setStatus((s) => (s === "running" ? "done" : s));
    } catch (e) {
      if (!ac.signal.aborted) {
        setError(String(e).slice(0, 200));
        setStatus("error");
      }
    }
  }, [kind, value]);

  const cancel = () => {
    abortRef.current?.abort();
    setStatus("idle");
  };

  const voteEvents = events.filter((e) => e.status === "vote" && e.data) as (CouncilEvent & {
    data: AgentVote;
  })[];
  const o = decision ? OUTCOME_STYLE[decision.outcome] : null;

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">On-Chain Risk Council</h1>
            <p className="text-xs text-zinc-500">
              Multi-agent society + deterministic guardrail · Solana · Qwen Cloud
            </p>
          </div>
          <nav className="flex gap-4 text-sm">
            <a href="/" className="text-zinc-300 underline-offset-4 hover:underline">
              Chamber
            </a>
            <a href="/benchmark" className="text-zinc-400 underline-offset-4 hover:underline">
              Benchmark
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Action input */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Action to review
          </label>
          <div className="mt-2 flex gap-1 rounded-lg bg-white/5 p-1">
            {(["intent", "signature", "serializedTx"] as InputKind[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setValue(PRESETS[k]);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  kind === k ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {k === "serializedTx" ? "serialized tx" : k}
              </button>
            ))}
          </div>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={kind === "intent" ? 3 : 1}
            placeholder={
              kind === "signature"
                ? "Solana transaction signature…"
                : kind === "serializedTx"
                  ? "base64 serialized transaction…"
                  : "Describe the action in natural language…"
            }
            className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-zinc-900 p-3 font-mono text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={submit}
              disabled={status === "running"}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-white disabled:opacity-40"
            >
              {status === "running" ? "Council in session…" : "Convene Council"}
            </button>
            {status === "running" && (
              <button onClick={cancel} className="text-sm text-zinc-400 hover:text-zinc-200">
                cancel
              </button>
            )}
            {error && <span className="font-mono text-xs text-rose-400">{error}</span>}
          </div>
        </section>

        {/* Held-back banner */}
        {decision?.guardrail.heldBack && (
          <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="font-semibold text-amber-300">
              ⚠ Held back despite consensus — the guardrail overrode a unanimous council approve.
            </p>
            <p className="mt-1 text-sm text-amber-200/80">{decision.guardrail.reason}</p>
            <p className="mt-1 font-mono text-xs text-amber-200/60">
              rules: {decision.guardrail.rules.join(", ")}
            </p>
          </div>
        )}

        {/* Decision */}
        {decision && o && (
          <section
            className={`mt-6 rounded-xl border border-white/10 ${o.bg} p-5`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
                Final Decision
              </h2>
              <span className={`font-mono text-2xl font-bold ${o.text}`}>
                {o.emoji} {o.label}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{decision.guardrail.reason}</p>
            <div className="mt-3 grid grid-cols-3 gap-4 font-mono text-xs">
              <div>
                <div className="text-zinc-500">unanimous</div>
                <div className="text-zinc-200">{String(decision.unanimous)}</div>
              </div>
              <div>
                <div className="text-zinc-500">tokens</div>
                <div className="text-zinc-200">{decision.tokens}</div>
              </div>
              <div>
                <div className="text-zinc-500">latency</div>
                <div className="text-zinc-200">{decision.latencyMs}ms</div>
              </div>
            </div>
          </section>
        )}

        {/* Agent votes */}
        {voteEvents.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
              Council Votes
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {voteEvents.map((e, i) => (
                <VoteCard key={i} v={e.data} />
              ))}
            </div>
          </section>
        )}

        {/* Deliberation stream */}
        {events.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-zinc-500">
              Deliberation Stream
            </h2>
            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              {events.map((e, i) => (
                <EventRow key={i} e={e} />
              ))}
            </div>
          </section>
        )}

        {status === "idle" && events.length === 0 && (
          <p className="mt-10 text-center text-sm text-zinc-600">
            Submit an action to convene the council. Try the default drainer intent → expect a reject.
          </p>
        )}
      </main>
    </div>
  );
}
