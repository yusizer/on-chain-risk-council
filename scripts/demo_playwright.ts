/**
 * scripts/demo_playwright.ts - judge-facing browser automation for the demo video.
 *
 * Opens a REAL visible Windows Chrome window (OBS-friendly), then auto-clicks
 * through the Council Chamber: 4 live Qwen/Helius reviews → benchmark → health.
 *
 * Recommended for OBS (from Windows, double-click or run):
 *   run-demo-playwright.bat
 *
 * Or from WSL after `npm run dev` is up:
 *   DEMO_BASE_URL=http://127.0.0.1:3000 npm run demo:playwright
 *
 * Env:
 *   DEMO_BASE_URL=http://localhost:3000   # or http://$WSL_IP:3000 for Windows Chrome
 *   DEMO_HEADLESS=1                       # CI only; default = visible Chrome
 *   DEMO_SLOWMO=700                       # ms between Playwright actions
 *   DEMO_KEEP_OPEN=1                      # keep browser open after finish (default)
 *   DEMO_CDP_PORT=9222                    # fixed CDP port (default random 9300-9800)
 *   DEMO_CDP_HOST=172.x.x.x               # Windows host IP if auto-detect fails
 *   DEMO_VIEWPORT=1280x800                # OBS-friendly window size
 *   DEMO_USE_BUNDLED=1                    # force Playwright Chromium (not Windows Chrome)
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const baseUrl = (process.env.DEMO_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const headless = process.env.DEMO_HEADLESS === "1";
const slowMo = Number(process.env.DEMO_SLOWMO || (headless ? 0 : 650));
const keepOpen = process.env.DEMO_KEEP_OPEN !== "0" && !headless;
const useBundled = process.env.DEMO_USE_BUNDLED === "1" || headless;
const cdpPort = Number(process.env.DEMO_CDP_PORT || 9300 + Math.floor(Math.random() * 500));
const viewport = parseViewport(process.env.DEMO_VIEWPORT || "1280x800");

function parseViewport(raw: string): { width: number; height: number } {
  const m = raw.match(/^(\d+)x(\d+)$/i);
  if (!m) return { width: 1280, height: 800 };
  return { width: Number(m[1]), height: Number(m[2]) };
}

function log(msg: string): void {
  console.log(`[demo] ${msg}`);
}

/** Convert a WSL/Linux path to a Windows path PowerShell can open. */
function toWindowsPath(p: string): string {
  const mnt = p.match(/^\/mnt\/([a-z])\/(.*)$/i);
  if (mnt) return `${mnt[1].toUpperCase()}:\\${mnt[2].replaceAll("/", "\\")}`;

  // e.g. /home/... under WSL — ask wslpath
  try {
    const out = spawnSync("wslpath", ["-w", p], { encoding: "utf8" });
    if (out.status === 0 && out.stdout.trim()) return out.stdout.trim();
  } catch {
    /* ignore */
  }
  return p;
}

/** Windows host IP as seen from WSL2 (for CDP + optional base URL). */
function windowsHostCandidates(): string[] {
  const hosts = new Set<string>();
  if (process.env.DEMO_CDP_HOST) hosts.add(process.env.DEMO_CDP_HOST);
  hosts.add("127.0.0.1");
  hosts.add("localhost");

  try {
    const resolv = readFileSync("/etc/resolv.conf", "utf8");
    for (const line of resolv.split("\n")) {
      const m = line.match(/^\s*nameserver\s+(\S+)/i);
      if (m && !m[1].startsWith("127.")) hosts.add(m[1]);
    }
  } catch {
    /* not WSL / no resolv */
  }

  // mirrored networking / extra interfaces sometimes expose host here
  try {
    const out = spawnSync("ip", ["route", "show", "default"], { encoding: "utf8" });
    const m = out.stdout?.match(/default via (\d+\.\d+\.\d+\.\d+)/);
    if (m) hosts.add(m[1]);
  } catch {
    /* ignore */
  }

  return [...hosts];
}

async function waitForCdp(port: number): Promise<string> {
  const hosts = windowsHostCandidates();
  log(`Waiting for Chrome CDP on port ${port} (hosts: ${hosts.join(", ")})…`);

  for (let i = 0; i < 100; i += 1) {
    for (const host of hosts) {
      try {
        const res = await fetch(`http://${host}:${port}/json/version`, {
          signal: AbortSignal.timeout(800),
        });
        if (res.ok) {
          const url = `http://${host}:${port}`;
          log(`CDP ready at ${url}`);
          return url;
        }
      } catch {
        /* try next */
      }
    }
    await sleep(300);
  }
  throw new Error(
    `Windows Chrome CDP did not start on port ${port}. ` +
      `Check Admin netsh portproxy, firewall, and that Chrome launched. ` +
      `Tried hosts: ${hosts.join(", ")}`,
  );
}

async function openWindowsChrome(): Promise<{ browser: Browser; context: BrowserContext }> {
  const ps1Linux = path.join(process.cwd(), "scripts", "start_chrome_cdp.ps1");
  if (!existsSync(ps1Linux)) {
    throw new Error(`Missing ${ps1Linux}`);
  }
  const ps1 = toWindowsPath(ps1Linux);
  log(`Launching Windows Chrome via ${ps1} (CDP port ${cdpPort})…`);

  const launched = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Port", String(cdpPort)],
    { encoding: "utf8" },
  );
  if (launched.status !== 0) {
    throw new Error(
      `Failed to start Windows Chrome (exit ${launched.status}): ${launched.stderr || launched.stdout}`,
    );
  }
  if (launched.stdout?.trim()) log(`Chrome profile: ${launched.stdout.trim()}`);

  const cdpUrl = await waitForCdp(cdpPort);
  const browser = await chromium.connectOverCDP(cdpUrl, { slowMo });
  const context =
    browser.contexts()[0] ??
    (await browser.newContext({
      colorScheme: "dark",
      viewport,
    }));

  // Prefer dark + fixed size on existing default context pages
  for (const p of context.pages()) {
    try {
      await p.setViewportSize(viewport);
    } catch {
      /* ignore */
    }
  }
  return { browser, context };
}

async function openBundledChromium(): Promise<{ browser: Browser; context: BrowserContext }> {
  log(`Launching Playwright Chromium (headless=${headless}, slowMo=${slowMo})…`);
  const browser = await chromium.launch({
    headless,
    slowMo,
    args: ["--start-maximized"],
  });
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport,
  });
  return { browser, context };
}

async function openBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  if (useBundled) return openBundledChromium();
  try {
    return await openWindowsChrome();
  } catch (err) {
    log(`Windows Chrome CDP failed (${String(err).slice(0, 200)}). Falling back to bundled Chromium.`);
    return openBundledChromium();
  }
}

async function caption(page: Page, title: string, body: string, ms = 3200): Promise<void> {
  log(`CAPTION [${title}] ${body}`);
  await page.evaluate(
    ({ title, body }) => {
      const existing = document.getElementById("demo-caption");
      existing?.remove();
      const box = document.createElement("div");
      box.id = "demo-caption";
      box.style.cssText = [
        "position:fixed",
        "left:28px",
        "bottom:28px",
        "z-index:999999",
        "max-width:680px",
        "padding:18px 20px",
        "border:1px solid rgba(56,189,248,.45)",
        "border-radius:18px",
        "background:rgba(2,6,23,.92)",
        "box-shadow:0 20px 70px rgba(0,0,0,.45)",
        "color:white",
        "font-family:Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        "pointer-events:none",
      ].join(";");
      box.innerHTML = `
        <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#7dd3fc;margin-bottom:7px">${title}</div>
        <div style="font-size:22px;font-weight:750;line-height:1.15">${body}</div>
      `;
      document.body.appendChild(box);
    },
    { title, body },
  );
  await sleep(ms);
}

async function removeCaption(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById("demo-caption")?.remove());
}

async function waitForFinalDecision(page: Page): Promise<void> {
  // Button label while streaming: "Council in session…"
  await page.getByRole("button", { name: /Council in session/i }).waitFor({ timeout: 30_000 });
  log("Council in session — waiting for Final Decision (live Qwen/Helius, up to ~150s)…");
  await page.getByText("Final Decision").waitFor({ timeout: 150_000 });
  await sleep(1800);
}

async function runScenario(page: Page, presetName: string, expectedStory: string): Promise<void> {
  log(`── scenario: ${presetName}`);
  await caption(page, "Live click automation", `Selecting preset: ${presetName}`, 1800);
  await page.getByRole("button", { name: presetName, exact: true }).click();
  await sleep(700);
  await caption(page, "Council convenes", expectedStory, 1800);
  await page.getByRole("button", { name: "Convene Council" }).click();
  await waitForFinalDecision(page);
  await caption(
    page,
    "Decision reached",
    "Votes, guardrail result, token cost, and latency are visible on screen.",
    3500,
  );
}

function latestBenchmarkSummary(): string {
  const dir = path.join(process.cwd(), "benchmark", "results");
  if (!existsSync(dir)) return "Benchmark artifact not found.";
  const latest = readdirSync(dir)
    .filter((file) => /^bench-.*\.json$/.test(file))
    .sort()
    .at(-1);
  if (!latest) return "Benchmark artifact not found.";
  const data = JSON.parse(readFileSync(path.join(dir, latest), "utf8")) as {
    datasetSize?: number;
    results?: Record<string, { metrics?: Record<string, number> }>;
  };
  const loneFalseApprove = data.results?.["lone-agent"]?.metrics?.falseApproveRate;
  const councilFalseApprove = data.results?.["council-no-memory"]?.metrics?.falseApproveRate;
  const lone = loneFalseApprove == null ? "n/a" : `${Math.round(loneFalseApprove * 100)}%`;
  const council = councilFalseApprove == null ? "n/a" : `${Math.round(councilFalseApprove * 100)}%`;
  return `${data.datasetSize ?? "n/a"} labelled actions. Lone-agent false-approve: ${lone}. Council false-approve: ${council}.`;
}

async function main(): Promise<void> {
  log(`baseUrl=${baseUrl} headless=${headless} slowMo=${slowMo} viewport=${viewport.width}x${viewport.height}`);
  log("Start OBS now if you have not — browser will open next.");

  const { browser, context } = await openBrowser();
  const page = context.pages().find((p) => p.url() !== "about:blank") ?? (await context.newPage());
  try {
    await page.setViewportSize(viewport);
  } catch {
    /* CDP default page may already be maximized */
  }

  page.on("console", (m) => console.log(`[page:${m.type()}]`, m.text().slice(0, 300)));
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 400)));
  page.setDefaultTimeout(25_000);

  log(`Navigating to ${baseUrl}…`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);

  await caption(
    page,
    "On-Chain Risk Council",
    "A Qwen-powered agent society reviews Solana actions before a wallet signs.",
    4200,
  );

  await caption(
    page,
    "What judges should watch",
    "This is not a slideshow: Playwright is clicking the live UI and waiting for real streamed council decisions.",
    4200,
  );

  await runScenario(
    page,
    "Drainer reject",
    "The bot clicks Convene Council. Intake, specialists, cross-debate, referee, and guardrail stream live. Expect REJECT.",
  );

  await runScenario(
    page,
    "Held-back consensus",
    "Now a clean transfer-style action tests the guardrail: agents vote approve, but deterministic rules hold it back because it's irreversible. Outcome: ESCALATE. Safety over velocity.",
  );

  await runScenario(
    page,
    "Revoke delegate (approve)",
    "A genuinely reversible action (revoke a delegate) passes through the guardrail. Outcome: APPROVE. The council can execute safe, undoable operations.",
  );

  await runScenario(
    page,
    "Adversarial approve attempt",
    "User claims 'this is reversible/refundable' to social-engineer an approve. The guardrail ignores the claim and holds the action. Outcome: ESCALATE. Free text cannot override deterministic safety rules.",
  );

  await page.getByRole("link", { name: "Benchmark" }).click();
  await page.waitForURL("**/benchmark", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await caption(page, "Benchmark", latestBenchmarkSummary(), 6000);

  await page.goto(`${baseUrl}/api/health?deep=1&schema=1`, { waitUntil: "domcontentloaded" });
  await caption(
    page,
    "Live dependencies",
    "Qwen, Helius MCP, and DB health are checked through the deployed API.",
    4500,
  );

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await caption(
    page,
    "Double MCP",
    "The project consumes Helius MCP for evidence and exposes submitAction, getDecision, and getBenchmark as MCP tools.",
    5200,
  );

  await caption(page, "Close", "Consensus is necessary, never sufficient. Track 3: Agent Society.", 5000);
  await removeCaption(page);

  log("Demo script finished.");
  if (keepOpen) {
    log("Browser stays open for OBS. Close the Chrome window (or Ctrl+C here) when recording is done.");
    await new Promise(() => undefined);
  }

  await browser.close();
}

main().catch((error) => {
  console.error("PLAYWRIGHT DEMO FAIL:", error);
  process.exitCode = 1;
});
