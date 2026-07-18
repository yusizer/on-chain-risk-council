/**
 * lib/councilGate.ts — tiny in-process concurrency guard for the public demo.
 *
 * The ECS demo exposes council endpoints publicly for judges. Each run can spend
 * several Qwen + Helius calls, so we cap concurrent runs without requiring auth.
 */
function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

const MAX_ACTIVE = parsePositiveInt(process.env.COUNCIL_MAX_ACTIVE, 3);
const WINDOW_MS = parsePositiveInt(process.env.COUNCIL_WINDOW_MS, 10 * 60 * 1000);
const MAX_PER_WINDOW = parseNonNegativeInt(process.env.COUNCIL_MAX_PER_WINDOW, 20);

/** Read lazily so runtime env changes (and tests) are honoured without a restart. */
function apiToken(): string | undefined {
  return process.env.COUNCIL_API_TOKEN?.trim();
}

let active = 0;

const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return request.headers.get("x-council-token")?.trim() ?? null;
}

export function checkCouncilAccess(request: Request):
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> } {
  const token = apiToken();
  if (token && bearerToken(request) !== token) {
    return { ok: false, status: 401, body: { error: "unauthorized" } };
  }

  if (MAX_PER_WINDOW === 0) return { ok: true };

  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  const key = clientKey(request);
  const bucket = buckets.get(key) ?? { count: 0, resetAt: now + WINDOW_MS };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + WINDOW_MS;
  }
  const nextCount = bucket.count + 1;
  if (nextCount > MAX_PER_WINDOW) {
    return {
      ok: false,
      status: 429,
      body: {
        error: "rate limited",
        detail: { max: MAX_PER_WINDOW, resetAt: new Date(bucket.resetAt).toISOString() },
      },
    };
  }
  bucket.count = nextCount;
  buckets.set(key, bucket);
  return { ok: true };
}

export function acquireCouncilSlot(): (() => void) | null {
  if (active >= MAX_ACTIVE) return null;
  active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active = Math.max(0, active - 1);
  };
}

export function councilGateStatus(): { active: number; max: number } {
  return { active, max: MAX_ACTIVE };
}
