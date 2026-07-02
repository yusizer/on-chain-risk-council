/**
 * scripts/probe_helius.ts — live verification of the Helius MCP client.
 *
 * Confirms the D3 fixes: telemetry params (_feedback/_feedbackTool/_model)
 * stop the MCP -32602 "Invalid params" error, and getWalletFundedBy is a
 * valid heliusWallet action (getFundingAnalysis was not). No LLM calls — just
 * the MCP surface, so it runs in a couple of seconds.
 *
 * Run: npm run probe:helius
 */
import { listTools, listToolsDetailed, getAccountInfo, walletFunding, parseTransactions, closeHelius } from "@/lib/helius-mcp";

// Well-known mainnet targets (read-only).
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BINANCE_HOT = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";

function head(s: unknown, n = 240): string {
  const str = typeof s === "string" ? s : JSON.stringify(s);
  return str.length > n ? str.slice(0, n) + "…" : str;
}

async function trial(name: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    console.log(`✅ ${name}: ${head(r)}`);
    return true;
  } catch (e) {
    console.log(`❌ ${name}: ${String(e).slice(0, 300)}`);
    return false;
  }
}

async function main() {
  console.log("=== HELIUS MCP PROBE ===");

  console.log("\n[listTools]");
  try {
    const tools = await listTools();
    console.log("tools:", tools.map((t) => t.name).join(", "));
  } catch (e) {
    console.log("❌ listTools:", String(e).slice(0, 300));
  }

  console.log("\n[inputSchema for routed tools we use]");
  try {
    const detailed = await listToolsDetailed();
    for (const name of ["heliusTransaction", "heliusChain", "heliusWallet"]) {
      const t = detailed.find((d) => d.name === name);
      if (t) {
        const schema = t.inputSchema as any;
        const props = schema?.properties ?? {};
        const required: string[] = schema?.required ?? [];
        const propSummary = Object.entries(props)
          .map(([k, v]: [string, any]) => `${k}${required.includes(k) ? "*" : ""}:${v?.type ?? "?"}${v?.minLength != null ? `(minLen ${v.minLength})` : ""}${v?.enum ? ` enum[${v.enum.join("|")}]` : ""}`)
          .join(", ");
        console.log(`\n${name}: required=[${required.join(",")}]`);
        console.log(`  props: ${propSummary}`);
        if (schema?.anyOf) console.log(`  anyOf: ${JSON.stringify(schema.anyOf).slice(0, 400)}`);
      }
    }
  } catch (e) {
    console.log("❌ schema dump:", String(e).slice(0, 300));
  }

  console.log("\n[routed tools — was -32602 before D3 fix]");
  await trial("getAccountInfo(USDC mint)", () => getAccountInfo(USDC_MINT));
  await trial("getWalletFundedBy(Binance hot)", () => walletFunding(BINANCE_HOT));

  console.log("\n[parseTransactions — needs a real signature; pass via SMOKE_SIG]");
  const sig = process.env.SMOKE_SIG;
  if (sig) {
    await trial("parseTransactions(sig)", () => parseTransactions([sig]));
  } else {
    console.log("(skipped — set SMOKE_SIG=<solana tx sig> to probe parseTransactions)");
  }

  console.log("\n=== DONE ===");
}

main()
  .catch((e) => {
    console.error("PROBE FAIL:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeHelius();
  });
