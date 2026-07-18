/**
 * scripts/demo_recording.ts - one-command recording driver for the Devpost demo.
 *
 * Run while recording the screen:
 *   npm run demo:record
 *
 * Safe test run without Qwen/Helius calls:
 *   DEMO_DRY_RUN=1 npm run demo:record
 *
 * Useful envs:
 *   DEMO_BASE_URL=http://43.106.15.232:3000  # default live ECS URL
 *   DEMO_LOCAL=1                             # use http://localhost:3000
 *   DEMO_AUTO_OPEN=0                         # do not open browser tabs
 *   DEMO_SKIP_HELD_BACK=1                    # skip second council run
 *   DEMO_FAST=1                              # shorter cue pauses
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

type Json = Record<string, unknown>;

const dryRun = process.env.DEMO_DRY_RUN === "1";
const fast = process.env.DEMO_FAST === "1" || dryRun;
const browserAuto = process.env.DEMO_BROWSER_AUTO !== "0";
const baseUrl = (process.env.DEMO_LOCAL === "1"
  ? "http://localhost:3000"
  : process.env.DEMO_BASE_URL || "http://43.106.15.232:3000"
).replace(/\/$/, "");
const healthUrl = process.env.DEMO_HEALTH_URL || `${baseUrl}/api/health?deep=1&schema=1`;

const drainerIntent =
  "setAuthority on SPL mint XYZ to a freshly-funded unknown wallet, then transfer all holder tokens to it";

const heldBackIntent =
  "transfer 2 SOL to a known Binance deposit address with long prior transaction history";

function line(char = "-", n = 88): void {
  console.log(char.repeat(n));
}

function title(text: string): void {
  console.log("\n");
  line("=");
  console.log(text.toUpperCase());
  line("=");
}

async function cue(titleText: string, narration: string[], seconds = 4): Promise<void> {
  title(titleText);
  for (const item of narration) console.log(`VOICEOVER: ${item}`);
  await sleep(fast ? 450 : seconds * 1000);
}

async function countdown(seconds: number): Promise<void> {
  const total = fast ? Math.min(seconds, 2) : seconds;
  for (let i = total; i > 0; i -= 1) {
    console.log(`Starting in ${i}...`);
    await sleep(1000);
  }
}

function openUrl(url: string): void {
  if (process.env.DEMO_AUTO_OPEN === "0" || dryRun) {
    console.log(`BROWSER: open ${url}`);
    return;
  }

  const candidates = process.env.WSL_DISTRO_NAME
    ? [
        { command: "cmd.exe", args: ["/c", "start", "", url] },
        { command: "xdg-open", args: [url] },
      ]
    : process.platform === "darwin"
      ? [{ command: "open", args: [url] }]
      : process.platform === "win32"
        ? [{ command: "cmd", args: ["/c", "start", "", url] }]
        : [{ command: "xdg-open", args: [url] }];

  for (const candidate of candidates) {
    try {
      const child = spawn(candidate.command, candidate.args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      console.log(`BROWSER: opened ${url}`);
      return;
    } catch {
      // Try next opener.
    }
  }
  console.log(`BROWSER: could not auto-open; manually open ${url}`);
}

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (process.env.COUNCIL_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.COUNCIL_API_TOKEN}`;
  }
  return headers;
}

async function fetchJson(url: string): Promise<Json> {
  const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return (await res.json()) as Json;
}

async function showHealth(): Promise<void> {
  title("Live deployment health");
  console.log(`CHECK: ${healthUrl}`);
  if (dryRun) {
    console.log("DRY RUN: health ok: qwen=true helius=true db=true");
    return;
  }
  const health = await fetchJson(healthUrl);
  console.log(JSON.stringify(health, null, 2));
}

function outcomeLabel(outcome: unknown): string {
  if (outcome === "reject") return "REJECT";
  if (outcome === "escalate") return "ESCALATE";
  if (outcome === "execute") return "APPROVE";
  return String(outcome ?? "UNKNOWN").toUpperCase();
}

async function streamCouncil(label: string, intent: string): Promise<void> {
  title(`Live council review - ${label}`);
  console.log(`ACTION: ${intent}`);
  console.log("STREAM: intake -> specialists -> cross-debate -> referee -> guardrail");
  line();

  if (dryRun) {
    const heldBackDemo = label.includes("clean transfer");
    const synthetic = heldBackDemo
      ? [
          "intake       done       kind=transfer stakes=medium reversible=false",
          "riskAnalyst  vote       execute confidence=0.78",
          "exploitSkep  vote       execute confidence=0.72",
          "compliance   vote       execute confidence=0.80",
          "referee      vote       execute confidence=0.76",
          "guardrail    guardrail  outcome=escalate heldBack=true rules=irreversible_action_held_back",
        ]
      : [
          "intake       done       kind=authority_delegation stakes=high reversible=false",
          "riskAnalyst  vote       reject confidence=0.95",
          "exploitSkep  vote       reject confidence=0.85",
          "compliance   vote       reject confidence=0.95",
          "referee      vote       reject confidence=0.95",
          "guardrail    guardrail  outcome=reject rules=authority_change_held_back",
        ];
    for (const row of synthetic) {
      console.log(row);
      await sleep(250);
    }
    console.log(
      heldBackDemo
        ? "FINAL: ESCALATE | unanimous=true | heldBack=true | tokens=demo | latency=demo"
        : "FINAL: REJECT | unanimous=true | heldBack=false | tokens=demo | latency=demo",
    );
    return;
  }

  const res = await fetch(`${baseUrl}/api/stream`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ intent, network: "mainnet" }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!res.ok || !res.body) throw new Error(`stream failed: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalDecision: Json | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lineText = raw.startsWith("data: ") ? raw.slice(6) : raw;
      if (!lineText.trim()) continue;
      const event = JSON.parse(lineText) as Json;

      if (event.step === "decision" && typeof event.data === "object" && event.data) {
        finalDecision = event.data as Json;
        continue;
      }

      const step = String(event.step ?? "council").padEnd(12);
      const status = String(event.status ?? "event").padEnd(10);
      const agent = event.agent ? ` ${String(event.agent).padEnd(14)}` : "";
      let suffix = event.message ? ` ${String(event.message).slice(0, 90)}` : "";
      const data = event.data as Json | undefined;
      if (event.status === "vote" && data?.vote) {
        suffix += ` -> ${outcomeLabel(data.vote)} confidence=${data.confidence ?? "?"}`;
      }
      if (event.status === "guardrail" && data?.outcome) {
        suffix += ` -> ${outcomeLabel(data.outcome)} heldBack=${data.heldBack}`;
      }
      console.log(`${step} ${status}${agent}${suffix}`);
    }
  }

  if (!finalDecision) throw new Error("stream ended without final decision");
  const guardrail = finalDecision.guardrail as Json | undefined;
  line();
  console.log(
    `FINAL: ${outcomeLabel(finalDecision.outcome)} | unanimous=${finalDecision.unanimous} | heldBack=${guardrail?.heldBack} | tokens=${finalDecision.tokens} | latency=${finalDecision.latencyMs}ms`,
  );
  console.log(`GUARDRAIL: ${guardrail?.reason ?? "n/a"}`);
  console.log(`RULES: ${Array.isArray(guardrail?.rules) ? guardrail.rules.join(", ") : "n/a"}`);
}

function loadLatestBenchmark(): { file: string; data: Json } | null {
  const dir = path.join(process.cwd(), "benchmark", "results");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((file) => /^bench-.*\.json$/.test(file))
    .sort();
  const file = files.at(-1);
  if (!file) return null;
  return { file, data: JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Json };
}

function pct(value: unknown): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a";
}

function showBenchmark(): void {
  title("Benchmark dashboard");
  openUrl(`${baseUrl}/benchmark`);
  const latest = loadLatestBenchmark();
  if (!latest) {
    console.log("No local benchmark artifact found. Show the browser dashboard instead.");
    return;
  }
  const results = latest.data.results as Json | undefined;
  const lone = results?.["lone-agent"] as Json | undefined;
  const council = results?.["council-no-memory"] as Json | undefined;
  const loneMetrics = lone?.metrics as Json | undefined;
  const councilMetrics = council?.metrics as Json | undefined;
  console.log(`ARTIFACT: benchmark/results/${latest.file}`);
  console.log(`DATASET: ${latest.data.datasetSize} labelled Solana actions`);
  console.log(
    `LONE AGENT: maliciousRecall=${pct(loneMetrics?.maliciousRecall)} falseApprove=${pct(loneMetrics?.falseApproveRate)} cleanApprove=${pct(loneMetrics?.cleanApproveRate)}`,
  );
  console.log(
    `COUNCIL:    maliciousRecall=${pct(councilMetrics?.maliciousRecall)} falseApprove=${pct(councilMetrics?.falseApproveRate)} cleanApprove=${pct(councilMetrics?.cleanApproveRate)}`,
  );
  console.log("TAKEAWAY: deterministic guardrail over a Qwen agent society cuts catastrophic false-approve to zero.");
}

function showProof(): void {
  title("Alibaba Cloud proof");
  const file = path.join(process.cwd(), "alibaba", "proof.json");
  if (!existsSync(file)) {
    console.log("No alibaba/proof.json found. Show the ECS terminal proof recording instead.");
    return;
  }
  const proof = JSON.parse(readFileSync(file, "utf8")) as Json;
  const ecs = proof.ecs as Json | undefined;
  const db = proof.db as Json | undefined;
  const qwen = proof.qwen as Json | undefined;
  const helius = proof.helius as Json | undefined;
  const council = proof.council as Json | undefined;
  console.log(`TIMESTAMP: ${proof.timestamp}`);
  console.log(`ECS: onEcs=${ecs?.onEcs} instance=${ecs?.instanceId} region=${ecs?.region}`);
  console.log(`QWEN: ok=${qwen?.ok}`);
  console.log(`HELIUS: ok=${helius?.ok} tools=${helius?.toolCount}`);
  console.log(`DB: ok=${db?.ok} pgvector=${(db?.pgvector as Json | undefined)?.installed}`);
  console.log(`COUNCIL HEALTH: ok=${council?.ok}`);
}

function showMcp(): void {
  title("Double MCP product story");
  console.log("CONSUMES: Helius MCP tools for on-chain evidence and simulation.");
  console.log("EXPOSES: the council as MCP tools for external AI clients.");
  console.log("TOOLS: submitAction, getDecision, getBenchmark");
  console.log("FILE: mcp-server/server.ts");
}

async function main(): Promise<void> {
  title("On-Chain Risk Council demo bot");
  console.log("Yusif: start screen recording now. Keep this terminal visible.");
  console.log(`BASE URL: ${baseUrl}`);
  console.log(
    `MODE: ${dryRun ? "dry-run, no external calls" : browserAuto ? "browser auto-demo, live app drives the council" : "terminal stream, live Qwen/Helius calls"}`,
  );
  await countdown(5);

  openUrl(browserAuto ? `${baseUrl}/?demo=1` : baseUrl);
  await cue("Title card", [
    "On-Chain Risk Council reviews Solana actions before users sign.",
    "Qwen agents deliberate, but deterministic guardrail makes the final safety call.",
  ]);

  await showHealth();

  await cue("Architecture", [
    "The flow is intake, specialists, simulator, cross-debate, referee, then guardrail.",
    "The guardrail reads structured action fields, not free-text model persuasion.",
    "The system consumes Helius MCP and exposes the council back over MCP.",
  ]);

  if (browserAuto) {
    await cue("Browser autopilot", [
      "The browser is now clicking for us: first drainer reject, then clean-transfer escalation, then benchmark.",
      "Keep the browser visible for the recording; this terminal is only the narration checklist.",
    ], 8);
    await sleep(fast ? 3_000 : 130_000);
  } else {
    await streamCouncil("drainer intent should be rejected", drainerIntent);

    if (process.env.DEMO_SKIP_HELD_BACK !== "1") {
      await cue("Held-back moment", [
        "Now the council reviews a cleaner transfer-style action.",
        "If the agents approve, the one-way guardrail can still escalate irreversible value movement.",
        "The message: consensus is evidence, not authorization.",
      ]);
      await streamCouncil("clean transfer should be held back or escalated", heldBackIntent);
    }
  }

  showBenchmark();
  await cue("Benchmark takeaway", [
    "The thesis metric is false-approve: the council has zero catastrophic approvals on the checked-in benchmark.",
    "The trade-off is over-escalation, which is acceptable for high-stakes pre-signing review.",
  ]);

  showProof();
  showMcp();

  await cue("Close", [
    "Track 3: Agent Society. Built with Qwen Cloud, Helius MCP, Alibaba ECS, pgvector, Next.js, and TypeScript.",
    "Consensus is necessary, never sufficient.",
  ]);

  title("Demo bot finished");
  console.log("Stop recording. Upload the video to YouTube, then paste the URL into SUBMISSION.md and Devpost.");
}

main().catch((error) => {
  console.error("DEMO BOT FAIL:", error);
  process.exitCode = 1;
});
