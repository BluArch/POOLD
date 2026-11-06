import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withMarkup,
  feeFor,
  organizerReward,
  BREAK_EVEN_CENTS,
} from "@poold/contracts";

test("money model: 15% markup, 5% fee, reward of max($30, 10%)", () => {
  // The break-even example: $204.15 of groceries.
  const shares = withMarkup(BREAK_EVEN_CENTS);
  assert.equal(shares + feeFor(shares), 24651); // members pay $246.51
  assert.equal(organizerReward(BREAK_EVEN_CENTS), 3000);
  // $30 up to a $300 grocery order, then 10%.
  assert.equal(organizerReward(30000), 3000);
  assert.equal(organizerReward(45000), 4500);
  // No buyers, no reward.
  assert.equal(organizerReward(0), 0);
});
