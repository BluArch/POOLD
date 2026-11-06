import test from "node:test";
import assert from "node:assert/strict";
import {
  allocate,
  priceGroup,
  PILOT_POLICY,
  rewardFor,
  payoutCost,
  frozenRewardFor,
} from "../src/payments/fee-engine.js";
test("fixed 15% goods markup then 5% service fee funds two payouts and one completion reward", () => {
  const p = priceGroup(
    ["a", "b", "c", "d"].map((memberId) => ({ memberId, groceryCents: 10000 })),
  );
  assert.equal(p.budgetCents, 40000);
  assert.equal(p.markupCents, 6000);
  assert.equal(p.serviceFeeCents, 2300);
  assert.equal(
    p.members.reduce((n, m) => n + m.totalCents, 0),
    48300,
  );
  assert.equal(p.organizerCents, 5000);
  assert.equal(p.payoutCents, 40000);
  assert.equal(p.groceryPayoutCostCents, payoutCost(40000));
  assert.equal(p.rewardPayoutCostCents, payoutCost(5000));
  assert.ok(p.formationMet);
  assert.ok(!("operatingCents" in PILOT_POLICY));
  assert.ok(!("monthlyAccountCents" in PILOT_POLICY));
});
test("small runs are blocked without increasing the fixed rates; viability uses actual card count", () => {
  const low = priceGroup(
    ["a", "b", "c", "d"].map((memberId) => ({ memberId, groceryCents: 5000 })),
  );
  assert.equal(
    low.members.reduce((n, m) => n + m.totalCents, 0),
    24150,
  );
  assert.equal(low.formationMet, false);
  assert.equal(
    priceGroup(
      ["a", "b", "c", "d"].map((memberId) => ({
        memberId,
        groceryCents: 7500,
      })),
    ).formationMet,
    false,
  );
  const one = priceGroup([{ memberId: "a", groceryCents: 30000 }]);
  const many = priceGroup(
    Array.from({ length: 20 }, (_, i) => ({
      memberId: String(i),
      groceryCents: 1500,
    })),
  );
  assert.equal(one.markupCents, many.markupCents);
  assert.equal(one.serviceFeeCents, many.serviceFeeCents);
  assert.ok(many.processingCents > one.processingCents);
});
test("reward boundaries and deterministic proportional penny allocation", () => {
  assert.equal(rewardFor(0), 0);
  assert.equal(rewardFor(29999), 5000);
  assert.equal(rewardFor(49999), 5000);
  assert.equal(rewardFor(50000), 5000);
  assert.equal(rewardFor(50001), 5000);
  assert.equal(rewardFor(50005), 5001);
  assert.equal(rewardFor(100000), 10000);
  assert.equal(
    frozenRewardFor(40000, { policyVersion: "cad-15-5-completion-v3" }),
    4000,
  );
  assert.equal(
    frozenRewardFor(20000, { policyVersion: "cad-15-5-completion-v3" }),
    3000,
  );
  assert.equal(
    frozenRewardFor(40000, {
      policyVersion: PILOT_POLICY.version,
      rewardMinimumCents: 5000,
    }),
    5000,
  );
  assert.deepEqual(
    [
      ...allocate(5, [
        { memberId: "z", groceryCents: 1 },
        { memberId: "a", groceryCents: 1 },
        { memberId: "m", groceryCents: 1 },
      ]),
    ].sort(),
    [
      ["a", 2],
      ["m", 2],
      ["z", 1],
    ],
  );
  const p = priceGroup([
    { memberId: "a", groceryCents: 5001 },
    { memberId: "b", groceryCents: 24999 },
  ]);
  assert.equal(
    p.members.reduce((n, m) => n + m.markupCents, 0),
    p.markupCents,
  );
  assert.equal(
    p.members.reduce((n, m) => n + m.serviceFeeCents, 0),
    p.serviceFeeCents,
  );
});
test("bounded cents and taxes on full charges", () => {
  assert.throws(() => priceGroup([]));
  assert.throws(() => priceGroup([{ memberId: "a", groceryCents: 100000001 }]));
  assert.throws(() =>
    priceGroup([
      { memberId: "a", groceryCents: 1 },
      { memberId: "a", groceryCents: 1 },
    ]),
  );
  const p = priceGroup([{ memberId: "a", groceryCents: 30000 }], {
    ...PILOT_POLICY,
    feeTaxBps: 500,
  });
  const m = p.members[0];
  assert.equal(
    m.totalCents,
    m.groceryCents + m.markupCents + m.serviceFeeCents + m.feeTaxCents,
  );
  assert.ok(m.feeTaxCents > 0);
});
