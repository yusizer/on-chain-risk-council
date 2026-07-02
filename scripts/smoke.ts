/**
 * scripts/smoke.ts — end-to-end smoke test for the On-Chain Risk Council.
 *
 * Runs the full council pipeline (intake → riskAnalyst + exploitSkeptic +
 * compliance + simulator → cross-debate → referee → guardrail) via runCouncil.
 *
 * Run:  npm run smoke
 *   SMOKE_SIG=<solana tx signature>   — review a real on-chain tx (uses Helius)
 *   SMOKE_INTENT="..."                — review a natural-language intent
 *   SMOKE_SERIALIZED=<base64 tx>      — review + fork-simulate a proposed tx
 *   SMOKE_NO_DEBATE=1                 — skip the cross-debate round (faster)
 *   (default)                         — a synthetic drainer intent
 *
 * DB is optional: if DATABASE_URL is set, the script ensures the schema and
 * seeds exploit patterns first. Without it, exploitSkeptic skips recall.
 */
import { ensureSchema } from "@/lib/db";
import { seedExploits } from "@/lib/exploitSeeds";
import { runCouncil } from "@/orchestrator/council";
import { closeHelius } from "@/lib/helius-mcp";
import type { ActionInput, CouncilEvent } from "@/lib/types";

const emit = (e: CouncilEvent) => {
  const data = e.data ? ` ${JSON.stringify(e.data).slice(0, 240)}` : "";
  const msg = e.message ? ` — ${e.message}` : "";
  console.log(`[${e.step}:${e.status}]${e.agent ? ` (${e.agent})` : ""}${msg}${data}`);
};

async function main() {
  const action: ActionInput = process.env.SMOKE_SERIALIZED
    ? { serializedTx: process.env.SMOKE_SERIALIZED, network: "mainnet" }
    : process.env.SMOKE_SIG
      ? { signature: process.env.SMOKE_SIG, network: "mainnet" }
      : {
          intent:
            process.env.SMOKE_INTENT ??
            "setAuthority on SPL mint XYZ to a freshly-funded unknown wallet, then transfer all holder tokens to it",
          network: "mainnet",
        };

  console.log("=== ON-CHAIN RISK COUNCIL — smoke ===");
  console.log("action:", JSON.stringify(action));

  if (process.env.DATABASE_URL) {
    console.log("\n[db] ensuring schema + seeding exploit patterns…");
    try {
      await ensureSchema();
      const s = await seedExploits();
      console.log("[db] seeds:", s);
    } catch (e) {
      console.log("[db] skipped:", String(e).slice(0, 160));
    }
  } else {
    console.log("\n[db] no DATABASE_URL — exploit memory skipped (exploitSkeptic recall errors harmlessly).");
  }

  const decision = await runCouncil(action, emit, {
    crossDebate: !process.env.SMOKE_NO_DEBATE,
  });

  console.log("\n=== DECISION ===");
  console.log(JSON.stringify(decision, null, 2));
  console.log(
    `\noutcome=${decision.outcome} unanimous=${decision.unanimous} heldBack=${decision.guardrail.heldBack} tokens=${decision.tokens} latency=${decision.latencyMs}ms`,
  );
  console.log(`votes: ${decision.votes.map((v) => `${v.agent}:${v.vote}`).join("  ")}`);
  console.log(`rules: ${decision.guardrail.rules.join(", ") || "(none)"}`);
}

main()
  .catch((e) => {
    console.error("SMOKE FAIL:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Kill the helius-mcp subprocess so smoke runs don't leave orphans.
    await closeHelius();
  });
