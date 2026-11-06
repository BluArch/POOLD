import { progressSupplements } from "./supplements.js";
import type { Pool } from "mysql2/promise";
import { first, rows, execute, transaction } from "../db.js";
import { notify, notifyMembers } from "../notifications.js";
import { postJournal } from "./journal.js";
import {
  json,
  enqueue,
  cancelFunding,
  progressFunding,
  transferClaims,
  refundTo,
  profile,
} from "./engine.js";
import { allocate } from "./fee-engine.js";
import { paymentProvider, type PaymentProvider } from "./provider.js";
import { stripeTestClient } from "./stripe-test.js";

async function recordResult(db: Pool, op: any, result: any) {
  return transaction(db, async (c) => {
    const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
      op.order_id,
    ]);
    const current = await first(
      c,
      "SELECT * FROM funding_operations WHERE operation_key=? FOR UPDATE",
      [op.operation_key],
    );
    if (current.status === "succeeded") return;
    const req = json(op.request);
    const pending = ["processing", "pending", "in_transit"].includes(
      result.status,
    );
    await execute(
      c,
      "UPDATE funding_operations SET provider_id=?,result=?,status=?,lease_until=NULL,next_at=? WHERE operation_key=?",
      [
        result.id ?? null,
        JSON.stringify(result),
        pending ? "unknown" : "succeeded",
        new Date(Date.now() + 15000),
        op.operation_key,
      ],
    );
    if (op.kind === "charge" || op.kind === "cancel") {
      const i = await first(
        c,
        "SELECT * FROM funding_instructions WHERE id=? FOR UPDATE",
        [op.owner_id],
      );
      if (!i) return;
      const succeeded = result.status === "succeeded";
      if (succeeded) {
        if (
          result.amount !== i.total_cents ||
          result.currency !== "cad" ||
          result.instructionId !== i.id ||
          (req.method &&
            ((result.customer ?? null) !== (req.method.customer_id ?? null) ||
              (result.method ?? null) !== (req.method.method_id ?? null)))
        ) {
          await execute(
            c,
            "UPDATE funding_operations SET status='needs_attention' WHERE operation_key=?",
            [op.operation_key],
          );
          await execute(
            c,
            "UPDATE funding_batches SET status='needs_attention' WHERE order_id=?",
            [o.id],
          );
          return;
        }
        if (i.status !== "paid" && i.status !== "refunded") {
          await execute(
            c,
            "UPDATE funding_instructions SET status='paid',provider_id=?,charge_id=?,provider_fee_cents=?,failure=NULL WHERE id=?",
            [result.id, result.chargeId, result.feeCents ?? null, i.id],
          );
          await postJournal(
            c,
            `scheduled:payment:${i.id}`,
            "Scheduled basket payment",
            [
              { account: "provider_receivable", debitCents: i.total_cents },
              { account: "grocery_liability", creditCents: i.grocery_cents },
              {
                account: "markup_service_deferred",
                creditCents: i.markup_cents + i.fee_cents,
              },
              ...(i.tax_cents
                ? [{ account: "tax_liability", creditCents: i.tax_cents }]
                : []),
            ],
          );
          for (const t of await rows(
            c,
            "SELECT t.*,s.original_member_id,s.item_id FROM funding_takeovers t JOIN funding_shares s ON s.id=t.share_id WHERE t.instruction_id=? AND t.status='reserved'",
            [i.id],
          )) {
            await transferClaims(
              c,
              o.id,
              t.original_member_id,
              t.member_id,
              t.item_id,
              t.quantity,
            );
            await execute(
              c,
              "UPDATE funding_takeovers SET status='paid' WHERE id=?",
              [t.id],
            );
          }
        }
        const supplement = i.supplement_id
          ? await first(
              c,
              "SELECT status FROM funding_supplements WHERE id=?",
              [i.supplement_id],
            )
          : null;
        if (
          o.status === "cancelled" ||
          supplement?.status === "cancelled" ||
          ["superseded", "superseding"].includes(i.status)
        )
          await refundTo(
            c,
            { ...i, provider_id: result.id },
            i.total_cents,
            "canceled or superseded purchase",
          );
      } else if (op.kind === "cancel" && result.status === "canceled") {
        await execute(
          c,
          "UPDATE funding_instructions SET status='failed',provider_id=NULL WHERE id=? AND status='superseding'",
          [i.id],
        );
        if (o.status === "cancelled")
          await execute(
            c,
            "UPDATE funding_instructions SET status='superseded' WHERE id=? AND status NOT IN('paid','refunded')",
            [i.id],
          );
      } else if (op.kind === "charge") {
        const state = pending
          ? "processing"
          : result.status === "requires_action"
            ? "requires_action"
            : result.status === "canceled"
              ? "superseded"
              : "failed";
        await execute(
          c,
          "UPDATE funding_instructions SET status=?,provider_id=?,failure=? WHERE id=? AND status NOT IN('paid','refunded')",
          [state, result.id, "Payment action required", i.id],
        );
        if (i.purpose !== "supplement")
          await execute(
            c,
            "UPDATE funding_batches SET status='payment_recovery' WHERE order_id=? AND status NOT IN('refund_pending','cancelled')",
            [o.id],
          );
        if (!pending)
          await notify(
            c,
            i.member_id,
            o.id,
            `${o.name}: payment needs action. Open the group to retry before the deadline.`,
            `payment-action:${i.id}:${i.attempts}`,
          );
      }
    } else if (op.kind === "refund" && result.status === "succeeded") {
      const i = await first(
        c,
        "SELECT * FROM funding_instructions WHERE id=? FOR UPDATE",
        [op.owner_id],
      );
      if (result.amount !== req.amount)
        throw new Error("Refund amount does not match request.");
      await execute(
        c,
        "UPDATE funding_instructions SET refunded_cents=refunded_cents+?,status=IF(refunded_cents>=total_cents,'refunded',status) WHERE id=?",
        [req.amount, i.id],
      );
      await postJournal(c, `scheduled:${op.operation_key}`, "Customer refund", [
        { account: "customer_refunds", debitCents: req.amount },
        { account: "provider_receivable", creditCents: req.amount },
      ]);
      await notify(
        c,
        i.member_id,
        o.id,
        `${o.name}: refund of CAD ${(req.amount / 100).toFixed(2)} confirmed.`,
        `refund-confirmed:${op.operation_key}`,
      );
    } else if (op.kind === "refund" && !pending) {
      await execute(
        c,
        "UPDATE funding_operations SET status='needs_attention' WHERE operation_key=?",
        [op.operation_key],
      );
    } else if (op.kind === "payout" && result.status === "paid") {
      if (result.amount !== req.amount)
        throw new Error("Payout amount does not match request.");
      await execute(
        c,
        "UPDATE funding_payouts SET status='paid',provider_id=?,confirmed_at=UTC_TIMESTAMP(3) WHERE order_id=? AND purpose=?",
        [result.id, o.id, req.purpose],
      );
      await postJournal(
        c,
        `scheduled:${op.operation_key}`,
        "Organizer payout",
        [
          {
            account:
              req.purpose === "grocery"
                ? "grocery_liability"
                : "organizer_reward_expense",
            debitCents: req.amount,
          },
          { account: "provider_receivable", creditCents: req.amount },
        ],
      );
      if (req.purpose === "grocery")
        await execute(
          c,
          "UPDATE funding_batches SET status='funded' WHERE order_id=? AND status='funding'",
          [o.id],
        );
      if (o.status !== "cancelled")
        await notifyMembers(
          c,
          o.id,
          `${o.name}: ${req.purpose === "grocery" ? "the complete grocery budget is accessible; shopping can begin" : req.purpose === "completion_reward" ? "the completion reward payout is confirmed" : "the additional grocery funding is confirmed"}.`,
          op.operation_key,
        );
    } else if (op.kind === "payout") {
      await execute(
        c,
        "UPDATE funding_payouts SET status=?,provider_id=? WHERE order_id=? AND purpose=?",
        [
          pending ? "in_transit" : "needs_attention",
          result.id,
          o.id,
          req.purpose,
        ],
      );
    }
  });
}
async function queueTransfers(db: Pool) {
  for (const p of await rows(
    db,
    "SELECT p.*,b.provider,o.organizer_id,o.status AS order_status FROM funding_payouts p JOIN funding_batches b ON b.order_id=p.order_id JOIN orders o ON o.id=p.order_id WHERE p.status IN('pending','transferring')",
  ))
    await transaction(db, async (c) => {
      const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
        p.order_id,
      ]);
      if (
        o.status === "cancelled" ||
        (p.purpose === "completion_reward" && o.status !== "completed")
      )
        return;
      const b = await first(
        c,
        "SELECT * FROM funding_batches WHERE order_id=?",
        [p.order_id],
      );
      if (p.purpose === "completion_reward" && b.status !== "funded") return;
      if (
        await first(
          c,
          "SELECT order_id FROM funding_advance_recoveries WHERE organizer_id=? AND status='due' LIMIT 1",
          [o.organizer_id],
        )
      )
        return;
      const account = await first(
        c,
        "SELECT * FROM connected_accounts WHERE organizer_id=? FOR UPDATE",
        [o.organizer_id],
      );
      if (
        p.provider === "stripe_test" &&
        (!account?.payouts_enabled || !account.instant_destination)
      )
        return;
      const instructions = await rows(
        c,
        "SELECT * FROM funding_instructions WHERE order_id=? AND status='paid' ORDER BY id",
        [p.order_id],
      );
      const sources = p.purpose.startsWith("supplement:")
        ? instructions.filter((i) => i.supplement_id === p.purpose.slice(11))
        : instructions.filter((i) => !i.supplement_id);
      const needed = p.amount_cents + p.cost_cents;
      const source = await rows(
        c,
        "SELECT request FROM funding_operations WHERE order_id=? AND kind='transfer' AND status NOT IN('failed','needs_attention')",
        [o.id],
      );
      const capacities = sources.map((i) => ({
        memberId: i.id,
        groceryCents: Math.max(
          0,
          i.total_cents -
            i.refunded_cents -
            i.tax_cents -
            source
              .filter((s) => json(s.request).instructionId === i.id)
              .reduce((n, s) => n + json(s.request).amount, 0),
        ),
      }));
      // Existing purpose transfers are durable allocations; do not allocate them twice.
      const existing = await rows(
        c,
        "SELECT * FROM funding_operations WHERE order_id=? AND kind='transfer'",
        [o.id],
      );
      const transfers = existing.filter(
        (t) => json(t.request).purpose === p.purpose,
      );
      if (!transfers.length) {
        const capacity = capacities.reduce((n, x) => n + x.groceryCents, 0),
          shortfall = Math.max(0, needed - capacity);
        if (shortfall) {
          // Preserve the frozen completion reward and absorb approved supplement costs from owned capital.
          if (p.purpose === "grocery") return;
          const reserve = await first(
            c,
            "SELECT available_cents FROM payment_reserves WHERE provider=? FOR UPDATE",
            [p.provider],
          );
          if (Number(reserve?.available_cents ?? 0) < shortfall) {
            await execute(
              c,
              "UPDATE funding_payouts SET status='needs_attention' WHERE order_id=? AND purpose=?",
              [o.id, p.purpose],
            );
            return;
          }
          await execute(
            c,
            "INSERT INTO funding_reserve_allocations(order_id,purpose,amount_cents) VALUES(?,?,?)",
            [o.id, p.purpose, shortfall],
          );
          await execute(
            c,
            "UPDATE payment_reserves SET available_cents=available_cents-? WHERE provider=?",
            [shortfall, p.provider],
          );
          await enqueue(
            c,
            `transfer:${o.id}:${p.purpose}:reserve`,
            o.id,
            o.id,
            p.provider,
            "transfer",
            {
              account: account?.stripe_account_id,
              amount: shortfall,
              purpose: p.purpose,
              capital: true,
            },
          );
        }
        const shares = capacity
          ? allocate(Math.min(needed, capacity), capacities)
          : new Map<string, number>();
        for (const i of sources) {
          const amount = shares.get(i.id) ?? 0;
          if (amount)
            await enqueue(
              c,
              `transfer:${o.id}:${p.purpose}:${i.id}`,
              o.id,
              i.id,
              p.provider,
              "transfer",
              {
                instructionId: i.id,
                account: account?.stripe_account_id,
                chargeId: i.charge_id,
                amount,
                purpose: p.purpose,
              },
            );
        }
        await execute(
          c,
          "UPDATE funding_payouts SET status='transferring' WHERE order_id=? AND purpose=?",
          [o.id, p.purpose],
        );
        return;
      }
      if (
        transfers.some(
          (t) => t.status !== "succeeded" || !json(t.result)?.available,
        )
      )
        return;
      // Account-scoped serialization prevents simultaneous group payouts spending each other's allocations.
      if (p.provider === "stripe_test") {
        const blocked = await first(
          c,
          "SELECT f.operation_key FROM funding_operations f JOIN orders x ON x.id=f.order_id WHERE x.organizer_id=? AND f.kind IN('payout','reversal') AND f.status NOT IN('succeeded') AND f.order_id<>? LIMIT 1",
          [o.organizer_id, o.id],
        );
        if (blocked) return;
      }
      await enqueue(
        c,
        `payout:${o.id}:${p.purpose}`,
        o.id,
        o.id,
        p.provider,
        "payout",
        {
          account: account?.stripe_account_id,
          destination: account?.instant_destination,
          purpose: p.purpose,
          amount: p.amount_cents,
          cost: p.cost_cents,
        },
      );
    });
}
async function reconcileEvents(db: Pool, production: boolean) {
  if (production || process.env.PAYMENTS_TEST_MODE !== "true") return;
  const stripe = stripeTestClient(production);
  for (const event of await rows(
    db,
    "SELECT * FROM stripe_events WHERE status='pending' LIMIT 50",
  )) {
    try {
      if (event.event_type.startsWith("payment_intent.")) {
        const i = await first(
          db,
          "SELECT id FROM funding_instructions WHERE provider_id=?",
          [event.object_id],
        );
        if (i)
          await execute(
            db,
            "UPDATE funding_operations SET status='unknown',next_at=UTC_TIMESTAMP(3) WHERE owner_id=? AND kind='charge' ORDER BY created_at DESC LIMIT 1",
            [i.id],
          );
      } else if (event.event_type.startsWith("checkout.session.")) {
        const session = await stripe.checkout.sessions.retrieve(
          event.object_id,
          { expand: ["setup_intent.payment_method"] },
        );
        const intent =
          typeof session.setup_intent === "object"
            ? session.setup_intent
            : null;
        const method =
          intent && typeof intent.payment_method === "object"
            ? intent.payment_method
            : null;
        if (
          session.mode === "setup" &&
          session.status === "complete" &&
          intent?.status === "succeeded" &&
          method
        ) {
          await transaction(db, async (c) => {
            const p = await first(
              c,
              "SELECT * FROM payment_profiles WHERE setup_session_id=? FOR UPDATE",
              [session.id],
            );
            if (
              !p ||
              String(p.method_version) !== intent.metadata?.method_version ||
              p.user_id !== intent.metadata?.member_id ||
              p.customer_id !== session.customer
            )
              return;
            await execute(
              c,
              "UPDATE payment_profiles SET ready=TRUE,method_id=?,brand=?,last4=? WHERE user_id=?",
              [
                method.id,
                method.card?.brand ?? null,
                method.card?.last4 ?? null,
                p.user_id,
              ],
            );
            // Saving a card never approves a basket or queues a grocery charge.
          });
        }
      } else if (event.event_type.startsWith("payout."))
        await execute(
          db,
          "UPDATE funding_operations SET status='unknown',next_at=UTC_TIMESTAMP(3) WHERE provider_id=? AND kind='payout'",
          [event.object_id],
        );
      await execute(
        db,
        "UPDATE stripe_events SET status='processed',processed_at=UTC_TIMESTAMP(3) WHERE stripe_event_id=?",
        [event.stripe_event_id],
      );
    } catch {
      await execute(
        db,
        "UPDATE stripe_events SET status='needs_attention' WHERE stripe_event_id=?",
        [event.stripe_event_id],
      );
    }
  }
}
export async function runPaymentReconciliation(
  db: Pool,
  production: boolean,
  options: { provider?: PaymentProvider; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  await reconcileEvents(db, production);
  await progressFunding(db, now);
  // Transfers can become available after their API request succeeds. Recheck them.
  await execute(
    db,
    "UPDATE funding_operations SET status='unknown',next_at=UTC_TIMESTAMP(3) WHERE kind='transfer' AND status='succeeded' AND JSON_EXTRACT(result,'$.available')=FALSE",
  );
  for (let pass = 0; pass < 8; pass++) {
    await progressSupplements(db);
    await queueTransfers(db);
    const queueNow = new Date(Math.max(now.getTime(), Date.now()));
    const operations = await rows(
      db,
      "SELECT operation_key FROM funding_operations WHERE status IN('pending','unknown','running') AND next_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY created_at,operation_key LIMIT 50",
      [queueNow, queueNow],
    );
    if (!operations.length) break;
    for (const { operation_key } of operations) {
      const op = await transaction(db, async (c) => {
        const candidate = await first(
          c,
          "SELECT * FROM funding_operations WHERE operation_key=? FOR UPDATE",
          [operation_key],
        );
        if (
          !candidate ||
          candidate.status === "succeeded" ||
          (candidate.lease_until && new Date(candidate.lease_until) > now)
        )
          return null;
        // An unknown create result older than the provider's idempotency retention needs operator reconciliation.
        if (
          !candidate.provider_id &&
          candidate.status === "unknown" &&
          now.getTime() - new Date(candidate.created_at).getTime() >
            23 * 3600000
        ) {
          await execute(
            c,
            "UPDATE funding_operations SET status='needs_attention' WHERE operation_key=?",
            [operation_key],
          );
          return null;
        }
        const o = await first(c, "SELECT status FROM orders WHERE id=?", [
          candidate.order_id,
        ]);
        const ins =
          candidate.kind === "charge"
            ? await first(
                c,
                "SELECT status,supplement_id,purpose FROM funding_instructions WHERE id=?",
                [candidate.owner_id],
              )
            : null;
        const supplement = ins?.supplement_id
          ? await first(
              c,
              "SELECT status FROM funding_supplements WHERE id=?",
              [ins.supplement_id],
            )
          : null;
        if (
          ((["charge", "transfer", "payout"].includes(candidate.kind) &&
            o.status === "cancelled") ||
            (candidate.kind === "charge" &&
              (ins?.status === "superseded" ||
                supplement?.status === "cancelled"))) &&
          candidate.status === "pending"
        ) {
          await execute(
            c,
            "UPDATE funding_operations SET status='succeeded',result=JSON_OBJECT('status','canceled') WHERE operation_key=?",
            [operation_key],
          );
          await execute(
            c,
            "UPDATE funding_instructions SET status='superseded' WHERE id=? AND status='queued'",
            [candidate.owner_id],
          );
          return null;
        }
        if (candidate.kind === "charge" && candidate.status === "pending") {
          const stored = json(candidate.request).method;
          const current = await profile(c, stored.user_id);
          if (
            !current?.ready ||
            current.method_version !== stored.method_version ||
            current.method_id !== stored.method_id
          ) {
            await execute(
              c,
              "UPDATE funding_operations SET status='succeeded',result=JSON_OBJECT('status','approval_needed') WHERE operation_key=?",
              [operation_key],
            );
            await execute(
              c,
              "UPDATE funding_instructions SET status='failed',failure='Review the changed payment method' WHERE id=?",
              [candidate.owner_id],
            );
            if (ins?.purpose !== "supplement")
              await execute(
                c,
                "UPDATE funding_batches SET status='payment_recovery' WHERE order_id=? AND status IN('charging','approval_needed')",
                [candidate.order_id],
              );
            return null;
          }
        }
        await execute(
          c,
          "UPDATE funding_operations SET status='running',lease_until=?,attempts=attempts+1 WHERE operation_key=?",
          [new Date(now.getTime() + 120000), operation_key],
        );
        return candidate;
      });
      if (!op) continue;
      try {
        const result = await (
          options.provider ?? paymentProvider(db, op.provider, production)
        ).perform(op);
        await recordResult(db, op, result);
      } catch (error) {
        console.warn("Payment operation deferred for reconciliation", {
          operationKey: operation_key,
          kind: op.kind,
          errorType: error instanceof Error ? error.name : "unknown",
        });
        await execute(
          db,
          "UPDATE funding_operations SET status='unknown',lease_until=NULL,next_at=? WHERE operation_key=?",
          [new Date(now.getTime() + 30000), operation_key],
        );
      }
    }
    await progressFunding(db, now);
    await progressSupplements(db);
  }
  for (const b of await rows(
    db,
    "SELECT order_id FROM funding_batches WHERE status='refund_pending'",
  ))
    await transaction(db, async (c) => {
      const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
        b.order_id,
      ]);
      await cancelFunding(c, o, "the run was canceled");
      const outstanding = await first(
        c,
        "SELECT COUNT(*) AS n FROM funding_operations WHERE order_id=? AND status<>'succeeded'",
        [o.id],
      );
      const unpaid = await first(
        c,
        "SELECT COUNT(*) AS n FROM funding_instructions WHERE order_id=? AND (status NOT IN('superseded','refunded') OR refunded_cents<total_cents AND status='paid')",
        [o.id],
      );
      if (!Number(outstanding.n) && !Number(unpaid.n))
        await execute(
          c,
          "UPDATE funding_batches SET status='cancelled' WHERE order_id=?",
          [o.id],
        );
    });
  return { ok: true };
}
