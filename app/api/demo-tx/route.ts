/**
 * GET /api/demo-tx — base64 serialized demo transactions for the chamber UI.
 * Lets judges exercise the Simulator (fork-sim) path without crafting bytes.
 */
import { NextResponse } from "next/server";
import { demoApproveSerialized, demoRevokeSerialized, demoTransferSerialized } from "@/lib/demoTx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    transfer: {
      label: "Serialized SOL transfer (0.01 SOL)",
      serializedTx: demoTransferSerialized(),
      expect: "execute or escalate (routine corridor / sim)",
    },
    approve: {
      label: "Serialized SPL Approve max (authority)",
      serializedTx: demoApproveSerialized(),
      expect: "escalate or reject",
    },
    revoke: {
      label: "Serialized SPL Revoke delegate",
      serializedTx: demoRevokeSerialized(),
      expect: "execute (reversible config)",
    },
  });
}
