#!/usr/bin/env node
/**
 * mcp-server/server.ts — expose the On-Chain Risk Council AS an MCP server.
 *
 * Double MCP (Tech Depth criterion): the council CONSUMES helius-mcp tools
 * (parseTransactions, getAccountInfo, getWalletFundedBy, simulateTransaction)
 * and EXPOSES itself as an MCP server so external AI agents — Claude, Cursor,
 * any MCP client — can submit Solana actions for review and get a structured
 * Decision back. Council-as-a-tool is the productization story (Impact).
 *
 * Tools:
 *   submitAction(signature | serializedTx | intent) -> Decision
 *   getDecision()                                   -> latest Decision (in-session)
 *   getBenchmark()                                  -> latest benchmark/results/*.json
 *   getAuditChain()                                 -> hash-chain verification + events
 *
 * Run:  npm run mcp
 *   or wire into an MCP client config:
 *     { "command": "npx", "args": ["tsx", "mcp-server/server.ts"] }
 *
 * Logs go to stderr so stdout stays a clean MCP stdio channel.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCouncil } from "@/orchestrator/council";
import { ActionInputSchema, type ActionInput, type Decision } from "@/lib/types";
import { acquireCouncilSlot, councilGateStatus } from "@/lib/councilGate";

let lastDecision: Decision | null = null;

const actionShape = {
  signature: z.string().optional().describe("Solana transaction signature to review (read-only parse via Helius)"),
  serializedTx: z.string().optional().describe("base64 serialized transaction to fork-simulate via Helius"),
  intent: z.string().optional().describe("natural-language description of the action"),
  requester: z.string().optional().describe("optional requester identifier"),
  network: z.literal("mainnet").default("mainnet").describe("Solana network: mainnet only"),
};

function latestBench(): unknown | null {
  const dir = join(process.cwd(), "benchmark", "results");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("bench-") && f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  try {
    return JSON.parse(readFileSync(join(dir, files[files.length - 1]), "utf8"));
  } catch {
    return null;
  }
}

const server = new McpServer({
  name: "on-chain-risk-council",
  version: "0.1.0",
});

server.registerTool(
  "submitAction",
  {
    description:
      "Submit a Solana action (signature | serializedTx | intent) for multi-agent council review. Returns the final Decision: outcome (execute|escalate|reject), per-agent votes, deterministic guardrail reason, token usage, latency. The guardrail can hold back even a unanimous approve.",
    inputSchema: actionShape,
  },
  async (args) => {
    const { signature, serializedTx, intent, requester, network } = args as {
      signature?: string;
      serializedTx?: string;
      intent?: string;
      requester?: string;
      network?: string;
    };
    const parsed = ActionInputSchema.safeParse({ signature, serializedTx, intent, requester, network: network ?? "mainnet" });
    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: "text", text: `invalid action: ${parsed.error.issues.map((i) => i.message).join("; ")}` }],
      };
    }
    const action: ActionInput = parsed.data;
    const release = acquireCouncilSlot();
    if (!release) {
      return {
        isError: true,
        content: [{ type: "text", text: `council busy: ${JSON.stringify(councilGateStatus())}` }],
      };
    }
    try {
      const decision = await runCouncil(action);
      lastDecision = decision;
      return { content: [{ type: "text", text: JSON.stringify(decision, null, 2) }] };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: "text", text: `council failed: ${String(e).slice(0, 400)}` }],
      };
    } finally {
      release();
    }
  },
);

server.registerTool(
  "getDecision",
  {
    description: "Return the most recent council Decision from this server session (in-memory).",
  },
  async () => {
    if (!lastDecision) {
      return { content: [{ type: "text", text: "no decision yet — call submitAction first" }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(lastDecision, null, 2) }] };
  },
);

server.registerTool(
  "getBenchmark",
  {
    description:
      "Return the latest benchmark results (lone-agent vs council metrics: malicious recall, false-approve, false-reject, accuracy, latency, tokens) from benchmark/results/.",
  },
  async () => {
    const data = latestBench();
    if (!data) {
      return { content: [{ type: "text", text: "no benchmark results yet — run `npm run bench` first" }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.registerTool(
  "getAuditChain",
  {
    description:
      "Return the in-process tamper-evident decision hash chain and verification result (prevHash → eventHash).",
  },
  async () => {
    const { headHash, listAuditChain, verifyChain } = await import("@/lib/auditChain");
    const events = listAuditChain(50);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ headHash: headHash(), verification: verifyChain(events), events }, null, 2),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "[on-chain-risk-council] MCP server ready on stdio (tools: submitAction, getDecision, getBenchmark, getAuditChain)",
  );
}

main().catch((e) => {
  console.error("[on-chain-risk-council] fatal:", e);
  process.exit(1);
});
