/**
 * scripts/voiceover.ts — mux a provided narration audio track under the
 * recorded demo video (demo-videos/demo.mp4) -> demo-videos/demo-voiced.mp4.
 *
 * The on-screen English captions stay; this just adds the voice track.
 *
 * Usage:  place your recording at demo-videos/voiceover.mp3 (or set DEMO_AUDIO)
 *         then:  npm run voiceover
 *
 * The audio is padded/trimmed to the video length so it always lines up.
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const VIDEO_DIR = process.env.DEMO_VIDEO_DIR ?? path.join(process.cwd(), "demo-videos");
const FFMPEG = process.env.DEMO_FFMPEG ?? "/tmp/kilo/ffmpeg-bin/ffmpeg-7.0.2-amd64-static/ffmpeg";

const videoPath = path.join(VIDEO_DIR, "demo.mp4");
const audioPath = process.env.DEMO_AUDIO ?? path.join(VIDEO_DIR, "voiceover.mp3");
const outPath = path.join(VIDEO_DIR, "demo-voiced.mp4");

function main(): void {
  if (!existsSync(videoPath)) {
    console.error(`Missing ${videoPath}`);
    process.exit(1);
  }
  if (!existsSync(audioPath)) {
    console.error(`Missing narration audio at ${audioPath}\nRecord your voiceover and place it there (or set DEMO_AUDIO).`);
    process.exit(1);
  }

  console.log(`Video: ${videoPath} (${(statSync(videoPath).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Audio: ${audioPath} (${(statSync(audioPath).size / 1024 / 1024).toFixed(1)} MB)`);

  const args = [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    // pad audio to video length, then cut at the shorter (video) stream
    "-filter_complex", "[1:a]apad",
    "-shortest",
    "-c:v", "copy",
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
  console.log(`Done: ${outPath} (${(statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log("Text-only version preserved at demo-videos/demo.mp4");
}

main();
