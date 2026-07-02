/**
 * GET /api/health — liveness + dependency checks for the three backends.
 * Also serves as the Alibaba Cloud deployment proof endpoint (the backend is
 * reachable on the ECS instance and talks to RDS pgvector + Qwen + Helius).
 */
import { NextResponse } from "next/server";
import { ping as qwenPing } from "@/lib/qwen";
import { ping as heliusPing } from "@/lib/helius-mcp";
import { ping as dbPing, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unwrap<T>(p: PromiseSettledResult<T>): T | { ok: false; error: string } {
  return p.status === "fulfilled" ? p.value : { ok: false, error: String(p.reason) };
}

export async function GET() {
  const dbWithSchema = (async () => {
    await ensureSchema();
    return dbPing();
  })();
  const [q, h, d] = await Promise.allSettled([qwenPing(), heliusPing(), dbWithSchema]);
  const allOk =
    (q.status === "fulfilled" && q.value.ok) &&
    (h.status === "fulfilled" && h.value.ok) &&
    (d.status === "fulfilled" && d.value.ok);
  return NextResponse.json(
    { ok: allOk, qwen: unwrap(q), helius: unwrap(h), db: unwrap(d) },
    { status: allOk ? 200 : 503 },
  );
}
