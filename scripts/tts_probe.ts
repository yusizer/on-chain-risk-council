/**
 * scripts/tts_probe.ts — verify DashScope (Qwen Cloud) CosyVoice TTS works
 * for English, using the project's existing DASHSCOPE_API_KEY (via --env-file=.env).
 * Writes a short test clip to demo-videos/_tts_probe.mp3.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const KEY = process.env.DASHSCOPE_API_KEY;
if (!KEY) {
  console.error("NO_KEY");
  process.exit(2);
}
const OUT = path.join(process.cwd(), "demo-videos", "_tts_probe.mp3");

const VOICES = ["cherry", "heart", "sarah", "longxiaochun"];
const TEXT = "On-Chain Risk Council: a society of specialist agents that reviews Solana actions before they execute.";

async function tryVoice(voice: string): Promise<boolean> {
  const res = await fetch(
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "cosyvoice-v1",
        input: { text: TEXT, voice },
        parameters: { text_type: "plain", output_format: "mp3", sample_rate: 24000, voice },
      }),
    },
  );
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    console.log(`voice=${voice} raw: ${text.slice(0, 300)}`);
    return false;
  }
  const out = json.output as Record<string, unknown> | undefined;
  const audio = out?.audio as Record<string, unknown> | undefined;
  const url = audio?.url as string | undefined;
  if (!url) {
    console.log(`voice=${voice} -> no url (${res.status}) ${JSON.stringify(json).slice(0, 300)}`);
    return false;
  }
  const audioRes = await fetch(url);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  writeFileSync(OUT, buf);
  console.log(`OK voice=${voice} bytes=${buf.length}`);
  return true;
}

async function main(): Promise<void> {
  let ok = false;
  for (const v of VOICES) {
    try {
      if (await tryVoice(v)) {
        ok = true;
        break;
      }
    } catch (e) {
      console.log(`voice=${v} error ${(e as Error).message}`);
    }
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
