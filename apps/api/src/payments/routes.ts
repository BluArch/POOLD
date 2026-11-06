import {
  proposeSupplement,
  supplementQuotes,
  approveSupplement,
  cancelSupplement,
} from "./supplements.js";
import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { verified } from "../auth.js";
import { getOrder, owner } from "../order-model.js";
import { fail } from "../errors.js";
import { rows, first, execute, transaction } from "../db.js";
import { hash, token } from "../security.js";
import {
  quoteFor,
  approveBasket,
  invalidateApprovals,
  profile,
  json,
  fingerprint,
  retryPayment,
  claimTakeover,
  offerComponents,
  RETRY_LIMIT,
} from "./engine.js";
import { runPaymentReconciliation } from "./reconcile.js";
import { createTestSetup, stripeTestClient } from "./stripe-test.js";
import { PILOT_POLICY } from "./fee-engine.js";
export function paymentRoutes(db: Pool, production = false) {
  const r = Router(),
    agreed = z.object({
      fingerprint: z.string().length(64),
      amountCents: z.number().int().positive(),
      agreed: z.literal(true),
    });
  const flush = async () => {
    await runPaymentReconciliation(db, production);
  };
  const allowed = async (oid: string, uid: string) => getOrder(db, oid, uid);
  const result = async (oid: string, uid: string) => {
    const o = await allowed(oid, uid),
      q = await quoteFor(db, o, uid),
      b = await first(db, "SELECT * FROM funding_batches WHERE order_id=?", [
        oid,
      ]);
    const approval = await first(
      db,
      "SELECT id FROM payment_approvals WHERE order_id=? AND member_id=? AND fingerprint=? AND status IN('approved','used') ORDER BY created_at DESC LIMIT 1",
      [oid, uid, q.fingerprint],
    );
    const instructions = await rows(
      db,
      "SELECT id,status,total_cents,refunded_cents,purpose,attempts,failure FROM funding_instructions WHERE order_id=? AND member_id=? ORDER BY created_at DESC",
      [oid, uid],
    );
    const retry = await first(
      db,
      "SELECT * FROM funding_instructions WHERE order_id=? AND member_id=? AND status IN('failed','requires_action') ORDER BY created_at DESC LIMIT 1",
      [oid, uid],
    );
    const retrySupplement = retry?.supplement_id
      ? await first(
          db,
          "SELECT created_at FROM funding_supplements WHERE id=?",
          [retry.supplement_id],
        )
      : null;
    const retryDetails = retry
      ? {
          instructionId: retry.id,
          lines: json(retry.basket_lines),
          amount: retry.total_cents,
          methodVersion: q.profile?.method_version,
          methodId: q.profile?.method_id,
        }
      : null;
    const member = await first(
      db,
      "SELECT user_id FROM memberships WHERE order_id=? AND user_id=?",
      [oid, uid],
    );
    const offers = member
      ? await rows(
          db,
          "SELECT id,quantity,remaining,components FROM funding_shares WHERE order_id=? AND remaining>0",
          [oid],
        )
      : [];
    return {
      supplements: await supplementQuotes(db, oid, uid),
      supplementProposals:
        o.organizer_id === uid
          ? await rows(
              db,
              "SELECT id,item_id,new_price_cents,status FROM funding_supplements WHERE order_id=? AND status NOT IN('funded','cancelled')",
              [oid],
            )
          : [],
      provider: q.profile?.provider ?? process.env.PAYMENTS_PROVIDER ?? "demo",
      livePaymentsEnabled: false,
      policyVersion: PILOT_POLICY.version,
      quote: q.mine
        ? {
            ...q.mine,
            lines: q.details.lines,
            fingerprint: q.fingerprint,
            deadline: q.details.deadline,
          }
        : null,
      cardReady: !!q.profile?.ready,
      approval: approval ? "approved" : "changes_need_approval",
      status:
        b?.status ??
        (approval ? "approved_waiting_for_close" : "approval_needed"),
      issues: b ? (json(b.snapshot).issues ?? []) : q.snapshot.problems,
      warnings: q.snapshot.warnings,
      viable: q.snapshot.pricing?.formationMet ?? false,
      retry:
        retry && retry.attempts < RETRY_LIMIT
          ? {
              id: retry.id,
              status: retry.status,
              amountCents: retry.total_cents,
              fingerprint: fingerprint(retryDetails),
              until: retrySupplement
                ? new Date(
                    new Date(retrySupplement.created_at).getTime() +
                      2 * 3600000,
                  )
                : retry.purpose === "takeover"
                  ? b?.takeover_until
                  : b?.retry_until,
            }
          : null,
      instructions,
      offers: offers.map((s) => ({
        id: s.id,
        name: json(s.components).name,
        itemId: json(s.components).itemId,
        remaining: s.remaining,
      })),
      takeoverUntil: b?.takeover_until,
      organizer:
        o.organizer_id === uid
          ? {
              advanceRecovery: await first(
                db,
                "SELECT amount_cents,recovered_cents,status FROM funding_advance_recoveries WHERE order_id=?",
                [oid],
              ),
              groceryCents:
                b?.grocery_cents ?? q.snapshot.pricing?.budgetCents ?? 0,
              rewardCents:
                b?.reward_cents ?? q.snapshot.pricing?.organizerCents ?? 0,
              revision: b?.revision ?? 0,
              confirmationNeeded: b?.organizer_confirmed === 0,
              payouts: await rows(
                db,
                "SELECT purpose,amount_cents,status FROM funding_payouts WHERE order_id=?",
                [oid],
              ),
            }
          : null,
    };
  };
  r.get("/orders/:id/payment-preview", verified, async (req, res) =>
    res.json(await result(req.params.id as string, req.user!.id)),
  );
  r.get("/orders/:id/payment-status", verified, async (req, res) =>
    res.json(await result(req.params.id as string, req.user!.id)),
  );
  r.post("/orders/:id/payment-approve", verified, async (req, res) => {
    const oid = req.params.id as string;
    await allowed(oid, req.user!.id);
    const b = agreed.parse(req.body);
    res.json(
      await approveBasket(db, oid, req.user!.id, b.fingerprint, b.amountCents),
    );
  });
  r.post("/orders/:id/payment-revoke", verified, async (req, res) => {
    const oid = req.params.id as string;
    await transaction(db, async (c) => {
      const o = await getOrder(c, oid, req.user!.id, undefined, true);
      if (o.status !== "open")
        fail(
          409,
          "GROUP_CLOSED",
          "A closed run requires payment recovery or organizer cancellation.",
        );
      await invalidateApprovals(c, oid, req.user!.id);
    });
    res.json({ ok: true });
  });
  r.post("/orders/:id/payment-retry", verified, async (req, res) => {
    const oid = req.params.id as string;
    await allowed(oid, req.user!.id);
    const b = agreed.parse(req.body);
    await retryPayment(db, oid, req.user!.id, b.fingerprint, b.amountCents);
    await flush();
    res.json(await result(oid, req.user!.id));
  });
  r.post("/orders/:id/takeover-quote", verified, async (req, res) => {
    const oid = req.params.id as string,
      o = await allowed(oid, req.user!.id),
      b = z
        .object({
          offerId: z.string().uuid(),
          quantity: z.number().int().positive(),
        })
        .parse(req.body);
    const offer = await first(
      db,
      "SELECT * FROM funding_shares WHERE id=? AND order_id=?",
      [b.offerId, oid],
    );
    if (!offer || b.quantity > offer.remaining)
      fail(409, "SHARES_CHANGED", "Refresh the available shares.");
    const own = o.organizer_id === req.user!.id,
      p = await profile(db, req.user!.id),
      line = offerComponents(offer, b.quantity);
    const details = {
      offerId: offer.id,
      remaining: offer.remaining,
      quantity: b.quantity,
      line,
      memberId: req.user!.id,
      methodVersion: own ? null : p?.method_version,
      organizerOwned: own,
    };
    res.json({
      ...line,
      amountCents: own ? line.groceryCents : line.totalCents,
      fingerprint: fingerprint(details),
      organizerOwned: own,
    });
  });
  r.post("/orders/:id/takeover-claim", verified, async (req, res) => {
    const oid = req.params.id as string,
      b = agreed
        .extend({
          offerId: z.string().uuid(),
          quantity: z.number().int().positive(),
        })
        .parse(req.body);
    await claimTakeover(
      db,
      oid,
      req.user!.id,
      b.offerId,
      b.quantity,
      b.fingerprint,
      b.amountCents,
    );
    await flush();
    res.json(await result(oid, req.user!.id));
  });
  r.post("/orders/:id/funding-confirm", verified, async (req, res) => {
    const oid = req.params.id as string,
      b = z
        .object({
          revision: z.number().int(),
          groceryCents: z.number().int(),
          rewardCents: z.number().int(),
          agreed: z.literal(true),
        })
        .parse(req.body);
    await transaction(db, async (c) => {
      const o = await getOrder(c, oid, req.user!.id, undefined, true);
      owner(o, req.user!.id);
      const current = await first(
        c,
        "SELECT * FROM funding_batches WHERE order_id=?",
        [oid],
      );
      if (
        !current ||
        current.revision !== b.revision ||
        current.grocery_cents !== b.groceryCents ||
        current.reward_cents !== b.rewardCents
      )
        fail(
          409,
          "QUOTE_CHANGED",
          "Review the revised grocery budget and completion reward.",
        );
      await execute(
        c,
        "UPDATE funding_batches SET organizer_confirmed=TRUE WHERE order_id=?",
        [oid],
      );
    });
    await flush();
    res.json({ ok: true });
  });
  r.post("/orders/:id/supplement-propose", verified, async (req, res) => {
    const b = z
      .object({
        itemId: z.string().uuid(),
        priceCents: z.number().int().positive().max(1000000),
      })
      .parse(req.body);
    res.json(
      await proposeSupplement(
        db,
        req.params.id as string,
        req.user!.id,
        b.itemId,
        b.priceCents,
      ),
    );
  });
  r.post("/orders/:id/supplement-approve", verified, async (req, res) => {
    const b = agreed
        .extend({ supplementId: z.string().uuid() })
        .parse(req.body),
      oid = req.params.id as string;
    await approveSupplement(
      db,
      oid,
      req.user!.id,
      b.supplementId,
      b.fingerprint,
      b.amountCents,
    );
    await flush();
    res.json({ ok: true });
  });
  r.post("/orders/:id/supplement-cancel", verified, async (req, res) => {
    const b = z.object({ supplementId: z.string().uuid() }).parse(req.body),
      oid = req.params.id as string;
    await cancelSupplement(db, oid, req.user!.id, b.supplementId);
    await flush();
    res.json({ ok: true });
  });
  r.post("/orders/:id/payment-checkout", verified, async (req, res) => {
    const stripe = stripeTestClient(production),
      oid = req.params.id as string,
      uid = req.user!.id;
    await allowed(oid, uid);
    const p = await transaction(db, async (c) => {
      const existing = await first(
        c,
        "SELECT * FROM payment_profiles WHERE user_id=? FOR UPDATE",
        [uid],
      );
      if (existing?.provider === "stripe_test" && !existing.ready)
        return existing;
      await execute(
        c,
        "INSERT INTO payment_profiles(user_id,provider,ready) VALUES(?,'stripe_test',FALSE) ON DUPLICATE KEY UPDATE provider='stripe_test',method_version=method_version+1,ready=FALSE,setup_session_id=NULL",
        [uid],
      );
      await execute(
        c,
        "UPDATE payment_approvals SET status='revoked' WHERE member_id=? AND status='approved'",
        [uid],
      );
      return first(c, "SELECT * FROM payment_profiles WHERE user_id=?", [uid]);
    });
    if (
      !p.setup_session_id &&
      Date.now() - new Date(p.updated_at).getTime() > 23 * 3600000
    )
      fail(
        409,
        "SETUP_RECONCILIATION_REQUIRED",
        "Reconcile the old unknown setup request before creating a new session.",
      );
    if (!p.customer_id) {
      const customer = await stripe.customers.create(
        { email: req.user!.email, metadata: { member_id: uid } },
        { idempotencyKey: `customer:${uid}` },
      );
      await execute(
        db,
        "UPDATE payment_profiles SET customer_id=? WHERE user_id=?",
        [customer.id, uid],
      );
      p.customer_id = customer.id;
    }
    const base = (
      process.env.PUBLIC_APP_URL ??
      process.env.APP_ORIGIN ??
      "http://localhost:8081"
    ).replace(/\/$/, "");
    const session = p.setup_session_id
      ? await stripe.checkout.sessions.retrieve(p.setup_session_id)
      : await createTestSetup(
          stripe,
          p.customer_id,
          uid,
          p.method_version,
          `${base}/order/${oid}`,
        );
    await execute(
      db,
      "UPDATE payment_profiles SET setup_session_id=? WHERE user_id=? AND method_version=?",
      [session.id, uid, p.method_version],
    );
    res.json({ url: session.url, status: session.status, mode: "setup" });
  });
  r.post("/orders/:id/payment-setup-sync", verified, async (req, res) => {
    const stripe = stripeTestClient(production),
      p = await profile(db, req.user!.id);
    if (!p?.setup_session_id)
      fail(409, "SETUP_REQUIRED", "Start hosted card setup first.");
    const session = await stripe.checkout.sessions.retrieve(
      p.setup_session_id,
      { expand: ["setup_intent.payment_method"] },
    );
    const intent =
        typeof session.setup_intent === "object" ? session.setup_intent : null,
      method =
        intent && typeof intent.payment_method === "object"
          ? intent.payment_method
          : null;
    if (
      session.mode === "setup" &&
      session.status === "complete" &&
      intent?.status === "succeeded" &&
      method &&
      intent.metadata?.member_id === req.user!.id &&
      intent.metadata?.method_version === String(p.method_version) &&
      session.customer === p.customer_id
    )
      await execute(
        db,
        "UPDATE payment_profiles SET ready=TRUE,method_id=?,brand=?,last4=? WHERE user_id=? AND method_version=?",
        [
          method.id,
          method.card?.brand ?? null,
          method.card?.last4 ?? null,
          req.user!.id,
          p.method_version,
        ],
      );
    res.json({ ok: true });
  });
  r.post("/orders/:id/demo-payment-approvals", verified, async (req, res) => {
    const oid = req.params.id as string;
    const body = z
      .object({
        agreed: z.literal(true),
        scheduleInOneMinute: z.boolean().default(false),
      })
      .parse(req.body);
    const demo = await first(db, "SELECT demo FROM users WHERE id=?", [
      req.user!.id,
    ]);
    const members = await rows(
      db,
      "SELECT user_id FROM memberships WHERE order_id=?",
      [oid],
    );
    if (
      !demo?.demo ||
      members.some(
        (m) =>
          m.user_id !== req.user!.id &&
          !["demo-jordan", "demo-alex", "demo-priya"].includes(m.user_id),
      )
    )
      fail(
        403,
        "DEMO_ONLY",
        "Sample approvals are only for the demo organizer and sample buyers.",
      );
    await transaction(db, async (c) => {
      const o = await getOrder(c, oid, req.user!.id, undefined, true);
      owner(o, req.user!.id);
      if (o.status !== "open")
        fail(409, "GROUP_CLOSED", "Schedule the sample run before closure.");
      if (body.scheduleInOneMinute) {
        await execute(
          c,
          "UPDATE orders SET deadline=?,revision=revision+1 WHERE id=?",
          [new Date(Date.now() + 60000), oid],
        );
        await invalidateApprovals(c, oid);
      }
    });
    const o = await allowed(oid, req.user!.id);
    for (const m of members.filter((m) => m.user_id !== req.user!.id)) {
      const q = await quoteFor(db, o, m.user_id);
      if (q.profile?.provider !== "demo")
        fail(
          409,
          "DEMO_ONLY",
          "Sandbox provider cards cannot use simulated consent.",
        );
      if (q.mine)
        await approveBasket(
          db,
          oid,
          m.user_id,
          q.fingerprint,
          q.mine.totalCents,
        );
    }
    res.json({ ok: true, deadline: o.deadline });
  });
  r.post("/orders/:id/payment-action", verified, async (req, res) => {
    stripeTestClient(production);
    const oid = req.params.id as string;
    await allowed(oid, req.user!.id);
    const i = await first(
      db,
      "SELECT * FROM funding_instructions WHERE order_id=? AND member_id=? AND status='requires_action' LIMIT 1",
      [oid, req.user!.id],
    );
    if (!i)
      fail(409, "NO_ACTION_REQUIRED", "No bank authentication is pending.");
    const raw = token();
    await execute(
      db,
      "INSERT INTO payment_action_links(token_hash,instruction_id,member_id,expires_at) VALUES(?,?,?,?)",
      [hash(raw), i.id, req.user!.id, new Date(Date.now() + 30 * 60000)],
    );
    const base = (
      process.env.PUBLIC_API_URL ??
      process.env.RENDER_EXTERNAL_URL ??
      "http://localhost:4000"
    ).replace(/\/$/, "");
    res.json({ url: `${base}/api/payment-action/${raw}` });
  });
  r.get("/payment-action/:token", async (req, res) => {
    const stripe = stripeTestClient(production),
      link = await first(
        db,
        "SELECT l.*,i.provider_id,i.status,i.purpose,o.status AS order_status FROM payment_action_links l JOIN funding_instructions i ON i.id=l.instruction_id JOIN orders o ON o.id=i.order_id WHERE l.token_hash=? AND l.expires_at>UTC_TIMESTAMP(3)",
        [hash(req.params.token as string)],
      );
    if (
      !link ||
      link.status !== "requires_action" ||
      !(
        link.order_status === "locked" ||
        (link.order_status === "shopping" && link.purpose === "supplement")
      )
    )
      fail(
        410,
        "ACTION_EXPIRED",
        "This authentication link expired. Return to the group.",
      );
    const intent = await stripe.paymentIntents.retrieve(link.provider_id),
      key = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!key?.startsWith("pk_test_"))
      fail(
        503,
        "PAYMENTS_DISABLED",
        "Stripe sandbox browser authentication is not configured.",
      );
    const literal = (value: unknown) =>
      JSON.stringify(value).replace(/</g, "\\u003c");
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'unsafe-inline' https://js.stripe.com; connect-src https://*.stripe.com; frame-src https://*.stripe.com https://*.stripe.network; style-src 'unsafe-inline'",
    });
    res
      .type("html")
      .send(
        `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Confirm POOLD sandbox payment</title><body><h1>Confirm your payment with your bank</h1><p>Only your previously approved basket will be paid. This is Stripe test mode.</p><button id="confirm">Continue with bank</button><p id="result" role="status"></p><script src="https://js.stripe.com/v3/"></script><script>document.getElementById('confirm').onclick=async function(){this.disabled=true;const result=await Stripe(${literal(key)}).confirmCardPayment(${literal(intent.client_secret)});document.getElementById('result').textContent=result.error?result.error.message:'Return to POOLD. Payment confirmation is being reconciled.';this.disabled=false;};</script></body></html>`,
      );
  });
  r.post("/organizer/payment-onboarding", verified, async (req, res) => {
    const stripe = stripeTestClient(production),
      uid = req.user!.id;
    let connected = await first(
      db,
      "SELECT * FROM connected_accounts WHERE organizer_id=?",
      [uid],
    );
    if (!connected) {
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: "CA",
          email: req.user!.email,
          capabilities: { transfers: { requested: true } },
          settings: { payouts: { schedule: { interval: "manual" } } },
          metadata: { organizer_id: uid },
        },
        { idempotencyKey: `onboarding:${uid}` },
      );
      await execute(
        db,
        "INSERT IGNORE INTO connected_accounts(organizer_id,stripe_account_id) VALUES(?,?)",
        [uid, account.id],
      );
      connected = await first(
        db,
        "SELECT * FROM connected_accounts WHERE organizer_id=?",
        [uid],
      );
    }
    const base = (
      process.env.PUBLIC_APP_URL ??
      process.env.APP_ORIGIN ??
      "http://localhost:8081"
    ).replace(/\/$/, "");
    const link = await stripe.accountLinks.create({
      account: connected.stripe_account_id,
      type: "account_onboarding",
      refresh_url: `${base}/organize`,
      return_url: `${base}/organize`,
    });
    res.json({ url: link.url });
  });
  r.post("/organizer/payment-account-sync", verified, async (req, res) => {
    const stripe = stripeTestClient(production),
      uid = req.user!.id,
      c = await first(
        db,
        "SELECT * FROM connected_accounts WHERE organizer_id=?",
        [uid],
      );
    if (!c)
      fail(
        409,
        "ONBOARDING_REQUIRED",
        "Start organizer payout onboarding first.",
      );
    const a = await stripe.accounts.retrieve(c.stripe_account_id),
      destination = a.external_accounts?.data.find((x) =>
        x.available_payout_methods?.includes("instant"),
      );
    await execute(
      db,
      "UPDATE connected_accounts SET charges_enabled=?,payouts_enabled=?,instant_eligible=?,instant_destination=?,synchronized_at=UTC_TIMESTAMP(3) WHERE organizer_id=?",
      [
        a.charges_enabled,
        a.payouts_enabled &&
          a.capabilities?.transfers === "active" &&
          a.settings?.payouts?.schedule?.interval === "manual",
        !!destination,
        destination?.id ?? null,
        uid,
      ],
    );
    res.json({
      payoutsEnabled: a.payouts_enabled,
      instantEligible: !!destination,
    });
  });
  return r;
}
