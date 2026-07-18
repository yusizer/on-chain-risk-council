/**
 * lib/actionExtract.ts — deterministic action hints for the guardrail.
 *
 * Intake still asks Qwen to produce a clean structured record, but these hints
 * are derived by code from intent text, Helius evidence, or serialized Solana
 * transaction bytes. They override the risky fields that the guardrail cares
 * about: authority changes, reversibility, stakes, amount and counterparties.
 */
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { ActionInput, ActionKind, Stakes } from "@/lib/types";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPwJcJw9V88Ne4iWhqYB7",
]);
const SOL_USD_ESTIMATE = Number(process.env.SOL_USD_ESTIMATE ?? 150);
const BASE58_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

export interface DeterministicActionHints {
  kind?: ActionKind;
  amountUsd?: number | null;
  counterparties?: string[];
  mints?: string[];
  authorityChanges?: boolean;
  reversible?: boolean;
  stakes?: Stakes;
  description?: string;
  evidence: string[];
  raw: Record<string, unknown>;
}

interface InstructionMeta {
  kind?: ActionKind;
  name: string;
  authorityChanges: boolean;
  amountUsd?: number | null;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function safePubkey(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

function parseTextAmountUsd(text: string): number | null {
  const usd = text.match(/(?:\$|usd\s*)(\d+(?:[,.]\d{3})*(?:\.\d+)?)(\s*[kKmM])?/);
  if (usd) {
    const n = Number(usd[1].replace(/,/g, ""));
    const suffix = usd[2]?.trim().toLowerCase();
    if (Number.isFinite(n)) return suffix === "m" ? n * 1_000_000 : suffix === "k" ? n * 1_000 : n;
  }
  const stable = text.match(/(\d+(?:[,.]\d{3})*(?:\.\d+)?)\s*(usdc|usdt)\b/i);
  if (stable) {
    const n = Number(stable[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  const sol = text.match(/(\d+(?:[,.]\d{3})*(?:\.\d+)?)\s*sol\b/i);
  if (sol) {
    const n = Number(sol[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return n * SOL_USD_ESTIMATE;
  }
  return null;
}

export function deriveStakes(kind: ActionKind | string, amountUsd: number | null): Stakes {
  if (["authority_delegation", "close_account", "burn"].includes(kind)) return "high";
  if (kind === "stake") return "medium"; // non-custodial regardless of amount
  if (kind === "mint") return "low"; // token creation is not value transfer
  if (amountUsd == null) return "medium";
  if (amountUsd >= 5000) return "high";
  if (amountUsd >= 500) return "medium";
  return "low";
}

function kindFromText(lower: string): ActionKind | undefined {
  if (/revoke\s+(?:(?:an\s+)?(?:existing\s+)?|the\s+)delegate|revoke\s+(?:the\s+)?approve|remove\s+delegate/.test(lower)) {
    return "config";
  }
  if (/set\s*authority|setauthority|approve\s+(?:a\s+)?delegate|delegate\s+for|max(?:imum)?\s+approve|mint-authority|freeze-authority|owner\s+change|upgrade\s+authority/.test(lower)) {
    return "authority_delegation";
  }
  if (/close\s+account|close-authority/.test(lower)) return "close_account";
  if (/\bburn\b/.test(lower)) return "burn";
  if (/\bmint\b|mint\s+to/.test(lower)) return "mint";
  if (/\bstake\b|delegate\s+stake/.test(lower)) return "stake";
  if (/\bswap\b|dex|amm/.test(lower)) return "swap";
  if (/\btransfer\b|\bsend\b|\bpayment\b|\bpay\b/.test(lower)) return "transfer";
  if (/config|parameter|admin/.test(lower)) return "config";
  return undefined;
}

function extractTextHints(text: string): DeterministicActionHints {
  const lower = text.toLowerCase();
  const kind = kindFromText(lower);
  const amountUsd = parseTextAmountUsd(text);
  const authorityChanges = kind === "authority_delegation" || /set\s*authority|setauthority|approve\s+(?:a\s+)?delegate|mint-authority|freeze-authority|owner\s+change|upgrade\s+authority/.test(lower);
  const counterparties = uniq((text.match(BASE58_RE) ?? []).map((v) => safePubkey(v)).filter((v): v is string => v !== null));
  const mints = uniq([...text.matchAll(/mint\s+([1-9A-HJ-NP-Za-km-z]{32,44}|[A-Z0-9]{2,12})/gi)].map((m) => m[1]));
  // Guardrail-critical reversibility is derived from TRUSTED structure, never
  // from free-text user claims. A user may say "this is reversible/refundable"
  // to social-engineer an approve — that claim is ignored. Reversibility is only
  // asserted true for action kinds that are genuinely undoable on Solana
  // (revoke a delegate, create a token account that can later be closed).
  // Everything else (transfer/swap/stake/mint/burn/close/serialized tx) is
  // treated as irreversible, so the guardrail holds it back by default.
  const textClaimsReversible = /reversible|refundable|can\s+be\s+undone|escrow\s+refund/.test(lower);
  const irreversibleClaim = /irreversible|cannot\s+be\s+undone|can't\s+be\s+undone|once\s+signed|permanent/.test(lower);
  const reversibleKind = /revoke\s+(?:(?:an\s+)?(?:existing\s+)?|the\s+)delegate|remove\s+delegate|create\s+(?:a\s+)?(?:new\s+)?(?:spl\s+)?token\s+account|create\s+associated/i.test(lower);
  let reversible: boolean | undefined;
  if (irreversibleClaim) reversible = false;
  else if (reversibleKind) reversible = true;
  else reversible = undefined;
  const description = text.replace(/^(?:Natural-language intent|Action evidence):\s*/i, "").slice(0, 300);
  const evidence = [
    `deterministic_text kind=${kind ?? "unknown"}`,
    `authorityChanges=${authorityChanges}`,
    `amountUsd=${amountUsd ?? "unknown"}`,
    `counterparties=${counterparties.length}`,
    `reversible=${reversible ?? "unknown"}`,
    ...(textClaimsReversible && !reversibleKind ? ["user_reversibility_claim_ignored"] : []),
  ];

  return {
    kind,
    amountUsd,
    counterparties,
    mints,
    authorityChanges,
    reversible,
    description,
    stakes: deriveStakes(kind ?? "unknown", amountUsd),
    evidence,
    raw: { deterministicText: { kind, amountUsd, authorityChanges, counterparties, mints, textClaimsReversible } },
  };
}

function ixName(programId: string, data: Buffer): InstructionMeta {
  if (programId === SYSTEM_PROGRAM && data.length >= 12 && data.readUInt32LE(0) === 2) {
    const lamports = Number(data.readBigUInt64LE(4));
    const sol = lamports / 1_000_000_000;
    return { kind: "transfer", name: `system.transfer ${sol} SOL`, authorityChanges: false, amountUsd: sol * SOL_USD_ESTIMATE };
  }
  if (TOKEN_PROGRAMS.has(programId)) {
    const opcode = data[0];
    if (opcode === 3) return { kind: "transfer", name: "spl-token.transfer", authorityChanges: false };
    if (opcode === 4) return { kind: "authority_delegation", name: "spl-token.approve", authorityChanges: true };
    if (opcode === 5) return { kind: "config", name: "spl-token.revoke", authorityChanges: false };
    if (opcode === 6) return { kind: "authority_delegation", name: "spl-token.setAuthority", authorityChanges: true };
    if (opcode === 7) return { kind: "mint", name: "spl-token.mintTo", authorityChanges: false };
    if (opcode === 8) return { kind: "burn", name: "spl-token.burn", authorityChanges: false };
    if (opcode === 9) return { kind: "close_account", name: "spl-token.closeAccount", authorityChanges: false };
    if (opcode === 10) return { kind: "config", name: "spl-token.freezeAccount", authorityChanges: true };
    if (opcode === 11) return { kind: "config", name: "spl-token.thawAccount", authorityChanges: false };
    if (opcode === 12) return { kind: "transfer", name: "spl-token.transferChecked", authorityChanges: false };
    if (opcode === 13) return { kind: "authority_delegation", name: "spl-token.approveChecked", authorityChanges: true };
    if (opcode === 14) return { kind: "mint", name: "spl-token.mintToChecked", authorityChanges: false };
    if (opcode === 15) return { kind: "burn", name: "spl-token.burnChecked", authorityChanges: false };
    if (opcode >= 25) return { kind: "config", name: `spl-token.extension.${opcode}`, authorityChanges: true };
    return { name: `spl-token.opcode.${opcode ?? "unknown"}`, authorityChanges: false };
  }
  return { name: `program.${programId}`, authorityChanges: false };
}

function parseSerializedTx(serializedTx: string): DeterministicActionHints {
  const bytes = Buffer.from(serializedTx, "base64");
  const instructionSummaries: string[] = [];
  const counterparties: string[] = [];
  const programIds: string[] = [];
  let authorityChanges = false;
  let kind: ActionKind | undefined;
  let amountUsd: number | null = null;
  let unresolvedAddressLookups = false;

  try {
    const tx = Transaction.from(bytes);
    for (const ix of tx.instructions) {
      const programId = ix.programId.toBase58();
      programIds.push(programId);
      const meta = ixName(programId, Buffer.from(ix.data));
      instructionSummaries.push(meta.name);
      if (meta.kind) kind = meta.kind;
      if (meta.authorityChanges) authorityChanges = true;
      if (meta.amountUsd != null) amountUsd = Math.max(amountUsd ?? 0, meta.amountUsd);
      counterparties.push(...ix.keys.map((k) => k.pubkey.toBase58()));
    }
  } catch {
    const tx = VersionedTransaction.deserialize(bytes);
    const staticKeys = tx.message.staticAccountKeys.map((k) => k.toBase58());
    unresolvedAddressLookups = tx.message.addressTableLookups.length > 0;
    for (const ix of tx.message.compiledInstructions) {
      const programId = staticKeys[ix.programIdIndex] ?? "unknown";
      programIds.push(programId);
      const meta = ixName(programId, Buffer.from(ix.data));
      instructionSummaries.push(meta.name);
      if (meta.kind) kind = meta.kind;
      if (meta.authorityChanges) authorityChanges = true;
      if (meta.amountUsd != null) amountUsd = Math.max(amountUsd ?? 0, meta.amountUsd);
      counterparties.push(...ix.accountKeyIndexes.map((i) => staticKeys[i]).filter((v): v is string => !!v));
    }
  }

  if (unresolvedAddressLookups) {
    authorityChanges = true;
    kind = kind ?? "unknown";
  }

  const evidence = [
    `deterministic_serialized programs=${uniq(programIds).join(",") || "unknown"}`,
    `instructions=${instructionSummaries.join(" | ") || "none"}`,
    `authorityChanges=${authorityChanges}`,
    `amountUsd=${amountUsd ?? "unknown"}`,
    ...(unresolvedAddressLookups ? ["unresolved_address_lookup_tables=true"] : []),
  ];
  return {
    kind,
    amountUsd,
    counterparties: uniq(counterparties).slice(0, 20),
    mints: [],
    authorityChanges,
    reversible: false,
    stakes: deriveStakes(kind ?? "unknown", amountUsd),
    description: `Serialized Solana tx: ${instructionSummaries.join("; ") || "unknown instructions"}`,
    evidence,
    raw: { deterministicSerialized: { programIds: uniq(programIds), instructionSummaries, unresolvedAddressLookups } },
  };
}

export function extractDeterministicHints(input: ActionInput, evidence: string): DeterministicActionHints {
  if (input.serializedTx) {
    try {
      const parsed = parseSerializedTx(input.serializedTx);
      const text = extractTextHints(evidence);
      return mergeHints(text, parsed);
    } catch (e) {
      const text = extractTextHints(evidence);
      return { ...text, evidence: [...text.evidence, `serialized_parse_error=${String(e).slice(0, 120)}`] };
    }
  }
  return extractTextHints(evidence);
}

export function mergeHints(...hints: DeterministicActionHints[]): DeterministicActionHints {
  const evidence = hints.flatMap((h) => h.evidence);
  const amountUsd = hints.reduce<number | null>((max, h) => (h.amountUsd == null ? max : Math.max(max ?? 0, h.amountUsd)), null);
  const kind = hints.find((h) => h.authorityChanges)?.kind ?? hints.find((h) => h.kind)?.kind;
  const authorityChanges = hints.some((h) => h.authorityChanges === true);
  const reversible = hints.some((h) => h.reversible === false) ? false : hints.find((h) => h.reversible === true)?.reversible;
  const stakes = deriveStakes(kind ?? "unknown", amountUsd);
  return {
    kind,
    amountUsd,
    counterparties: uniq(hints.flatMap((h) => h.counterparties ?? [])),
    mints: uniq(hints.flatMap((h) => h.mints ?? [])),
    authorityChanges,
    reversible,
    stakes,
    description: hints.find((h) => h.description)?.description,
    evidence,
    raw: Object.assign({}, ...hints.map((h) => h.raw)),
  };
}
