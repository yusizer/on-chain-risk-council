/**
 * GET /api/audit — tamper-evident decision chain (hash-linked audit trail).
 * Judges / integrators can verify that recorded outcomes were not rewritten.
 */
import { NextResponse } from "next/server";
import { headHash, listAuditChain, verifyChain } from "@/lib/auditChain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const events = listAuditChain(limit);
  const verification = verifyChain(events);
  return NextResponse.json({
    headHash: headHash(),
    count: events.length,
    verification,
    events,
  });
}
