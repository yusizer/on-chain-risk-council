/**
 * POST /api/stream — submit an action, get the council deliberation as SSE.
 *
 * Body (one of): { signature } | { serializedTx } | { intent } [, requester, network]
 * Stream: one `data: <CouncilEvent>\n\n` per council event, then a final
 * `data: { step:"decision", data:<Decision> }\n\n`, then the stream closes.
 *
 * This is the Presentation-criterion live demo surface: the council chamber UI
 * subscribes here and renders deliberation as it happens.
 *
 * Next.js 16 route-handler streaming uses the Web Streams API directly
 * (ReadableStream + Response) — see node_modules/next/dist/docs/01-app/02-guides/streaming.md.
 */
import { runCouncil } from "@/orchestrator/council";
import { ActionInputSchema, type CouncilEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  const parsed = ActionInputSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid action", detail: parsed.error.issues }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const action = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const emit = (e: CouncilEvent) => send(e);
      try {
        const decision = await runCouncil(action, emit);
        send({ step: "decision", status: "done", data: decision });
      } catch (e) {
        send({ step: "council", status: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable reverse-proxy buffering so chunks flush immediately (nginx).
      "X-Accel-Buffering": "no",
    },
  });
}
