/**
 * POST /api/actions — submit an action for council review, get the Decision.
 *
 * Body (one of): { signature } | { serializedTx } | { intent } [, requester, network]
 * Returns: Decision { outcome, unanimous, votes[], guardrail, tokens, latencyMs }
 *
 * For the live deliberation stream (SSE), use POST /api/stream instead.
 */
import { NextResponse } from "next/server";
import { runCouncil } from "@/orchestrator/council";
import { ActionInputSchema } from "@/lib/types";
import { acquireCouncilSlot, checkCouncilAccess, councilGateStatus } from "@/lib/councilGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Council runs multiple LLM + Helius calls; give it room.
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = ActionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid action", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const access = checkCouncilAccess(request);
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const release = acquireCouncilSlot();
  if (!release) {
    return NextResponse.json(
      { error: "council busy", detail: councilGateStatus() },
      { status: 429 },
    );
  }

  try {
    const decision = await runCouncil(parsed.data, undefined, { signal: request.signal });
    return NextResponse.json(decision);
  } catch (e) {
    return NextResponse.json(
      { error: "council failed", detail: String(e) },
      { status: 500 },
    );
  } finally {
    release();
  }
}
