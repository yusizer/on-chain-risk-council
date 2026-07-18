/**
 * scripts/convert.ts — convert the latest Playwright .webm demo to a
 * YouTube-ready .mp4 with high visual quality (no quality loss re-encode).
 *
 * Run:  npm run demo:convert
 * ENV:  DEMO_VIDEO_DIR (default ./demo-videos), DEMO_FFMPEG (ffmpeg path)
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const VIDEO_DIR = process.env.DEMO_VIDEO_DIR ?? path.join(process.cwd(), "demo-videos");
const FFMPEG = process.env.DEMO_FFMPEG ?? "/tmp/kilo/ffmpeg-bin/ffmpeg-7.0.2-amd64-static/ffmpeg";

function latestWebm(): string | null {
  if (!existsSync(VIDEO_DIR)) return null;
  return readdirSync(VIDEO_DIR)
    .filter((f) => f.endsWith(".webm"))
    .sort()
    .at(-1) ?? null;
}

function main(): void {
  const file = latestWebm();
  if (!file) {
    console.error(`No .webm found in ${VIDEO_DIR}`);
    process.exit(1);
  }
  const inPath = path.join(VIDEO_DIR, file);
  const outPath = path.join(VIDEO_DIR, "demo.mp4");

  const mb = (statSync(inPath).size / 1024 / 1024).toFixed(1);
  console.log(`Converting ${inPath} (${mb} MB) -> ${outPath}`);

  const args = [
    "-y",
    "-i", inPath,
    "-vf", "scale=1920:1080:flags=lanczos",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "slow",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-c:a", "aac",
    "-b:a", "160k",
    "-movflags", "+faststart",
    outPath,
  ];

  const res = spawnSync(FFMPEG, args, { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`ffmpeg failed (exit ${res.status})`);
    process.exit(1);
  }
  console.log(`Done: ${outPath} (${ (statSync(outPath).size / 1024 / 1024).toFixed(1) } MB)`);
}

main();
