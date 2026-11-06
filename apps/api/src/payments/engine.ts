import { createHash } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { first, rows, execute, transaction, type DB } from "../db.js";
import { id } from "../security.js";
import { fail } from "../errors.js";
import { notify, notifyMembers } from "../notifications.js";
import { basketSnapshot, type BasketLine } from "./baskets.js";
import {
  PILOT_POLICY,
  payoutCost,
  frozenRewardFor,
  providerPercent,
} from "./fee-engine.js";
export const json = <T = any>(v: any): T =>
  typeof v === "string" ? JSON.parse(v) : v;
export const fingerprint = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const RETRY_MS = 2 * 3600000,
  TAKEOVER_MS = 2 * 3600000,
  RETRY_LIMIT = 3;
export async function profile(db: DB, uid: string) {
  const p = await first(db, "SELECT * FROM payment_profiles WHERE user_id=?", [
    uid,
  ]);
  const configured = process.env.PAYMENTS_PROVIDER;
  if (p) return configured && p.provider !== configured ? null : p;
  if (configured === "stripe_test") return null;
  const card = await first(
    db,
    "SELECT * FROM payment_methods WHERE user_id=?",
    [uid],
  );
  return card
    ? {
        user_id: uid,
        provider: "demo",
        ready: true,
        method_version: 1,
        brand: card.brand,
        last4: card.last4,
        method_id: `demo:${uid}`,
      }
    : null;
}
export async function invalidateApprovals(
  db: DB,
  orderId: string,
  memberId?: string,
) {
  await execute(
    db,
    `UPDATE payment_approvals SET status='revoked' WHERE order_id=? AND status='approved'${memberId ? " AND member_id=?" : ""}`,
    [orderId, ...(memberId ? [memberId] : [])],
  );
}
export async function quoteFor(db: DB, o: any, uid: string) {
  const snapshot = await basketSnapshot(db, o.id, true),
    p = await profile(db, uid);
  const mine =
    snapshot.pricing?.members.find((m) => m.memberId === uid) ?? null;
  const details = {
    policyVersion: PILOT_POLICY.version,
    orderId: o.id,
    revision: o.revision,
    memberId: uid,
    deadline: new Date(o.deadline).toISOString(),
    currency: "cad",
    method: p
      ? { provider: p.provider, version: p.method_version, id: p.method_id }
      : null,
    lines: snapshot.lines.filter((l) => l.memberId === uid),
    mine,
  };
  return {
    snapshot,
    profile: p,
    mine,
    details,
    fingerprint: fingerprint(details),
  };
}
export async function approveBasket(
  db: Pool,
  oid: string,
  uid: string,
  hash: string,
  amount: number,
  now = new Date(),
) {
  return transaction(db, async (c) => {
    const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
      oid,
    ]);
    if (!o || !["open", "locked"].includes(o.status))
      fail(409, "GROUP_CLOSED", "This group cannot accept basket approval.");
    const batch = await first(
      c,
      "SELECT * FROM funding_batches WHERE order_id=?",
      [oid],
    );
    if (
      o.status === "locked" &&
      (!batch ||
        batch.status !== "approval_needed" ||
        new Date(batch.retry_until) <= now)
    )
      fail(
        409,
        "GROUP_CLOSED",
        "Only the frozen unpaid basket can be approved during approval recovery.",
      );
    if (o.status === "open" && new Date(o.deadline) <= now)
      fail(
        409,
        "GROUP_CLOSED",
        "Wait for closure finalization before recovering approval.",
      );
    const q = await quoteFor(c, o, uid);
    if (!q.mine) fail(409, "EMPTY_BASKET", "Select shares before approving.");
    if (!q.profile?.ready)
      fail(409, "CARD_REQUIRED", "Save a payment method first.");
    if (q.fingerprint !== hash || q.mine.totalCents !== amount)
      fail(
        409,
        "QUOTE_CHANGED",
        "Review the current itemized total and schedule again.",
      );
    if (q.profile.provider === "stripe_test") {
      const connected = await first(
        c,
        "SELECT * FROM connected_accounts WHERE organizer_id=?",
        [o.organizer_id],
      );
      if (!connected?.payouts_enabled || !connected.instant_eligible)
        fail(
          409,
          "ORGANIZER_NOT_READY",
          "The organizer must finish sandbox payout onboarding first.",
        );
    }
    const same = await first(
      c,
      "SELECT id FROM payment_approvals WHERE order_id=? AND member_id=? AND fingerprint=? AND status='approved'",
      [oid, uid, hash],
    );
    if (same) return { id: same.id, status: "approved" };
    await invalidateApprovals(c, oid, uid);
    const aid = id();
    await execute(
      c,
      "INSERT INTO payment_approvals(id,order_id,member_id,fingerprint,snapshot) VALUES(?,?,?,?,?)",
      [
        aid,
        oid,
        uid,
        hash,
        JSON.stringify({
          ...q.details,
          approvedAt: now.toISOString(),
          consentVersion: "scheduled-basket-v1",
        }),
      ],
    );
    return { id: aid, status: "approved" };
  });
}
export async function enqueue(
  db: DB,
  key: string,
  oid: string,
  ownerId: string,
  provider: string,
  kind: string,
  request: unknown,
) {
  await execute(
    db,
    "INSERT IGNORE INTO funding_operations(operation_key,order_id,owner_id,provider,kind,request) VALUES(?,?,?,?,?,?)",
    [key, oid, ownerId, provider, kind, JSON.stringify(request)],
  );
}
export async function instruction(
  db: DB,
  oid: string,
  uid: string,
  lines: BasketLine[],
  method: any,
  purpose = "initial",
  approvalId: string | null = null,
) {
  const amount = lines.reduce(
    (a, l) => ({
      groceryCents: a.groceryCents + l.groceryCents,
      markupCents: a.markupCents + l.markupCents,
      serviceFeeCents: a.serviceFeeCents + l.serviceFeeCents,
      feeTaxCents: a.feeTaxCents + l.feeTaxCents,
      totalCents: a.totalCents + l.totalCents,
    }),
    {
      groceryCents: 0,
      markupCents: 0,
      serviceFeeCents: 0,
      feeTaxCents: 0,
      totalCents: 0,
    },
  );
  const iid = id();
  await execute(
    db,
    `INSERT INTO funding_instructions(id,order_id,member_id,approval_id,purpose,basket_lines,method,grocery_cents,markup_cents,fee_cents,tax_cents,total_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      iid,
      oid,
      uid,
      approvalId,
      purpose,
      JSON.stringify(lines),
      JSON.stringify(method),
      amount.groceryCents,
      amount.markupCents,
      amount.serviceFeeCents,
      amount.feeTaxCents,
      amount.totalCents,
    ],
  );
  await enqueue(db, `charge:${iid}:0`, oid, iid, method.provider, "charge", {
    instructionId: iid,
    amount: amount.totalCents,
    method,
    lines,
  });
  return iid;
}
export async function prepareClose(db: DB, o: any, now = new Date()) {
  if (new Date(o.deadline) > now)
    fail(
      409,
      "BEFORE_APPROVED_CUTOFF",
      "Members approved the scheduled deadline. Shares cannot be charged early.",
    );
  const existing = await first(
    db,
    "SELECT * FROM funding_batches WHERE order_id=?",
    [o.id],
  );
  if (existing && existing.status !== "approval_needed") return;
  if (
    (await first(
      db,
      "SELECT order_id FROM holds WHERE order_id=? AND status IN('authorized','captured') LIMIT 1",
      [o.id],
    )) ||
    (await first(db, "SELECT id FROM payments WHERE order_id=? LIMIT 1", [
      o.id,
    ])) ||
    (await first(
      db,
      `SELECT id FROM authorization_quotes WHERE order_id=? AND status IN('checkout','authorized') LIMIT 1`,
      [o.id],
    ))
  )
    fail(
      409,
      "LEGACY_PAYMENT_REVIEW",
      "Reconcile existing sandbox holds before using scheduled payments.",
    );
  const snap = await basketSnapshot(db, o.id),
    pricing = snap.pricing;
  const approvals: any[] = [];
  let provider = "demo";
  const issues = [...snap.problems];
  if (
    await first(
      db,
      "SELECT order_id FROM funding_advance_recoveries WHERE organizer_id=? AND status='due' LIMIT 1",
      [o.organizer_id],
    )
  )
    issues.push(
      "Resolve the organizer's previous grocery advance before funding another run.",
    );
  if (!pricing?.formationMet)
    issues.push(
      "This run does not cover its reward and payment costs at the fixed 15% / 5% rates.",
    );
  for (const m of pricing?.members ?? []) {
    const q = await quoteFor(db, o, m.memberId);
    const approved = await first(
      db,
      "SELECT * FROM payment_approvals WHERE order_id=? AND member_id=? AND fingerprint=? AND status='approved' ORDER BY created_at DESC LIMIT 1",
      [o.id, m.memberId, q.fingerprint],
    );
    if (!approved || !q.profile?.ready)
      issues.push(
        "Every buyer must approve their exact current basket, card and schedule.",
      );
    else approvals.push({ approved, q });
    if (q.profile?.provider === "stripe_test") provider = "stripe_test";
  }
  if (approvals.some((a) => a.q.profile.provider !== provider))
    issues.push("All payments in a run must use the same provider.");
  const state = issues.length ? "approval_needed" : "charging";
  await execute(
    db,
    `INSERT INTO funding_batches(order_id,provider,status,snapshot,grocery_cents,reward_cents,retry_until,takeover_until) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),snapshot=VALUES(snapshot),grocery_cents=VALUES(grocery_cents),reward_cents=VALUES(reward_cents),provider=VALUES(provider)`,
    [
      o.id,
      provider,
      state,
      JSON.stringify({ ...snap, issues }),
      pricing?.budgetCents ?? 0,
      pricing?.organizerCents ?? 0,
      new Date(now.getTime() + RETRY_MS),
      new Date(now.getTime() + RETRY_MS + TAKEOVER_MS),
    ],
  );
  await execute(db, "UPDATE orders SET status='locked' WHERE id=?", [o.id]);
  if (issues.length) {
    await notifyMembers(
      db,
      o.id,
      `${o.name}: shares closed. Review the funding and current approvals before payment can begin.`,
      `approval-needed:${o.id}`,
    );
    return;
  }
  await execute(
    db,
    "INSERT IGNORE INTO funding_revisions(order_id,revision,snapshot) VALUES(?,1,?)",
    [o.id, JSON.stringify(snap)],
  );
  for (const { approved, q } of approvals) {
    await instruction(
      db,
      o.id,
      q.details.memberId,
      q.details.lines,
      q.profile,
      "initial",
      approved.id,
    );
    await execute(db, "UPDATE payment_approvals SET status='used' WHERE id=?", [
      approved.id,
    ]);
  }
  await notifyMembers(
    db,
    o.id,
    `${o.name}: shares are closed. Approved payments are being collected; shopping waits for grocery funding.`,
    `scheduled-close:${o.id}`,
  );
}
export async function retryPayment(
  db: Pool,
  oid: string,
  uid: string,
  hash: string,
  amount: number,
  now = new Date(),
) {
  return transaction(db, async (c) => {
    const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
      oid,
    ]);
    const b = await first(c, "SELECT * FROM funding_batches WHERE order_id=?", [
      oid,
    ]);
    const i = await first(
      c,
      "SELECT * FROM funding_instructions WHERE order_id=? AND member_id=? AND status IN('failed','requires_action') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [oid, uid],
    );
    const supplement = i?.supplement_id
      ? await first(
          c,
          "SELECT created_at,status FROM funding_supplements WHERE id=?",
          [i.supplement_id],
        )
      : null;
    const until = supplement
      ? new Date(new Date(supplement.created_at).getTime() + RETRY_MS)
      : new Date(
          i?.purpose === "takeover" ? b?.takeover_until : b?.retry_until,
        );
    if (
      !o ||
      !b ||
      !i ||
      !(
        o.status === "locked" ||
        (o.status === "shopping" && i.purpose === "supplement")
      ) ||
      until <= now ||
      i.attempts >= RETRY_LIMIT ||
      supplement?.status === "cancelled"
    )
      fail(
        409,
        "RETRY_UNAVAILABLE",
        "The retry window ended. Check available shares or contact the organizer.",
      );
    const method = await profile(c, uid),
      details = {
        instructionId: i.id,
        lines: json(i.basket_lines),
        amount: i.total_cents,
        methodVersion: method?.method_version,
        methodId: method?.method_id,
      };
    if (
      !method?.ready ||
      hash !== fingerprint(details) ||
      amount !== i.total_cents
    )
      fail(
        409,
        "QUOTE_CHANGED",
        "Review and approve this exact recovery payment with your current card.",
      );
    await execute(
      c,
      "UPDATE funding_instructions SET status='queued',method=?,attempts=attempts+1,failure=NULL WHERE id=?",
      [JSON.stringify(method), i.id],
    );
    await enqueue(
      c,
      `charge:${i.id}:${i.attempts + 1}`,
      oid,
      i.id,
      b.provider,
      "charge",
      {
        instructionId: i.id,
        amount: i.total_cents,
        method,
        providerId: i.provider_id,
        lines: json(i.basket_lines),
      },
    );
  });
}
export async function openTakeover(db: DB, o: any, b: any, now: Date) {
  const failed = await rows(
    db,
    "SELECT * FROM funding_instructions WHERE order_id=? AND purpose<>'supplement' AND status IN('failed','requires_action','superseding')",
    [o.id],
  );
  let offered = false;
  for (const i of failed) {
    if (
      new Date(i.purpose === "takeover" ? b.takeover_until : b.retry_until) >
        now &&
      i.attempts < RETRY_LIMIT
    )
      continue;
    if (i.provider_id && i.status !== "superseding") {
      await execute(
        db,
        "UPDATE funding_instructions SET status='superseding' WHERE id=?",
        [i.id],
      );
      await enqueue(db, `cancel:${i.id}`, o.id, i.id, b.provider, "cancel", {
        providerId: i.provider_id,
        instructionId: i.id,
      });
      continue;
    }
    if (i.status === "superseding") continue;
    await execute(
      db,
      "UPDATE funding_instructions SET status='superseded' WHERE id=?",
      [i.id],
    );
    if (i.purpose === "takeover") {
      for (const t of await rows(
        db,
        "SELECT * FROM funding_takeovers WHERE instruction_id=? AND status='reserved'",
        [i.id],
      )) {
        const share = await first(
          db,
          "SELECT * FROM funding_shares WHERE id=? FOR UPDATE",
          [t.share_id],
        );
        const pool = remainingComponents(share),
          released = json(t.components),
          stored = json(share.components);
        const restored = Object.fromEntries(
          componentKeys.map((key) => [key, pool[key] + released[key]]),
        );
        await execute(
          db,
          "UPDATE funding_shares SET remaining=remaining+?,components=? WHERE id=?",
          [
            t.quantity,
            JSON.stringify({ ...stored, remainingComponents: restored }),
            t.share_id,
          ],
        );
        await execute(
          db,
          "UPDATE funding_takeovers SET status='released' WHERE id=?",
          [t.id],
        );
      }
      offered = true;
      continue;
    }
    for (const l of json<BasketLine[]>(i.basket_lines))
      await execute(
        db,
        "INSERT IGNORE INTO funding_shares(id,order_id,instruction_id,item_id,original_member_id,quantity,remaining,components) VALUES(?,?,?,?,?,?,?,?)",
        [
          id(),
          o.id,
          i.id,
          l.itemId,
          i.member_id,
          l.quantity,
          l.quantity,
          JSON.stringify(l),
        ],
      );
    offered = true;
  }
  if (
    offered ||
    (await first(
      db,
      "SELECT id FROM funding_shares WHERE order_id=? AND remaining>0 LIMIT 1",
      [o.id],
    ))
  ) {
    await execute(
      db,
      "UPDATE funding_batches SET status='takeover_open' WHERE order_id=?",
      [o.id],
    );
    await notifyMembers(
      db,
      o.id,
      `${o.name}: unpaid shares are available to claim. Open the group to see items, quantities and the takeover deadline. The organizer may also cover shares or cancel.`,
      `takeover-open:${o.id}`,
    );
  }
}
const componentKeys = [
  "groceryCents",
  "markupCents",
  "serviceFeeCents",
  "feeTaxCents",
  "totalCents",
] as const;
function remainingComponents(
  offer: any,
): Record<(typeof componentKeys)[number], number> {
  const line = json(offer.components);
  if (line.remainingComponents) return line.remainingComponents;
  const taken = Number(offer.quantity) - Number(offer.remaining);
  return Object.fromEntries(
    componentKeys.map((key) => [
      key,
      line[key] - Math.floor((line[key] * taken) / offer.quantity),
    ]),
  ) as Record<(typeof componentKeys)[number], number>;
}
export function offerComponents(offer: any, quantity: number): BasketLine {
  const stored = json(offer.components),
    pool = remainingComponents(offer);
  const { remainingComponents: _remaining, ...line } = stored;
  const allocated = Object.fromEntries(
    componentKeys
      .slice(0, 4)
      .map((key) => [
        key,
        Math.floor((pool[key] * quantity) / offer.remaining),
      ]),
  ) as Record<(typeof componentKeys)[number], number>;
  const totalCents =
    allocated.groceryCents +
    allocated.markupCents +
    allocated.serviceFeeCents +
    allocated.feeTaxCents;
  return { ...line, ...allocated, quantity, totalCents };
}
export async function claimTakeover(
  db: Pool,
  oid: string,
  uid: string,
  offerId: string,
  quantity: number,
  hash: string,
  amount: number,
  now = new Date(),
) {
  return transaction(db, async (c) => {
    const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
      oid,
    ]);
    const b = await first(c, "SELECT * FROM funding_batches WHERE order_id=?", [
      oid,
    ]);
    const offer = await first(
      c,
      "SELECT * FROM funding_shares WHERE id=? AND order_id=? FOR UPDATE",
      [offerId, oid],
    );
    const membership = await first(
      c,
      "SELECT user_id FROM memberships WHERE order_id=? AND user_id=?",
      [oid, uid],
    );
    if (
      !o ||
      !b ||
      o.status !== "locked" ||
      b.status !== "takeover_open" ||
      new Date(b.takeover_until) <= now ||
      !membership
    )
      fail(409, "TAKEOVER_CLOSED", "Shares cannot be claimed now.");
    if (
      !offer ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > offer.remaining
    )
      fail(
        409,
        "SHARES_CHANGED",
        "These shares were already claimed. Refresh the group.",
      );
    const own = uid === o.organizer_id,
      method = await profile(c, uid),
      line = offerComponents(offer, quantity);
    const details = {
      offerId,
      remaining: offer.remaining,
      quantity,
      line,
      memberId: uid,
      methodVersion: own ? null : method?.method_version,
      organizerOwned: own,
    };
    if (
      hash !== fingerprint(details) ||
      amount !== (own ? line.groceryCents : line.totalCents) ||
      (!own && !method?.ready)
    )
      fail(
        409,
        "QUOTE_CHANGED",
        "Review the current takeover quote and payment method.",
      );
    if (!own && method.provider !== b.provider)
      fail(409, "PROVIDER_MISMATCH", "Use the run’s payment provider.");
    const iid = own
      ? null
      : await instruction(
          c,
          oid,
          uid,
          [{ ...line, memberId: uid }],
          method,
          "takeover",
        );
    const pool = remainingComponents(offer),
      stored = json(offer.components);
    const remaining = Object.fromEntries(
      componentKeys.map((key) => [key, pool[key] - line[key]]),
    );
    await execute(
      c,
      "UPDATE funding_shares SET remaining=remaining-?,components=? WHERE id=?",
      [
        quantity,
        JSON.stringify({ ...stored, remainingComponents: remaining }),
        offer.id,
      ],
    );
    await execute(
      c,
      "INSERT INTO funding_takeovers(id,order_id,share_id,member_id,quantity,instruction_id,components,organizer_owned) VALUES(?,?,?,?,?,?,?,?)",
      [id(), oid, offer.id, uid, quantity, iid, JSON.stringify(line), own],
    );
    // Ownership changes only after payment succeeds (or explicit organizer-owned coverage).
    if (own) {
      await transferClaims(
        c,
        oid,
        offer.original_member_id,
        uid,
        line.itemId,
        quantity,
      );
      await execute(
        c,
        "UPDATE funding_takeovers SET status='paid' WHERE share_id=? AND member_id=? AND organizer_owned=TRUE",
        [offer.id, uid],
      );
      await execute(
        c,
        "UPDATE funding_batches SET organizer_confirmed=FALSE WHERE order_id=?",
        [oid],
      );
    }
    await appendRevision(c, oid);
    return { instructionId: iid, organizerOwned: own };
  });
}
export async function transferClaims(
  db: DB,
  oid: string,
  from: string,
  to: string,
  item: string,
  quantity: number,
) {
  const original = await first(
    db,
    "SELECT quantity FROM share_claims WHERE item_id=? AND user_id=? FOR UPDATE",
    [item, from],
  );
  if (!original || original.quantity < quantity)
    fail(
      409,
      "SHARES_CHANGED",
      "Original ownership no longer covers these shares.",
    );
  if (original.quantity === quantity)
    await execute(
      db,
      "DELETE FROM share_claims WHERE item_id=? AND user_id=?",
      [item, from],
    );
  else
    await execute(
      db,
      "UPDATE share_claims SET quantity=quantity-? WHERE item_id=? AND user_id=?",
      [quantity, item, from],
    );
  await execute(
    db,
    "INSERT INTO share_claims(item_id,user_id,quantity) VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)",
    [item, to, quantity],
  );
  await notify(
    db,
    from,
    oid,
    "Your unpaid shares were reassigned. You will not be charged for the reassigned items.",
    `reassigned:${item}:${from}:${to}:${quantity}`,
  );
}
export async function appendRevision(db: DB, oid: string) {
  const b = await first(db, "SELECT * FROM funding_batches WHERE order_id=?", [
    oid,
  ]);
  const own = await rows(
    db,
    "SELECT components FROM funding_takeovers WHERE order_id=? AND organizer_owned=TRUE AND status='paid'",
    [oid],
  );
  const original = json(b.snapshot).pricing?.budgetCents ?? b.grocery_cents;
  const grocery =
      original - own.reduce((n, x) => n + json(x.components).groceryCents, 0),
    reward = frozenRewardFor(grocery, json(b.snapshot).pricing);
  const snapshot = {
    original: json(b.snapshot),
    takeovers: await rows(
      db,
      "SELECT * FROM funding_takeovers WHERE order_id=?",
      [oid],
    ),
    groceryCents: grocery,
    rewardCents: reward,
  };
  await execute(
    db,
    "UPDATE funding_batches SET revision=revision+1,grocery_cents=?,reward_cents=? WHERE order_id=?",
    [grocery, reward, oid],
  );
  await execute(
    db,
    "INSERT INTO funding_revisions(order_id,revision,snapshot) VALUES(?,?,?)",
    [oid, b.revision + 1, JSON.stringify(snapshot)],
  );
}
export async function cancelFunding(db: DB, o: any, reason: string) {
  const b = await first(db, "SELECT * FROM funding_batches WHERE order_id=?", [
    o.id,
  ]);
  await invalidateApprovals(db, o.id);
  if (!b) return;
  await execute(
    db,
    "UPDATE funding_batches SET status='refund_pending' WHERE order_id=?",
    [o.id],
  );
  for (const i of await rows(
    db,
    "SELECT * FROM funding_instructions WHERE order_id=?",
    [o.id],
  )) {
    if (i.status === "paid") await refundTo(db, i, i.total_cents, reason);
    else if (!["refunded", "superseded", "refund_pending"].includes(i.status)) {
      if (i.provider_id)
        await enqueue(db, `cancel:${i.id}`, o.id, i.id, b.provider, "cancel", {
          providerId: i.provider_id,
          instructionId: i.id,
        });
      else if (["failed", "requires_action"].includes(i.status))
        await execute(
          db,
          "UPDATE funding_instructions SET status='superseded' WHERE id=?",
          [i.id],
        );
      // queued/processing/unknown charges are reconciled by the worker before cancellation completes.
    }
  }
  const bankPayouts = await rows(
    db,
    "SELECT * FROM funding_payouts WHERE order_id=? AND status='paid' AND purpose<>'completion_reward'",
    [o.id],
  );
  if (bankPayouts.length) {
    const advance = bankPayouts.reduce((n, p) => n + p.amount_cents, 0);
    await execute(
      db,
      "INSERT IGNORE INTO funding_advance_recoveries(order_id,organizer_id,amount_cents) VALUES(?,?,?)",
      [o.id, o.organizer_id, advance],
    );
    await notify(
      db,
      o.organizer_id,
      o.id,
      "This canceled run has grocery money already paid to your bank. Return the unused advance through support; new advances stay blocked until the return is verified.",
      `advance-recovery:${o.id}`,
    );
  }
  for (const op of await rows(
    db,
    "SELECT * FROM funding_operations WHERE order_id=? AND kind='transfer' AND status='succeeded'",
    [o.id],
  )) {
    const result = json(op.result);
    // A bank payout is not reversible by spending unrelated funds in the shared account.
    if (bankPayouts.length || !result?.id) continue;
    await enqueue(
      db,
      `reverse:${op.operation_key}`,
      o.id,
      op.owner_id,
      b.provider,
      "reversal",
      { transferId: result.id, amount: json(op.request).amount },
    );
  }
  await notifyMembers(
    db,
    o.id,
    `${o.name}: the run was canceled. Successful payments are being refunded; check your payment status for confirmation.`,
    `payment-cancel:${o.id}`,
  );
}
export async function refundTo(db: DB, i: any, target: number, reason: string) {
  target = Math.min(i.total_cents, Math.max(0, target));
  const pending = await rows(
    db,
    "SELECT request FROM funding_operations WHERE owner_id=? AND kind='refund' AND status NOT IN('failed','needs_attention')",
    [i.id],
  );
  const requested = pending.reduce((n, p) => n + json(p.request).amount, 0);
  const delta = target - requested;
  if (delta <= 0) return;
  const b = await first(
    db,
    "SELECT provider FROM funding_batches WHERE order_id=?",
    [i.order_id],
  );
  await enqueue(
    db,
    `refund:${i.id}:${target}`,
    i.order_id,
    i.id,
    b.provider,
    "refund",
    { instructionId: i.id, providerId: i.provider_id, amount: delta, reason },
  );
}
export async function reconcileReductions(db: DB, o: any, reason: string) {
  for (const i of await rows(
    db,
    "SELECT * FROM funding_instructions WHERE order_id=? AND status IN('paid','refund_pending')",
    [o.id],
  )) {
    let refund = 0;
    for (const l of json<BasketLine[]>(i.basket_lines)) {
      const item = await first(db, "SELECT * FROM order_items WHERE id=?", [
        l.itemId,
      ]);
      const current = item?.available
        ? Math.max(
            0,
            Math.round((item.price_cents * l.quantity) / item.shares_per_pack) -
              ((l as any).costBaseCents ?? 0),
          )
        : 0;
      const ratio = l.groceryCents
        ? Math.max(0, Math.min(1, (l.groceryCents - current) / l.groceryCents))
        : 0;
      refund +=
        Math.round(l.groceryCents * ratio) +
        Math.round(l.markupCents * ratio) +
        Math.round(l.serviceFeeCents * ratio) +
        Math.round(l.feeTaxCents * ratio);
    }
    await refundTo(db, i, refund, reason);
  }
}
export async function queuePayout(
  db: DB,
  o: any,
  purpose: "grocery" | "completion_reward",
) {
  const b = await first(db, "SELECT * FROM funding_batches WHERE order_id=?", [
    o.id,
  ]);
  if (!b) return;
  const amount = purpose === "grocery" ? b.grocery_cents : b.reward_cents;
  if (!amount) return;
  await execute(
    db,
    "INSERT IGNORE INTO funding_payouts(order_id,purpose,amount_cents,cost_cents) VALUES(?,?,?,?)",
    [o.id, purpose, amount, payoutCost(amount)],
  );
}
export async function progressFunding(db: Pool, now = new Date()) {
  for (const entry of await rows(
    db,
    "SELECT order_id FROM funding_batches WHERE status NOT IN('funded','cancelled','needs_attention')",
  ))
    await transaction(db, async (c) => {
      const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
          entry.order_id,
        ]),
        b = await first(c, "SELECT * FROM funding_batches WHERE order_id=?", [
          entry.order_id,
        ]);
      if (o.status === "cancelled" || new Date(b.takeover_until) <= now) {
        if (o.status !== "cancelled")
          await execute(c, "UPDATE orders SET status='cancelled' WHERE id=?", [
            o.id,
          ]);
        await cancelFunding(c, o, "the run could not recover its payments");
        return;
      }
      if (b.status === "approval_needed") {
        if (new Date(b.retry_until) <= now) {
          await execute(c, "UPDATE orders SET status='cancelled' WHERE id=?", [
            o.id,
          ]);
          await cancelFunding(c, o, "current approvals were not received");
        } else await prepareClose(c, o, now);
        return;
      }
      await openTakeover(c, o, b, now);
      const pending = await first(
        c,
        "SELECT COUNT(*) AS n FROM funding_instructions WHERE order_id=? AND status NOT IN('paid','superseded','refunded')",
        [o.id],
      );
      const shares = await first(
        c,
        "SELECT COALESCE(SUM(remaining),0) AS n FROM funding_shares WHERE order_id=?",
        [o.id],
      );
      if (Number(pending.n) || Number(shares.n) || !b.organizer_confirmed)
        return;
      const paid = await rows(
        c,
        "SELECT * FROM funding_instructions WHERE order_id=? AND status='paid'",
        [o.id],
      );
      const incoming = paid.reduce(
        (n, i) =>
          n +
          i.total_cents -
          i.refunded_cents -
          i.tax_cents -
          providerPercent(i.total_cents, PILOT_POLICY.cardPercentBps) -
          PILOT_POLICY.cardFixedCents,
        0,
      );
      const required =
        b.grocery_cents +
        b.reward_cents +
        payoutCost(b.grocery_cents) +
        payoutCost(b.reward_cents);
      if (!paid.length || incoming < required) {
        await execute(
          c,
          "UPDATE funding_batches SET status='payment_recovery' WHERE order_id=?",
          [o.id],
        );
        return;
      }
      await execute(
        c,
        "UPDATE funding_batches SET status='funding' WHERE order_id=?",
        [o.id],
      );
      await queuePayout(c, o, "grocery");
    });
}
