/**
 * alibaba/proof.ts — Alibaba Cloud deployment proof (hackathon requirement).
 *
 * Run ON the Alibaba ECS instance that hosts the backend. Proves and records:
 *   1. The process is running on an Alibaba ECS instance — via the instance
 *      metadata service (100.100.100.200), only reachable from inside ECS.
 *   2. The RDS PostgreSQL + pgvector is reachable and the `vector` extension is
 *      installed (the exploit-pattern memory backend).
 *   3. The Qwen + Helius backends are reachable.
 *   4. (Optional) the council /api/health endpoint is live.
 *
 * Writes alibaba/proof.json — attach it + a screen recording of this run to the
 * submission as the Alibaba Cloud proof-of-deployment.
 *
 * Run:  node --env-file=.env --import tsx alibaba/proof.ts
 */
import { writeFileSync } from "node:fs";
import { pool, ping as dbPing, ensureSchema } from "@/lib/db";
import { ping as qwenPing } from "@/lib/qwen";
import { ping as heliusPing, closeHelius } from "@/lib/helius-mcp";

const METADATA_BASE = "http://100.100.100.200/latest/meta-data/";

async function fetchMeta(key: string): Promise<string | null> {
  try {
    const r = await fetch(`${METADATA_BASE}${key}`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    return (await r.text()).trim();
  } catch {
    return null;
  }
}

async function pingCouncil(): Promise<unknown> {
  const url = process.env.COUNCIL_URL ?? "http://localhost:3000/api/health";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return await r.json();
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200), url };
  }
}

async function checkPgvector(): Promise<{ installed: boolean; error?: string }> {
  try {
    const r = await pool.query("SELECT extname FROM pg_extension WHERE extname = 'vector';");
    return { installed: r.rows.length > 0 };
  } catch (e) {
    return { installed: false, error: String(e).slice(0, 200) };
  }
}

async function main(): Promise<void> {
  console.log("=== Alibaba Cloud deployment proof ===");

  // 1. ECS instance metadata (only reachable from inside an Alibaba ECS VM).
  const ecs = {
    onEcs: false as boolean,
    instanceId: null as string | null,
    region: null as string | null,
    zone: null as string | null,
  };
  const instanceId = await fetchMeta("instance-id");
  if (instanceId) {
    ecs.onEcs = true;
    ecs.instanceId = instanceId;
    ecs.region = await fetchMeta("region-id");
    ecs.zone = await fetchMeta("zone-id");
  }
  console.log("ECS:", ecs);

  // 2. RDS PostgreSQL + pgvector.
  await ensureSchema();
  const db = await dbPing();
  const pgvector = await checkPgvector();
  console.log("RDS:", db, "pgvector:", pgvector);

  // 3. Qwen + Helius.
  const qwen = await qwenPing();
  const helius = await heliusPing();
  console.log("Qwen:", qwen.ok, "| Helius:", helius.ok, helius.ok ? `(${helius.tools.length} tools)` : "");

  // 4. Council endpoint (optional — only if the server is running alongside).
  const council = await pingCouncil();
  console.log("Council /api/health:", council);

  const proof = {
    timestamp: new Date().toISOString(),
    ecs,
    rds: { ...db, pgvector },
    qwen,
    helius: { ok: helius.ok, toolCount: helius.tools.length, error: helius.error },
    council,
    envPresent: {
      DASHSCOPE_API_KEY: !!process.env.DASHSCOPE_API_KEY,
      HELIUS_API_KEY: !!process.env.HELIUS_API_KEY,
      DATABASE_URL: !!process.env.DATABASE_URL,
      ALIYUN_ECS_INSTANCE_ID: !!process.env.ALIYUN_ECS_INSTANCE_ID,
      ALIYUN_RDS_INSTANCE_ID: !!process.env.ALIYUN_RDS_INSTANCE_ID,
      ALIYUN_REGION: !!process.env.ALIYUN_REGION,
    },
  };
  writeFileSync("alibaba/proof.json", JSON.stringify(proof, null, 2));
  console.log("\nproof written: alibaba/proof.json");
  console.log("onEcs:", ecs.onEcs, "| rds.ok:", db.ok, "| pgvector:", pgvector.installed, "| qwen:", qwen.ok, "| helius:", helius.ok);
}

main()
  .catch((e) => {
    console.error("PROOF FAIL:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeHelius();
    await pool.end();
  });
