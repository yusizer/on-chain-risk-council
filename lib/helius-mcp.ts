/**
 * lib/helius-mcp.ts — Client for the Helius MCP server (https://www.helius.dev/docs/agents/mcp).
 *
 * Spawns `npx helius-mcp@latest` as a subprocess and speaks MCP over stdio.
 * Exposes 9 routed domain tools; we call the ones the council needs:
 *   heliusTransaction.parseTransactions  — human-readable tx parse
 *   heliusChain.getAccountInfo           — account type / owner / data
 *   heliusChain.getTokenAccounts         — token holdings by owner/mint
 *   heliusChain.simulateTransaction      — fork-sim: logs, CU, account diff (no submit)
 *   heliusWallet                         — balances, history, funding analysis
 *
 * Singleton: one subprocess reused for the lifetime of the ECS backend.
 * Windows-aware: uses npx.cmd on win32 (spawn can't resolve bare `npx`).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let _client: Client | null = null;
let _initPromise: Promise<Client> | null = null;

async function client(): Promise<Client> {
  if (_client) return _client;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) throw new Error("HELIUS_API_KEY not set");
    const isWin = process.platform === "win32";
    const transport = new StdioClientTransport({
      command: isWin ? "npx.cmd" : "npx",
      args: ["helius-mcp@latest"],
      env: { ...process.env, HELIUS_API_KEY: apiKey } as Record<string, string>,
    });
    const c = new Client(
      { name: "on-chain-risk-council", version: "0.1.0" },
      { capabilities: {} },
    );
    await c.connect(transport);
    _client = c;
    return c;
  })();
  return _initPromise;
}

/**
 * Low-level: call any routed Helius tool with an `action` + params.
 *
 * The helius-mcp routed tools (heliusTransaction / heliusChain / heliusWallet)
 * require telemetry params `_feedback`, `_feedbackTool`, `_model` (strings) on
 * every call — omitting them yields MCP -32602 "Invalid params" validation
 * errors. We inject sensible defaults; callers can override by passing their own.
 */
export async function callHelius(
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const c = await client();
  const arguments_ = {
    // Telemetry params required by every routed helius-mcp tool (minLength 1).
    _feedback: "none",
    _feedbackTool: "on-chain-risk-council",
    _model: "qwen3-coder-plus",
    ...args,
  };
  const res = await c.callTool({ name: tool, arguments: arguments_ });
  // MCP tool results wrap content blocks; return the first text block parsed.
  const content = (res as any).content;
  if (Array.isArray(content)) {
    const txt = content.find((b: any) => b.type === "text")?.text;
    if (txt) {
      try {
        return JSON.parse(txt);
      } catch {
        return txt;
      }
    }
  }
  return res;
}

/* ── Typed helpers used by the council agents ─────────────────────────────── */

/** Parse one or more transaction signatures into a human-readable description. */
export async function parseTransactions(signatures: string[]): Promise<unknown> {
  return callHelius("heliusTransaction", {
    action: "parseTransactions",
    transactions: signatures,
  });
}

/** Account info (owner, lamports, data) — detects program/mint/ATA vs wallet. */
export async function getAccountInfo(address: string): Promise<unknown> {
  return callHelius("heliusChain", { action: "getAccountInfo", address });
}

/** Token accounts for an owner (what they hold, mint, amount). */
export async function getTokenAccounts(owner: string): Promise<unknown> {
  return callHelius("heliusChain", { action: "getTokenAccounts", owner });
}

/** Fork-simulate a serialized/base64 transaction: logs, CU, pre/post account diff. */
export async function simulateTransaction(
  transaction: string,
  opts: { commitment?: string; sigVerify?: boolean; replaceRecentBlockhash?: boolean } = {},
): Promise<unknown> {
  // heliusChain.simulateTransaction schema: transaction, sigVerify,
  // replaceRecentBlockhash, commitment (no `signers` — fork-sim, not execution).
  return callHelius("heliusChain", {
    action: "simulateTransaction",
    transaction,
    sigVerify: true,
    replaceRecentBlockhash: true,
    commitment: opts.commitment ?? "confirmed",
    ...opts,
  });
}

/** Wallet funding analysis — was this account funded by a known drainer/exchange? */
export async function walletFunding(address: string): Promise<unknown> {
  // Valid heliusWallet actions: getBalance, getTokenBalances, getWalletBalances,
  // getWalletBalanceAt, getWalletHistory, getWalletTransfers, getWalletIdentity,
  // batchWalletIdentity, getWalletFundedBy. (getFundingAnalysis is NOT valid.)
  return callHelius("heliusWallet", { action: "getWalletFundedBy", address });
}

/** Close the MCP client + its stdio subprocess. Call on shutdown to avoid orphan processes. */
export async function closeHelius(): Promise<void> {
  if (_client) {
    try {
      await _client.close();
    } catch {
      /* ignore — best-effort cleanup */
    }
    _client = null;
    _initPromise = null;
  }
}

/** Discover the live tool surface (handy for dev + the architecture write-up). */
export async function listTools(): Promise<{ name: string; description?: string }[]> {
  const c = await client();
  const r = await c.listTools();
  return (r.tools ?? []).map((t) => ({ name: t.name, description: t.description }));
}

/** Like listTools but also returns each tool's JSON Schema (for arg debugging). */
export async function listToolsDetailed(): Promise<{ name: string; description?: string; inputSchema: unknown }[]> {
  const c = await client();
  const r = await c.listTools();
  return (r.tools ?? []).map((t) => ({ name: t.name, description: t.description, inputSchema: (t as any).inputSchema }));
}

/** Health check: list tools (cheap round-trip). */
export async function ping(): Promise<{ ok: boolean; tools: string[]; error?: string }> {
  try {
    const tools = await listTools();
    return { ok: true, tools: tools.map((t) => t.name) };
  } catch (e) {
    return { ok: false, tools: [], error: String(e) };
  }
}
