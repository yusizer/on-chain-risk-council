/**
 * lib/policySeeds.ts — policy caps + blocked entity patterns for compliance.
 *
 * Hard blocklists stay small and explicit. Pattern matches catch synthetic
 * demo intents (drainer/rugpull/fake-mint language) without false-positive
 * blocking of real mainnet counterparties.
 */
export const MAX_AMOUNT_USD = Number(process.env.COUNCIL_MAX_AMOUNT_USD ?? 10_000);

/** Low-stakes routine actions may auto-execute when the council is unanimous. */
export const AUTO_EXECUTE_MAX_USD = Number(process.env.COUNCIL_AUTO_EXECUTE_MAX_USD ?? 10_000);

/** Explicit blocked base58 counterparties (extend from sanctions / exploit intel). */
export const BLOCKED_COUNTERPARTIES = new Set<string>([
  // Leave intentionally empty for mainnet safety — pattern rules below cover demos.
]);

/** Explicit blocked mint identifiers / symbols. */
export const BLOCKED_MINTS = new Set<string>(["FAKEBONK", "SCAMUSDC", "CLONEBONK"]);

const SUSPICIOUS_COUNTERPARTY_RE =
  /drainer|rugpull|scam|unknown.?wallet|freshly.?funded|unverified.?program|deployed\s+\d+\s+minutes/i;

export function isBlockedCounterparty(addr: string): boolean {
  if (BLOCKED_COUNTERPARTIES.has(addr)) return true;
  return SUSPICIOUS_COUNTERPARTY_RE.test(addr);
}

export function isBlockedMint(mint: string): boolean {
  if (BLOCKED_MINTS.has(mint)) return true;
  return /fake|scam|clone|impersonat/i.test(mint);
}

/** True when description text itself is a clear policy hit (intent-only reviews). */
export function descriptionPolicyHit(description: string): string | null {
  const d = description.toLowerCase();
  if (/setauthority.*freshly.?funded|freshly.?funded.*setauthority/.test(d)) {
    return "authority_to_fresh_wallet";
  }
  if (/approve.*maximum|max(?:imum)?\s+uint|infinite\s+approve/.test(d) && /unverified|unknown|minutes ago|freshly/.test(d)) {
    return "infinite_approve_unknown_program";
  }
  if (/rugpull|remove\s+100%.*liquidity|drain(?:er|s)?\s+the\s+pool/.test(d)) {
    return "rugpull_pattern";
  }
  if (/cloned?\s+metadata|impersonat|fake.?mint|symbol\s+['"]bonk['"]/.test(d)) {
    return "fake_mint_impersonation";
  }
  if (/ofac|sanctioned|blocked.?list|sanctions/.test(d)) {
    return "sanctions_language";
  }
  return null;
}
