/**
 * GET /api/health — cheap liveness by default.
 * Use ?deep=1&schema=1 for Alibaba proof/dependency checks (Qwen + Helius + DB schema).
 */
import { NextResponse } from "next/server";
import { ping as qwenPing } from "@/lib/qwen";
import { ping as heliusPing } from "@/lib/helius-mcp";
import { ping as dbPing, ensureSchema } from "@/lib/db";
import { councilGateStatus } from "@/lib/councilGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unwrap<T>(p: PromiseSettledResult<T>): T | { ok: false; error: string } {
  return p.status === "fulfilled" ? p.value : { ok: false, error: String(p.reason) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";
  const schema = url.searchParams.get("schema") === "1";

  if (!deep) {
    return NextResponse.json({ ok: true, mode: "shallow", gate: councilGateStatus() });
  }

  const dbCheck = (async () => {
    if (schema) await ensureSchema();
    return dbPing();
  })();
  const [q, h, d] = await Promise.allSettled([qwenPing(), heliusPing(), dbCheck]);
  const allOk =
    (q.status === "fulfilled" && q.value.ok) &&
    (h.status === "fulfilled" && h.value.ok) &&
    (d.status === "fulfilled" && d.value.ok);
  return NextResponse.json(
    { ok: allOk, mode: schema ? "deep+schema" : "deep", qwen: unwrap(q), helius: unwrap(h), db: unwrap(d) },
    { status: 200 },
  );
}
