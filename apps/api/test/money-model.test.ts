import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withMarkup,
  feeFor,
  organizerReward,
  BREAK_EVEN_CENTS,
} from "@poold/contracts";

test("money model: 15% markup, 5% fee, reward of max($50, 10%)", () => {
  // The break-even example: $333.05 of groceries.
  const shares = withMarkup(BREAK_EVEN_CENTS);
  assert.equal(shares + feeFor(shares), 40216); // members pay $402.16
  assert.equal(organizerReward(BREAK_EVEN_CENTS), 5000);
  // $50 up to a $500 grocery order, then 10%.
  assert.equal(organizerReward(30000), 5000);
  assert.equal(organizerReward(45000), 5000);
  assert.equal(organizerReward(50001), 5000);
  assert.equal(organizerReward(50005), 5001);
  assert.equal(organizerReward(100000), 10000);
  // No buyers, no reward.
  assert.equal(organizerReward(0), 0);
});
