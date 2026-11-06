import type Stripe from "stripe";
import type { Pool } from "mysql2/promise";
import { first } from "../db.js";
import { json, fingerprint } from "./engine.js";
import { stripeTestClient } from "./stripe-test.js";
export type ProviderResult = Record<string, any>;
export interface PaymentProvider {
  perform(operation: any): Promise<ProviderResult>;
}
export function paymentProvider(
  db: Pool,
  provider: string,
  production: boolean,
): PaymentProvider {
  if (provider === "demo")
    return {
      async perform(op) {
        const req = json(op.request),
          key = fingerprint(op.operation_key).slice(0, 28);
        if (op.kind === "charge") {
          const card = await first(
            db,
            "SELECT * FROM payment_methods WHERE user_id=?",
            [req.method.user_id],
          );
          return {
            id: `demo_pi_${op.owner_id}`,
            status:
              card?.outcome === "ok" ? "succeeded" : "requires_payment_method",
            amount: req.amount,
            currency: "cad",
            instructionId: op.owner_id,
            chargeId: `demo_ch_${op.owner_id}`,
            feeCents: 0,
            customer: req.method.customer_id ?? null,
            method: req.method.method_id ?? null,
          };
        }
        if (op.kind === "cancel")
          return { id: req.providerId, status: "canceled" };
        if (op.kind === "refund")
          return {
            id: `demo_re_${key}`,
            status: "succeeded",
            amount: req.amount,
          };
        if (op.kind === "transfer")
          return {
            id: `demo_tr_${key}`,
            status: "succeeded",
            amount: req.amount,
            available: true,
          };
        if (op.kind === "payout")
          return { id: `demo_po_${key}`, status: "paid", amount: req.amount };
        return {
          id: `demo_reverse_${key}`,
          status: "succeeded",
          amount: req.amount,
        };
      },
    };
  const stripe = stripeTestClient(production);
  return stripeProvider(stripe);
}
export function stripeProvider(stripe: Stripe): PaymentProvider {
  const describe = async (p: Stripe.PaymentIntent) => {
    let feeCents: number | undefined;
    const chargeId =
      typeof p.latest_charge === "string"
        ? p.latest_charge
        : p.latest_charge?.id;
    if (p.status === "succeeded" && chargeId) {
      const charge = await stripe.charges.retrieve(chargeId, {
        expand: ["balance_transaction"],
      });
      if (
        typeof charge.balance_transaction === "object" &&
        charge.balance_transaction
      )
        feeCents = charge.balance_transaction.fee;
    }
    return {
      id: p.id,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      instructionId: p.metadata.instruction_id,
      chargeId:
        typeof p.latest_charge === "string"
          ? p.latest_charge
          : (p.latest_charge?.id ?? null),
      customer:
        typeof p.customer === "string" ? p.customer : (p.customer?.id ?? null),
      method:
        typeof p.payment_method === "string"
          ? p.payment_method
          : (p.payment_method?.id ?? null),
      clientSecret: p.client_secret,
      feeCents,
    };
  };
  return {
    async perform(op) {
      const r = json(op.request),
        options = { idempotencyKey: op.operation_key };
      if (op.kind === "charge" && !r.providerId && op.provider_id)
        r.providerId = op.provider_id;
      if (op.kind === "charge") {
        if (r.providerId) {
          const existing = await stripe.paymentIntents.retrieve(r.providerId);
          if (
            ["succeeded", "processing", "canceled"].includes(existing.status) ||
            (existing.status === "requires_action" &&
              existing.payment_method === r.method.method_id)
          )
            return describe(existing);
        }
        try {
          const intent = r.providerId
            ? await stripe.paymentIntents.confirm(
                r.providerId,
                { payment_method: r.method.method_id, off_session: true },
                options,
              )
            : await stripe.paymentIntents.create(
                {
                  amount: r.amount,
                  currency: "cad",
                  customer: r.method.customer_id,
                  payment_method: r.method.method_id,
                  confirm: true,
                  off_session: true,
                  capture_method: "automatic",
                  allowed_payment_method_types: ["card"],
                  transfer_group: `poold_${op.order_id}`,
                  metadata: {
                    instruction_id: op.owner_id,
                    order_id: op.order_id,
                    member_id: r.method.user_id,
                  },
                },
                options,
              );
          return describe(intent);
        } catch (error) {
          const e = error as Stripe.errors.StripeCardError;
          if (e.payment_intent)
            return describe(e.payment_intent as Stripe.PaymentIntent);
          throw error;
        }
      }
      if (op.kind === "cancel") {
        const intent = await stripe.paymentIntents.retrieve(r.providerId);
        if (["succeeded", "processing"].includes(intent.status))
          return describe(intent);
        if (intent.status === "canceled") return describe(intent);
        return describe(
          await stripe.paymentIntents.cancel(intent.id, {}, options),
        );
      }
      if (op.kind === "refund") {
        const existing = op.provider_id
          ? await stripe.refunds.retrieve(op.provider_id)
          : await stripe.refunds.create(
              {
                payment_intent: r.providerId,
                amount: r.amount,
                metadata: { instruction_id: op.owner_id },
              },
              options,
            );
        return {
          id: existing.id,
          status: existing.status,
          amount: existing.amount,
        };
      }
      if (op.kind === "transfer") {
        const t = op.provider_id
          ? await stripe.transfers.retrieve(op.provider_id)
          : await stripe.transfers.create(
              {
                amount: r.amount,
                currency: "cad",
                destination: r.account,
                source_transaction: r.chargeId,
                transfer_group: `poold_${op.order_id}`,
                metadata: { order_id: op.order_id, purpose: r.purpose },
              },
              options,
            );
        let available = false;
        const charge =
          typeof t.destination_payment === "string"
            ? t.destination_payment
            : t.destination_payment?.id;
        if (charge) {
          const c = await stripe.charges.retrieve(
            charge,
            { expand: ["balance_transaction"] },
            { stripeAccount: r.account },
          );
          available =
            typeof c.balance_transaction === "object" &&
            c.balance_transaction?.status === "available";
        }
        return { id: t.id, status: "succeeded", amount: t.amount, available };
      }
      if (op.kind === "payout") {
        if (op.provider_id) {
          const p = await stripe.payouts.retrieve(
            op.provider_id,
            {},
            { stripeAccount: r.account },
          );
          return { id: p.id, status: p.status, amount: p.amount };
        }
        const account = await stripe.accounts.retrieve(r.account);
        if (!account.payouts_enabled)
          throw new Error("Connected account payouts are not enabled.");
        const balance = await stripe.balance.retrieve(
          {},
          { stripeAccount: r.account },
        );
        const instant = balance.instant_available?.find(
          (b) => b.currency === "cad",
        );
        const destination = account.external_accounts?.data.find(
          (a) =>
            a.id === r.destination &&
            a.available_payout_methods?.includes("instant"),
        );
        if (!destination || !instant || instant.amount < r.amount + r.cost)
          throw new Error("Instant funds or destination are not yet eligible.");
        const p = await stripe.payouts.create(
          {
            amount: r.amount,
            currency: "cad",
            method: "instant",
            destination: r.destination,
            metadata: { order_id: op.order_id, purpose: r.purpose },
          },
          { ...options, stripeAccount: r.account },
        );
        return { id: p.id, status: p.status, amount: p.amount };
      }
      if (op.kind === "reversal") {
        const reverse = await stripe.transfers.createReversal(
          r.transferId,
          { amount: r.amount },
          options,
        );
        return { id: reverse.id, status: "succeeded", amount: reverse.amount };
      }
      throw new Error("Unknown financial operation.");
    },
  };
}
