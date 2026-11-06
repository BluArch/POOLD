/** Current CAD policy. Both adapters use this calculation; live money is disabled. */
export const PILOT_POLICY = Object.freeze({
  version: "cad-15-5-completion-v4",
  currency: "cad",
  markupBps: 1500,
  serviceFeeBps: 500,
  rewardMinimumCents: 5000,
  rewardBps: 1000,
  cardPercentBps: 290,
  cardFixedCents: 30,
  payoutPercentBps: 150,
  payoutFixedCents: 25,
  feeTaxBps: 0,
});
export type FeePolicy = typeof PILOT_POLICY;
export type Basket = { memberId: string; groceryCents: number };
export type Components = {
  groceryCents: number;
  markupCents: number;
  serviceFeeCents: number;
  feeTaxCents: number;
  totalCents: number;
};
export type MemberPrice = Basket & Components & { processingCents: number };
export function cents(n: number) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 100_000_000)
    throw new Error("Money must be bounded nonnegative integer cents.");
  return n;
}
export const halfUp = (n: number, bps: number) =>
  Number((BigInt(cents(n)) * BigInt(bps) + 5000n) / 10000n);
export const providerPercent = (n: number, bps: number) =>
  Number((BigInt(cents(n)) * BigInt(bps) + 9999n) / 10000n);
export function allocate(
  amount: number,
  baskets: Basket[],
): Map<string, number> {
  cents(amount);
  const total = baskets.reduce((n, b) => n + cents(b.groceryCents), 0);
  if (
    !total ||
    total > 100_000_000 ||
    new Set(baskets.map((b) => b.memberId)).size !== baskets.length
  )
    throw new Error(
      "Allocation needs distinct payers and a positive bounded budget.",
    );
  const quotas = baskets.map((b) => ({
    id: b.memberId,
    base: Number((BigInt(amount) * BigInt(b.groceryCents)) / BigInt(total)),
    remainder: (BigInt(amount) * BigInt(b.groceryCents)) % BigInt(total),
  }));
  let remainder = amount - quotas.reduce((n, q) => n + q.base, 0);
  quotas.sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const q of quotas) if (remainder-- > 0) q.base++;
  return new Map(quotas.map((q) => [q.id, q.base]));
}
export function payoutCost(amount: number, policy: FeePolicy = PILOT_POLICY) {
  return amount
    ? providerPercent(amount, policy.payoutPercentBps) + policy.payoutFixedCents
    : 0;
}
export function rewardFor(grocery: number, policy: FeePolicy = PILOT_POLICY) {
  return grocery
    ? Math.max(policy.rewardMinimumCents, halfUp(grocery, policy.rewardBps))
    : 0;
}
/** Preserve the policy of already-frozen runs; only new quotes use the new floor. */
export function frozenRewardMinimum(
  pricing:
    { policyVersion?: string; rewardMinimumCents?: number } | null | undefined,
) {
  return (
    pricing?.rewardMinimumCents ??
    (pricing?.policyVersion === "cad-15-5-completion-v3"
      ? 3000
      : PILOT_POLICY.rewardMinimumCents)
  );
}
export function frozenRewardFor(
  grocery: number,
  pricing:
    { policyVersion?: string; rewardMinimumCents?: number } | null | undefined,
) {
  return grocery
    ? Math.max(
        frozenRewardMinimum(pricing),
        halfUp(grocery, PILOT_POLICY.rewardBps),
      )
    : 0;
}
export function priceGroup(
  baskets: Basket[],
  policy: FeePolicy = PILOT_POLICY,
) {
  if (new Set(baskets.map((b) => b.memberId)).size !== baskets.length)
    throw new Error("Member IDs must be unique.");
  const payers = baskets.filter((b) => cents(b.groceryCents) > 0);
  const budgetCents = cents(payers.reduce((n, b) => n + b.groceryCents, 0));
  if (!budgetCents)
    throw new Error("Group needs a positive purchasing budget.");
  const markupCents = halfUp(budgetCents, policy.markupBps);
  const markups = allocate(markupCents, payers);
  const serviceFeeCents = halfUp(
    budgetCents + markupCents,
    policy.serviceFeeBps,
  );
  const fees = allocate(
    serviceFeeCents,
    payers.map((b) => ({
      memberId: b.memberId,
      groceryCents: b.groceryCents + markups.get(b.memberId)!,
    })),
  );
  const members: MemberPrice[] = payers.map((b) => {
    const markup = markups.get(b.memberId)!,
      fee = fees.get(b.memberId)!;
    const feeTaxCents = halfUp(fee, policy.feeTaxBps),
      totalCents = cents(b.groceryCents + markup + fee + feeTaxCents);
    return {
      ...b,
      markupCents: markup,
      serviceFeeCents: fee,
      feeTaxCents,
      totalCents,
      processingCents:
        providerPercent(totalCents, policy.cardPercentBps) +
        policy.cardFixedCents,
    };
  });
  const organizerCents = rewardFor(budgetCents, policy),
    groceryPayoutCostCents = payoutCost(budgetCents, policy),
    rewardPayoutCostCents = payoutCost(organizerCents, policy);
  const processingCents = members.reduce((n, m) => n + m.processingCents, 0);
  const remainderCents =
    markupCents +
    serviceFeeCents -
    organizerCents -
    processingCents -
    groceryPayoutCostCents -
    rewardPayoutCostCents;
  return {
    policyVersion: policy.version,
    rewardMinimumCents: policy.rewardMinimumCents,
    currency: policy.currency,
    budgetCents,
    markupCents,
    serviceFeeCents,
    organizerCents,
    payoutCents: budgetCents,
    groceryPayoutCostCents,
    rewardPayoutCostCents,
    processingCents,
    remainderCents,
    formationMet: remainderCents >= 0,
    members,
  };
}
