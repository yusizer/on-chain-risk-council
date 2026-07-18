/**
 * lib/db.ts — PostgreSQL + pgvector memory/audit backend.
 *
 * Two tables back the council:
 *   exploit_patterns  — labelled Solana exploit signatures with a 1024-d
 *                       embedding (text-embedding-v3) for semantic recall.
 *   decisions         — audit log of every council outcome (agent votes,
 *                       guardrail reason, tokens, latency) for the benchmark.
 *
 * Uses node-postgres directly (no ORM) to keep deps thin. pgvector is enabled
 * with `CREATE EXTENSION IF NOT EXISTS vector;` on first boot.
 */
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "require"
    ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined,
  max: 8,
  idleTimeoutMillis: 30_000,
});

let _schemaReady: Promise<void> | null = null;

/** Create extension + tables once per process. Idempotent. */
export function ensureSchema(): Promise<void> {
  if (_schemaReady) return _schemaReady;
  _schemaReady = (async () => {
    const c = await pool.connect();
    try {
      await c.query("CREATE EXTENSION IF NOT EXISTS vector;");
      await c.query(`
        CREATE TABLE IF NOT EXISTS exploit_patterns (
          id            SERIAL PRIMARY KEY,
          signature     TEXT UNIQUE,
          label         TEXT NOT NULL,           -- 'drainer' | 'authority_delegation' | 'fake_mint' | 'rugpull' | 'account_takeover' | 'clean'
          description   TEXT,
          embedding     vector(1024) NOT NULL,
          created_at    TIMESTAMPTZ DEFAULT now()
        );
      `);
      await c.query(`
        CREATE TABLE IF NOT EXISTS decisions (
          id            SERIAL PRIMARY KEY,
          action_hash   TEXT,
          track         TEXT,                    -- which action type
          outcome       TEXT NOT NULL,           -- 'execute' | 'escalate' | 'reject'
          agent_votes   JSONB NOT NULL,          -- per-agent vote + reasoning
          guardrail     JSONB,                   -- deterministic guardrail reason
          malicious     BOOLEAN,                 -- ground truth (benchmark only)
          tokens        INT,
          latency_ms    INT,
          created_at    TIMESTAMPTZ DEFAULT now()
        );
      `);
      await c.query(
        `CREATE INDEX IF NOT EXISTS idx_exploit_embedding ON exploit_patterns USING hnsw (embedding vector_cosine_ops);`,
      );
      await c.query(`CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions (created_at);`);
    } finally {
      c.release();
    }
  })().catch((e) => {
    _schemaReady = null;
    throw e;
  });
  return _schemaReady;
}

/* ── exploit-pattern memory ───────────────────────────────────────────────── */

export async function insertExploitPattern(
  signature: string,
  label: string,
  description: string,
  embedding: number[],
): Promise<void> {
  await pool.query(
    `INSERT INTO exploit_patterns (signature, label, description, embedding)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (signature) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, embedding = EXCLUDED.embedding;`,
    [signature, label, description, `[${embedding.join(",")}]`],
  );
}

/** Semantic nearest-neighbours over the exploit-pattern memory. */
export async function searchExploits(
  embedding: number[],
  k = 5,
): Promise<{ signature: string; label: string; description: string; distance: number }[]> {
  const r = await pool.query(
    `SELECT signature, label, description, embedding <=> $1::vector AS distance
     FROM exploit_patterns
     ORDER BY embedding <=> $1::vector
     LIMIT $2;`,
    [`[${embedding.join(",")}]`, k],
  );
  return r.rows;
}

/* ── decisions audit log ──────────────────────────────────────────────────── */

export interface DecisionRecord {
  action_hash?: string;
  track?: string;
  outcome: string;
  agent_votes: unknown;
  guardrail?: unknown;
  malicious?: boolean;
  tokens?: number;
  latency_ms?: number;
}

export interface DecisionSummary {
  id: number;
  action_hash: string | null;
  track: string | null;
  outcome: string;
  malicious: boolean | null;
  tokens: number | null;
  latency_ms: number | null;
  created_at: Date;
}

export async function insertDecision(d: DecisionRecord): Promise<number> {
  const r = await pool.query(
    `INSERT INTO decisions (action_hash, track, outcome, agent_votes, guardrail, malicious, tokens, latency_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id;`,
    [
      d.action_hash,
      d.track,
      d.outcome,
      JSON.stringify(d.agent_votes),
      d.guardrail == null ? null : JSON.stringify(d.guardrail),
      d.malicious,
      d.tokens,
      d.latency_ms,
    ],
  );
  return r.rows[0]?.id;
}

export async function listDecisions(limit = 50): Promise<DecisionSummary[]> {
  const r = await pool.query(
    `SELECT id, action_hash, track, outcome, malicious, tokens, latency_ms, created_at
     FROM decisions ORDER BY created_at DESC LIMIT $1;`,
    [limit],
  );
  return r.rows;
}

/** Health check used by /api/health. */
export async function ping(): Promise<{ ok: boolean; error?: string }> {
  try {
    await pool.query("SELECT 1;");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export { pool };
