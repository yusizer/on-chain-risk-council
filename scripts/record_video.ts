import { chromium, type Browser, type Page } from "playwright";
import path from "node:path";
import fs from "node:fs";

const CHROME_PATH =
  process.env.PW_CHROME_PATH ??
  "/home/yus23/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";

const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:3001";
const VIDEO_DIR = path.join(process.cwd(), "demo-videos");
const OUT = path.join(VIDEO_DIR, "demo-final.mp4");
const FFMPEG = process.env.FFMPEG_PATH ?? "/tmp/opencode/ffmpeg";

const REVIEWS = [
  {
    label: "Drainer intent",
    kind: "intent" as const,
    text: "Approve a dodgy token and let a site drain my SOL via a malicious delegate.",
  },
  {
    label: "Fake mint drain",
    kind: "intent" as const,
    text: "Swap my USDC into a new token that just minted 1 billion supply to the deployer.",
  },
  {
    label: "Clean transfer",
    kind: "intent" as const,
    text: "Send 0.5 SOL from my wallet to a friend's address, no approvals.",
  },
];

const CLIPS: string[] = [];

async function runReview(
  browser: Browser,
  r: (typeof REVIEWS)[number],
  idx: number,
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
  });
  const page: Page = await context.newPage();
  const clipTag = `r${idx}`;

  page.on("pageerror", (err) => console.error(`  [pageerr] ${err.message}`));

  console.log(`\n=== Review ${idx + 1}/${REVIEWS.length}: ${r.label} ===`);
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(2500);

  const kindBtn = page
    .locator(`button:has-text("${r.kind}")`)
    .first();
  await kindBtn.click();
  await page.waitForTimeout(500);

  const textarea = page.locator("textarea");
  await textarea.fill(r.text);
  await page.waitForTimeout(800);

  const convene = page.locator('button:has-text("Convene Council")');
  await convene.click();
  console.log("  Clicked Convene Council. Waiting for decision...");

  let decided = false;
  for (let t = 0; t < 48; t++) {
    await page.waitForTimeout(5000);
    const has = await page.locator("text=Final Decision").count();
    if (has > 0) {
      decided = true;
      console.log(`  Decision shown after ~${(t + 1) * 5}s`);
      break;
    }
  }
  if (!decided) console.log("  WARNING: decision not shown within timeout");

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2500);

  const video = page.video();
  await context.close();
  if (!video) throw new Error("No video recorded for " + r.label);

  const raw = await video.path();
  const clip = path.join(VIDEO_DIR, `clip-${clipTag}.webm`);
  fs.copyFileSync(raw, clip);
  CLIPS.push(clip);
  console.log(`  Clip saved: ${clip} (${(fs.statSync(clip).size / 1024 / 1024).toFixed(1)} MB)`);
}

async function main(): Promise<void> {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  console.log(`Recording: ${BASE_URL} → ${OUT}`);

  for (let i = 0; i < REVIEWS.length; i++) {
    const browser = await chromium.launch({
      headless: false,
      executablePath: CHROME_PATH,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-dbus",
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
        "--disable-features=GlobalMediaControls,MediaRouter,OptimizationHints",
      ],
    });
    try {
      await runReview(browser, REVIEWS[i], i);
    } catch (err) {
      console.error(`Review ${i + 1} failed:`, err);
    } finally {
      await browser.close();
    }
  }

  console.log("\nBenchmark dashboard...");
  // separate context for benchmark page
  const b2 = await chromium.launch({
    headless: false,
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  try {
    const ctx = await b2.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
      recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/benchmark`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(7000);
    const v = page.video();
    await ctx.close();
    if (v) {
      const raw = await v.path();
      const clip = path.join(VIDEO_DIR, "clip-bench.webm");
      fs.copyFileSync(raw, clip);
      CLIPS.push(clip);
      console.log(`  Bench clip: ${(fs.statSync(clip).size / 1024 / 1024).toFixed(1)} MB`);
    }
  } catch (err) {
    console.error("Benchmark recording failed:", err);
  } finally {
    await b2.close();
  }

  // Concat clips
  if (CLIPS.length === 0) throw new Error("No clips recorded");
  const list = path.join(VIDEO_DIR, "clips.txt");
  fs.writeFileSync(
    list,
    CLIPS.map((c) => `file '${path.resolve(c)}'`).join("\n"),
  );
  const cmd = `${FFMPEG} -y -f concat -safe 0 -i "${list}" -c:v libx264 -pix_fmt yuv420p -r 30 "${OUT}"`;
  console.log("Concat:", cmd);
  const { execSync } = await import("node:child_process");
  execSync(cmd, { stdio: "inherit" });
  console.log(`Final video: ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
