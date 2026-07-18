import assert from "node:assert/strict";
import test from "node:test";
import { acquireCouncilSlot, checkCouncilAccess, councilGateStatus } from "../lib/councilGate";

function fakeRequest(overrides: Record<string, string> = {}): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(overrides)) headers.set(k, v);
  return new Request("http://localhost/api/actions", { headers });
}

test("acquireCouncilSlot caps concurrent runs and frees on release", () => {
  const a = acquireCouncilSlot();
  const b = acquireCouncilSlot();
  const c = acquireCouncilSlot();
  assert.ok(a && b && c, "three slots should be available by default");
  const d = acquireCouncilSlot();
  assert.equal(d, null, "fourth acquire should be rejected when at the cap");
  c!(); // release one
  const e = acquireCouncilSlot();
  assert.ok(e, "slot should be available after a release");
  e!();
  a!();
  b!();
});

test("checkCouncilAccess allows without token when none configured", () => {
  const res = checkCouncilAccess(fakeRequest());
  assert.equal(res.ok, true);
});

test("checkCouncilAccess enforces bearer token when configured", () => {
  const saved = process.env.COUNCIL_API_TOKEN;
  process.env.COUNCIL_API_TOKEN = "secret-token";
  try {
    const noAuth = checkCouncilAccess(fakeRequest());
    assert.equal(noAuth.ok, false);
    assert.equal(noAuth.status, 401);
    const withAuth = checkCouncilAccess(fakeRequest({ authorization: "Bearer secret-token" }));
    assert.equal(withAuth.ok, true);
    const withHeader = checkCouncilAccess(fakeRequest({ "x-council-token": "secret-token" }));
    assert.equal(withHeader.ok, true);
  } finally {
    if (saved === undefined) delete process.env.COUNCIL_API_TOKEN;
    else process.env.COUNCIL_API_TOKEN = saved;
  }
});

test("councilGateStatus reports configured cap", () => {
  const status = councilGateStatus();
  assert.equal(typeof status.active, "number");
  assert.equal(typeof status.max, "number");
  assert.ok(status.max >= 1);
});
