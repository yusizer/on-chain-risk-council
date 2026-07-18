/**
 * scripts/demo.ts — Devpost demo video v3 (dynamic, cursor-driven).
 *
 * Improvements over v2:
 *  - Visible animated cursor that travels to and clicks each control.
 *  - Page scrolls so the clicked element + the live council output are always in view.
 *  - The submitted intent is typed live (not just pasted), for a hands-on feel.
 *  - Captions are small centered text with NO background box.
 *  - Key outcomes still get a subtle highlight.
 *
 * Run:  npm run dev   (elsewhere)   then   npm run demo
 * ENV: DEMO_BASE_URL, DEMO_SLOWMO_MS, DEMO_VIEWPORT, DEMO_VIDEO_DIR
 */
import { chromium } from "playwright";
import { existsSync, readFileSync, readdirSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = (process.env.DEMO_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SLOWMO_MS = Number(process.env.DEMO_SLOWMO_MS ?? 40);
const VIEWPORT = parseViewport(process.env.DEMO_VIEWPORT ?? "1920x1080");
const VIDEO_DIR = process.env.DEMO_VIDEO_DIR ?? path.join(process.cwd(), "demo-videos");

function parseViewport(raw: string): { width: number; height: number } {
  const m = raw.match(/^(\d+)x(\d+)$/i);
  if (!m) return { width: 1280, height: 800 };
  return { width: Number(m[1]), height: Number(m[2]) };
}

function log(msg: string): void {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] [demo] ${msg}`);
}

// ---------- On-screen overlays ----------

/** Minimal centered caption: small text, NO background box. */
async function caption(page: import("playwright").Page, text: string, ms = 3800): Promise<void> {
  log(`CAPTION → ${text}`);
  await page.evaluate((text) => {
    let el = document.getElementById("demo-cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-cap";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.cssText = [
      "position:fixed",
      "left:50%",
      "top:70%",
      "transform:translate(-50%,-50%)",
      "z-index:999999",
      "max-width:78%",
      "text-align:center",
      "color:#f8fafc",
      "font-family:Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
      "font-size:23px",
      "font-weight:500",
      "line-height:1.45",
      "letter-spacing:.01em",
      "pointer-events:none",
      "text-shadow:0 2px 14px rgba(0,0,0,.95), 0 0 6px rgba(0,0,0,.85)",
    ].join(";");
  }, text);
  await sleep(ms);
}

/** Small top-right scene counter. */
async function setScene(page: import("playwright").Page, n: number, total: number): Promise<void> {
  await page.evaluate(
    ({ n, total }) => {
      let el = document.getElementById("demo-scene");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-scene";
        document.body.appendChild(el);
      }
      el.style.cssText = [
        "position:fixed",
        "top:18px",
        "right:20px",
        "z-index:999999",
        "color:rgba(226,232,240,.7)",
        "font-family:Inter, ui-sans-serif, system-ui, sans-serif",
        "font-size:13px",
        "letter-spacing:.08em",
        "pointer-events:none",
        "text-shadow:0 1px 6px rgba(0,0,0,.9)",
      ].join(";");
      el.textContent = `${n} / ${total}`;
    },
    { n, total },
  );
}

/** Centered title card (used for intro Problem hook). */
async function titleCard(
  page: import("playwright").Page,
  title: string,
  subtitle: string,
  ms = 4200,
): Promise<void> {
  await page.evaluate(
    ({ title, subtitle }) => {
      document.getElementById("demo-title")?.remove();
      const box = document.createElement("div");
      box.id = "demo-title";
      box.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:999998",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        "text-align:center",
        "background:radial-gradient(ellipse at center, rgba(2,6,23,.5), rgba(2,6,23,.92))",
        "color:white",
        "font-family:Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
        "pointer-events:none",
        "padding:40px",
      ].join(";");
      box.innerHTML =
        `<div style="font-size:16px;letter-spacing:.3em;text-transform:uppercase;color:#7dd3fc;margin-bottom:18px">${subtitle}</div>` +
        `<div style="font-size:52px;font-weight:750;line-height:1.12;max-width:1100px">${title}</div>`;
      document.body.appendChild(box);
    },
    { title, subtitle },
  );
  await sleep(ms);
}

async function clearOverlays(page: import("playwright").Page): Promise<void> {
  await page.evaluate(() => {
    for (const id of ["demo-cap", "demo-scene", "demo-title"]) {
      document.getElementById(id)?.remove();
    }
  });
}

// ---------- Cursor ----------

async function injectCursor(page: import("playwright").Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("demo-cursor")) return;
    const c = document.createElement("div");
    c.id = "demo-cursor";
    c.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "z-index:1000000",
      "width:26px",
      "height:26px",
      "margin-left:-13px",
      "margin-top:-13px",
      "border-radius:50%",
      "background:rgba(56,189,248,.95)",
      "box-shadow:0 0 0 4px rgba(56,189,248,.28), 0 0 14px rgba(56,189,248,.7)",
      "pointer-events:none",
      "transition:left .16s ease, top .16s ease",
    ].join(";");
    document.body.appendChild(c);
  });
}

async function moveCursor(page: import("playwright").Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const c = document.getElementById("demo-cursor");
      if (c) {
        c.style.left = `${x}px`;
        c.style.top = `${y}px`;
      }
    },
    { x, y },
  );
  await sleep(180);
}

/** Move the visible cursor to an element's center, pause, then click it. */
async function clickWithCursor(
  page: import("playwright").Page,
  locator: import("playwright").Locator,
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await sleep(150);
  const box = await locator.boundingBox();
  if (box) await moveCursor(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(450);
  await locator.click();
  await sleep(250);
}

// ---------- Highlight ----------

async function highlight(
  page: import("playwright").Page,
  needle: string,
  color = "56,189,248",
): Promise<boolean> {
  return page.evaluate(
    ({ needle, color }) => {
      const stack = [document.body];
      let target: HTMLElement | null = null;
      while (stack.length > 0) {
        const el = stack.pop() as HTMLElement | null;
        if (!el) continue;
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
        const t = (el.textContent || "").trim();
        if (t && t.indexOf(needle) >= 0 && el.offsetParent !== null) {
          target = el;
          break;
        }
        const kids = Array.from(el.children) as HTMLElement[];
        for (let i = 0; i < kids.length; i += 1) stack.push(kids[i]);
      }
      if (!target) return false;
      target.style.outline = `3px solid rgba(${color},0.95)`;
      target.style.outlineOffset = "2px";
      target.style.boxShadow = `0 0 0 4px rgba(${color},0.22), 0 0 45px rgba(${color},0.45)`;
      target.style.borderRadius = "10px";
      target.dataset.demoHighlight = "1";
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      return true;
    },
    { needle, color },
  );
}

async function clearHighlights(page: import("playwright").Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("[data-demo-highlight]").forEach((e) => {
      e.style.outline = "";
      e.style.outlineOffset = "";
      e.style.boxShadow = "";
      e.style.borderRadius = "";
      delete e.dataset.demoHighlight;
    });
  });
}

// ---------- Demo steps ----------

async function waitFinalDecision(page: import("playwright").Page): Promise<void> {
  await page.getByText("Council in session", { exact: false }).waitFor({ timeout: 30_000 });
  // Keep the live council output in view while it streams.
  for (let i = 0; i < 60; i += 1) {
    await page.evaluate(() => {
      const s = document.querySelector("main");
      if (s) s.scrollIntoView({ block: "end", behavior: "smooth" });
    }).catch(() => undefined);
    try {
      await page.getByText("Final Decision", { exact: false }).waitFor({ timeout: 1500 });
      break;
    } catch {
      /* keep scrolling */
    }
  }
  await page.getByText("Final Decision", { exact: false }).scrollIntoViewIfNeeded().catch(() => undefined);
  await sleep(1000);
}

/**
 * Submit an intent: scroll to the textarea, type the text live, then click Convene.
 */
async function submitIntent(
  page: import("playwright").Page,
  text: string,
): Promise<void> {
  const ta = page.locator("textarea");
  await clickWithCursor(page, ta);
  await ta.fill("");
  await page.keyboard.type(text, { delay: 16 });
  await sleep(400);
  await clickWithCursor(page, page.getByRole("button", { name: "Convene Council", exact: true }));
}

async function runScenario(
  page: import("playwright").Page,
  intentText: string,
  phaseCaptions: { text: string; after: number }[],
  finalCaption: string,
  highlightNeedle?: string,
): Promise<void> {
  log(`SCENARIO submit`);
  await submitIntent(page, intentText);

  const started = Date.now();
  let nextIdx = 0;
  while (nextIdx < phaseCaptions.length) {
    const elapsed = Date.now() - started;
    await sleep(Math.max(0, phaseCaptions[nextIdx].after - elapsed));
    await caption(page, phaseCaptions[nextIdx].text, 4000);
    nextIdx += 1;
  }

  await waitFinalDecision(page);
  if (highlightNeedle) await highlight(page, highlightNeedle, "250,204,21");
  await caption(page, finalCaption, 5000);
  await clearHighlights(page);
}

function latestBench(): { size: number; lone: string; council: string } {
  const dir = path.join(process.cwd(), "benchmark", "results");
  const empty = { size: 0, lone: "n/a", council: "n/a" };
  if (!existsSync(dir)) return empty;
  const latest = readdirSync(dir).filter((f) => /^bench-.*\.json$/.test(f)).sort().at(-1);
  if (!latest) return empty;
  const data = JSON.parse(readFileSync(path.join(dir, latest), "utf8")) as {
    datasetSize?: number;
    results?: Record<string, { metrics?: Record<string, number> }>;
  };
  const lone = data.results?.["lone-agent"]?.metrics?.falseApproveRate;
  const coun = data.results?.["council-no-memory"]?.metrics?.falseApproveRate;
  const fmt = (v: number | undefined) => (v == null ? "n/a" : `${Math.round(v * 100)}%`);
  return { size: data.datasetSize ?? 0, lone: fmt(lone), council: fmt(coun) };
}

// ---------- Main ----------

async function main(): Promise<void> {
  log(`BASE=${BASE_URL}  SLOWMO=${SLOWMO_MS}ms  VIDEO=${VIDEO_DIR}`);
  mkdirSync(VIDEO_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    slowMo: SLOWMO_MS,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: VIEWPORT,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 200)));

  const TOTAL = 6;
  let scene = 0;
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await injectCursor(page);

    // 1. Title
    scene += 1;
    await setScene(page, scene, TOTAL);
    await titleCard(page, "On-Chain Risk Council", "A multi-agent society that reviews Solana actions before they execute", 2500);
    await clearOverlays(page);

    // 2. Problem
    scene += 1;
    await setScene(page, scene, TOTAL);
    await titleCard(page, "One prompt. Nine-figure losses.", "The problem", 2200);
    await clearOverlays(page);
    await caption(
      page,
      "“Is this tx safe?” — a single LLM confidently approves attacks it has never seen, and has no hard safety floor. We need many perspectives and a deterministic guardrail.",
      5000,
    );

    // 3. The Agent Society — roles, then proof
    scene += 1;
    await setScene(page, scene, TOTAL);
    await caption(
      page,
      "Our answer: a society of specialist Qwen agents. Each owns one job, so blind spots get caught by someone else.",
      5000,
    );
    for (const [needle, color] of [
      ["council false-approve", "16,185,129"],
      ["lone-agent false-approve", "244,63,94"],
      ["Wormhole", "56,189,248"],
      ["Double MCP", "245,158,11"],
    ] as const) {
      await clearHighlights(page);
      await highlight(page, needle, color);
      await sleep(1800);
    }
    await clearHighlights(page);
    await caption(
      page,
      "Council false-approve: 0%. A lone strong model: 20% — it green-lit real Wormhole/Cashio signatures. Roles: Risk Analyst, Exploit Skeptic, Compliance, Simulator, Referee.",
      6000,
    );

    // 4. Live: Drainer → REJECT (role assignment + debate)
    scene += 1;
    await setScene(page, scene, TOTAL);
    await caption(page, "Live run #1 — a wallet drainer. Five agents deliberate, then the deterministic guardrail decides.", 4500);
    await runScenario(
      page,
      "setAuthority on SPL mint XYZ to a freshly-funded unknown wallet, then transfer all holder tokens to it",
      [
        { text: "Intake decodes the action and flags hard safety fields before debate.", after: 0 },
        { text: "Risk Analyst, Exploit Skeptic (Helius on-chain proof) and Compliance vote — watch them disagree.", after: 18000 },
        { text: "Referee aggregates; the one-way-ratchet guardrail makes the final, safer call.", after: 38000 },
      ],
      "Drainer rejected. All six synthetic drainers + real Wormhole/Cashio signatures blocked. The lone model approved at least one.",
      "Final Decision",
    );

    // 5. Live: Held-back consensus → ESCALATE (conflict resolution / human-in-loop)
    scene += 1;
    await setScene(page, scene, TOTAL);
    await caption(page, "Live run #2 — a clean-looking transfer. Agents reach consensus: approve. But it is irreversible.", 4500);
    await runScenario(
      page,
      "transfer 2 SOL to a known Binance deposit address with long prior transaction history",
      [
        { text: "Agents review the transfer and agree to approve.", after: 0 },
        { text: "The guardrail overrides consensus — irreversible value movement needs a human.", after: 18000 },
      ],
      "Consensus said approve. The guardrail held it back. This is the human-in-the-loop checkpoint: consensus is evidence, not authorization.",
      "Held back despite consensus",
    );

    // 6. Benchmark — measurable gain over single-agent baseline
    scene += 1;
    await setScene(page, scene, TOTAL);
    await page.getByRole("link", { name: "Benchmark" }).click();
    await page.waitForURL("**/benchmark", { timeout: 20_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await injectCursor(page);
    const b = latestBench();
    await caption(
      page,
      `Measurable gain over the single-agent baseline, on ${b.size} labelled actions. Lone-agent false-approve ${b.lone} → council ${b.council}.`,
      6000,
    );
    await highlight(page, "falseApprove", "244,63,94");
    await sleep(2800);
    await clearHighlights(page);

    // Close
    scene += 1;
    await setScene(page, scene, TOTAL);
    await caption(
      page,
      "Consensus is necessary, never sufficient. Track 3 — Agent Society, built with Qwen Cloud · Helius MCP · Alibaba ECS + pgvector.",
      5000,
    );
    await clearOverlays(page);
    await clearHighlights(page);

    log("Demo finished; finalising video…");
  } finally {
    const video = page.video();
    let videoPath: string | null = null;
    if (video) {
      try {
        videoPath = await video.path();
      } catch {
        /* ignore */
      }
    }
    await context.close();
    await browser.close();

    if (videoPath) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const finalName = path.join(VIDEO_DIR, `demo-${ts}.webm`);
      try {
        renameSync(videoPath, finalName);
        log(`✅ Video saved: ${finalName} (${(statSync(finalName).size / 1024 / 1024).toFixed(1)} MB)`);
      } catch (e) {
        log(`⚠️  Rename failed: ${e}. Original: ${videoPath}`);
      }
    } else {
      log("⚠️  No video recorded.");
    }
  }
}

main().catch((err) => {
  console.error("DEMO FAIL:", err);
  process.exit(1);
});