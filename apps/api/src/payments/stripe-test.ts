import Stripe from "stripe";
import { fail } from "../errors.js";
export function stripeTestClient(production: boolean) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (
    production ||
    process.env.PAYMENTS_TEST_MODE !== "true" ||
    !key?.startsWith("sk_test_")
  )
    fail(
      503,
      "PAYMENTS_DISABLED",
      "Stripe sandbox payments are not configured. Live payments are disabled.",
    );
  return new Stripe(key, { apiVersion: "2026-10-28.endive" });
}
export function createTestSetup(
  stripe: Stripe,
  customer: string,
  uid: string,
  version: number,
  returnUrl: string,
) {
  return stripe.checkout.sessions.create(
    {
      mode: "setup",
      customer,
      allowed_payment_method_types: ["card"],
      setup_intent_data: {
        metadata: { member_id: uid, method_version: String(version) },
      },
      success_url: `${returnUrl}?setup=return`,
      cancel_url: `${returnUrl}?setup=cancel`,
    },
    { idempotencyKey: `setup:${uid}:${version}` },
  );
}
