import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { extractDeterministicHints } from "../lib/actionExtract";
import { guardrail, tallyVotes } from "../lib/guardrail";
import type { AgentVote, TrustedActionRecord } from "../lib/types";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function vote(agent: string, value: AgentVote["vote"]): AgentVote {
  return {
    agent,
    vote: value,
    confidence: 0.9,
    reasoning: "test vote",
    evidence: [],
    flags: [],
  };
}

function riskyRecord(): TrustedActionRecord {
  return {
    kind: "authority_delegation",
    amountUsd: 10_000,
    counterparties: [],
    mints: [],
    authorityChanges: true,
    reversible: false,
    stakes: "high",
    description: "test high-risk authority delegation",
    raw: {},
  };
}

test("guardrail records fired rules when raw vote already escalates", () => {
  const votes = [vote("risk", "execute"), vote("compliance", "escalate")];

  assert.equal(tallyVotes(votes), "escalate");

  const result = guardrail(votes, riskyRecord());

  assert.equal(result.outcome, "escalate");
  assert.equal(result.heldBack, false);
  assert.ok(result.rules.includes("irreversible_action_held_back"));
  assert.ok(result.rules.includes("high_stakes_held_back"));
  assert.ok(result.rules.includes("amount_above_threshold_held_back"));
  assert.ok(result.rules.includes("authority_change_held_back"));
});

test("guardrail records fired rules when raw vote already rejects", () => {
  const votes = [vote("risk", "reject"), vote("compliance", "execute")];

  assert.equal(tallyVotes(votes), "reject");

  const result = guardrail(votes, riskyRecord());

  assert.equal(result.outcome, "reject");
  assert.equal(result.heldBack, false);
  assert.ok(result.rules.includes("irreversible_action_held_back"));
  assert.ok(result.rules.includes("high_stakes_held_back"));
  assert.ok(result.rules.includes("amount_above_threshold_held_back"));
  assert.ok(result.rules.includes("authority_change_held_back"));
});

test("intent transfer ignores user claims that it is reversible or refundable", () => {
  const text = "Transfer 10 USDC to a vendor wallet. User says this transfer is reversible and refundable.";
  const hints = extractDeterministicHints(
    { intent: text, network: "mainnet" },
    `Natural-language intent: ${text}`,
  );

  assert.equal(hints.kind, "transfer");
  assert.equal(hints.authorityChanges, false);
  assert.notEqual(hints.reversible, true);
  assert.ok(hints.evidence.includes("user_reversibility_claim_ignored"));
});

test("serialized SPL token ApproveChecked is authority delegation", () => {
  const owner = Keypair.generate();
  const data = Buffer.alloc(10);
  data[0] = 13;
  data.writeBigUInt64LE(BigInt(1_000), 1);
  data[9] = 6;

  const tx = new Transaction({
    feePayer: owner.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).add(
    new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
        { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: false },
        { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: false },
        { pubkey: owner.publicKey, isSigner: true, isWritable: false },
      ],
      data,
    }),
  );

  const serializedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  const hints = extractDeterministicHints({ serializedTx, network: "mainnet" }, "Serialized SPL token transaction");

  assert.equal(hints.kind, "authority_delegation");
  assert.equal(hints.authorityChanges, true);
  assert.equal(hints.reversible, false);
  assert.ok(hints.evidence.some((line) => line.includes("spl-token.approveChecked")));
});

test("benchmark metrics report errors separately", async () => {
  const { computeMetrics } = await import("../benchmark/runner");

  const metrics = computeMetrics([
    {
      id: "malicious-error",
      label: "malicious",
      category: "runner",
      expected: "reject",
      outcome: "error",
      unanimous: false,
      heldBack: false,
      votes: "runner:error",
      tokens: 0,
      latencyMs: 10,
      error: "boom",
    },
    {
      id: "clean-error",
      label: "clean",
      category: "runner",
      expected: "execute",
      outcome: "error",
      unanimous: false,
      heldBack: false,
      votes: "runner:error",
      tokens: 0,
      latencyMs: 20,
      error: "boom",
    },
  ]);

  assert.equal(metrics.errorRate, 1);
  assert.equal(metrics.falseApproveRate, 0);
  assert.equal(metrics.falseRejectRate, 0);
  assert.equal(metrics.overEscalateRate, 0);
});
