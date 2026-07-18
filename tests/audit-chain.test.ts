import assert from "node:assert/strict";
import test from "node:test";
import {
  appendDecision,
  listAuditChain,
  sha256Hex,
  verifyChain,
  voteSummary,
} from "../lib/auditChain";
import { guardrail, isRoutineCorridor } from "../lib/guardrail";
import type { AgentVote, Decision, TrustedActionRecord } from "../lib/types";
import { descriptionPolicyHit } from "../lib/policySeeds";

function vote(agent: string, value: AgentVote["vote"], flags: string[] = []): AgentVote {
  return {
    agent,
    vote: value,
    confidence: 0.95,
    reasoning: "test",
    evidence: [],
    flags,
  };
}

function decision(votes: AgentVote[], outcome: Decision["outcome"] = "escalate"): Decision {
  return {
    outcome,
    unanimous: votes.every((v) => v.vote === votes[0].vote),
    votes,
    guardrail: {
      outcome,
      heldBack: false,
      reason: "test",
      rules: ["test_rule"],
    },
    tokens: 100,
    latencyMs: 50,
    malicious: null,
  };
}

test("audit chain links each event to the previous hash", () => {
  const a = appendDecision(decision([vote("a", "reject")], "reject"), { intent: "drainer" });
  const b = appendDecision(decision([vote("a", "escalate")], "escalate"), { intent: "payment" });
  assert.equal(b.prevHash, a.eventHash);
  assert.notEqual(a.eventHash, b.eventHash);
  assert.equal(a.eventHash.length, 64);
  const v = verifyChain(listAuditChain(10));
  assert.equal(v.ok, true);
  assert.ok(v.checked >= 2);
});

test("tampering with a middle event breaks verification", () => {
  appendDecision(decision([vote("a", "execute")], "execute"), { intent: "lunch" });
  const mid = appendDecision(decision([vote("a", "reject")], "reject"), { intent: "scam" });
  appendDecision(decision([vote("a", "escalate")], "escalate"), { intent: "wire" });
  const events = listAuditChain(20).map((e) =>
    e.id === mid.id ? { ...e, outcome: "execute" as const } : e,
  );
  const v = verifyChain(events);
  assert.equal(v.ok, false);
  assert.ok(v.brokenAt != null);
});

test("routine corridor allows low-stakes transfer without authority change", () => {
  const trusted: TrustedActionRecord = {
    kind: "transfer",
    amountUsd: 10,
    counterparties: [],
    mints: [],
    authorityChanges: false,
    reversible: false,
    stakes: "low",
    description: "send 10 USDC for lunch",
    raw: {},
  };
  assert.equal(isRoutineCorridor(trusted), true);
  const g = guardrail(
    [vote("r", "execute"), vote("e", "execute"), vote("c", "execute")],
    trusted,
  );
  assert.equal(g.outcome, "execute");
  assert.ok(g.rules.includes("routine_corridor_allowed"));
});

test("routine corridor does not unlock authority changes", () => {
  const trusted: TrustedActionRecord = {
    kind: "authority_delegation",
    amountUsd: 10,
    counterparties: [],
    mints: [],
    authorityChanges: true,
    reversible: false,
    stakes: "low",
    description: "setAuthority",
    raw: {},
  };
  assert.equal(isRoutineCorridor(trusted), false);
  const g = guardrail([vote("r", "execute"), vote("e", "execute"), vote("c", "execute")], trusted);
  assert.equal(g.outcome, "escalate");
  assert.ok(g.rules.includes("authority_change_held_back"));
});

test("policy pattern hits drainer and rugpull language", () => {
  assert.equal(descriptionPolicyHit("setAuthority to a freshly-funded wallet"), "authority_to_fresh_wallet");
  assert.equal(descriptionPolicyHit("remove 100% of liquidity rugpull"), "rugpull_pattern");
  assert.equal(descriptionPolicyHit("normal transfer to teammate"), null);
});

test("voteSummary is stable", () => {
  const d = decision([vote("risk", "reject"), vote("compliance", "escalate")]);
  assert.equal(voteSummary(d), "risk:reject|compliance:escalate");
  assert.equal(sha256Hex("x").length, 64);
});
