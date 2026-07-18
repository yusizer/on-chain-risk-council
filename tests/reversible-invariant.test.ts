import assert from "node:assert/strict";
import test from "node:test";
import { extractDeterministicHints, mergeHints } from "../lib/actionExtract";
import type { ActionInput } from "../lib/types";

function hintsFor(intent: string) {
  const input: ActionInput = { intent, network: "mainnet" };
  return extractDeterministicHints(input, `Natural-language intent: ${intent}`);
}

test("reversible user claim is ignored — never trusts LLM-supplied reversibility", () => {
  const h = hintsFor("Transfer 10 USDC to a vendor. This transfer is reversible and refundable.");
  assert.notEqual(h.reversible, true);
  assert.ok(h.evidence.includes("user_reversibility_claim_ignored"));
});

test("revoke delegate is deterministically reversible (approve path)", () => {
  const h = hintsFor("revoke an existing delegate approval on your USDC token account");
  assert.equal(h.kind, "config");
  assert.equal(h.reversible, true);
});

test("create SPL token account is deterministically reversible (approve path)", () => {
  const h = hintsFor("create a new SPL token account for the USDC mint owned by your wallet");
  assert.equal(h.reversible, true);
});

test("transfer is irreversible by default", () => {
  const h = hintsFor("transfer 2 SOL to a known Binance deposit address");
  assert.notEqual(h.reversible, true);
});

test("mergeHints never upgrades reversibility to true from a non-reversible source", () => {
  const claim = hintsFor("Send 5 USDC, this is reversible and refundable.");
  const merged = mergeHints(claim);
  assert.notEqual(merged.reversible, true);
});

test("mergeHints keeps reversible=true when a trusted reversible kind is present", () => {
  const revoke = hintsFor("revoke an existing delegate approval on your USDC token account");
  const merged = mergeHints(revoke, hintsFor("transfer 1 SOL to a friend"));
  assert.equal(merged.reversible, true);
});
