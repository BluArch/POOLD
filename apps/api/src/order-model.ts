import type {
  OrderInput,
  OrderSummary,
  OrderView,
  Item,
  Claim,
  Member,
} from "@poold/contracts";
import type { DB } from "./db.js";
import { first, rows, execute, iso } from "./db.js";
import { fail } from "./errors.js";
import { hash, id, token } from "./security.js";
export async function getOrder(
  db: DB,
  oid: string,
  uid: string,
  invite?: string,
  lock = false,
) {
  const o = await first(
    db,
    `SELECT * FROM orders WHERE id=?${lock ? " FOR UPDATE" : ""}`,
    [oid],
  );
  if (!o) fail(404, "NOT_FOUND", "Order not found.");
  const invited = await first(
    db,
    "SELECT user_id FROM order_invitations WHERE order_id=? AND user_id=?",
    [oid, uid],
  );
  const member = await first(
    db,
    "SELECT * FROM memberships WHERE order_id=? AND user_id=?",
    [oid, uid],
  );
  if (
    o.organizer_id !== uid &&
    (o.status === "draft" ||
      (o.visibility === "private" &&
        !member &&
        !invited &&
        (!invite || hash(invite) !== o.invite_hash)))
  )
    fail(
      404,
      "INVITE_REQUIRED",
      "This order requires a valid invite or membership.",
    );
  return o;
}
export function owner(o: any, uid: string) {
  if (o.organizer_id !== uid)
    fail(403, "ORGANIZER_ONLY", "Only the organizer can do that.");
}
export const estimate = (price: number, quantity: number, shares: number) =>
  Math.floor((price * quantity + Math.floor(shares / 2)) / shares);
export async function summary(
  db: DB,
  o: any,
  uid: string,
): Promise<OrderSummary> {
  const stats = await first(
    db,
    `SELECT (SELECT COUNT(*) FROM memberships WHERE order_id=?) AS member_count,(SELECT name FROM users WHERE id=?) AS organizer_name,EXISTS(SELECT 1 FROM memberships WHERE order_id=? AND user_id=?) AS joined,(SELECT GROUP_CONCAT(name ORDER BY name SEPARATOR ' · ') FROM order_items WHERE order_id=? AND available=TRUE) AS preview`,
    [o.id, o.organizer_id, o.id, uid, o.id],
  );
  return {
    id: o.id,
    name: o.name,
    store: o.store,
    kind: o.kind,
    visibility: o.visibility,
    status: o.status,
    deadline: iso(o.deadline),
    purchaseAt: iso(o.purchase_at),
    pickupAt: iso(o.pickup_at),
    pickupEnd: iso(o.pickup_end),
    pickupLocation: o.pickup_location,
    pickupLat: o.pickup_lat,
    pickupLng: o.pickup_lng,
    maxMembers: o.max_members,
    memberCount: Number(stats.member_count),
    organizerName: stats.organizer_name,
    organizerId: o.organizer_id,
    joined: !!stats.joined,
    preview: stats.preview ?? "",
    cadence: o.cadence,
    revision: o.revision,
  };
}
export async function orderView(
  db: DB,
  o: any,
  uid: string,
): Promise<OrderView> {
  const its = await rows(
    db,
    `SELECT i.*,COALESCE((SELECT SUM(quantity) FROM share_claims c WHERE c.item_id=i.id),0) AS claimed,COALESCE((SELECT quantity FROM share_claims c WHERE c.item_id=i.id AND c.user_id=?),0) AS mine FROM order_items i WHERE order_id=? ORDER BY name`,
    [uid, o.id],
  );
  const items: Item[] = its.map((i) => {
    const claimed = Number(i.claimed),
      packs = Math.ceil(claimed / i.shares_per_pack);
    return {
      id: i.id,
      name: i.name,
      category: i.category,
      packLabel: i.pack_label,
      shareLabel: i.share_label,
      sharesPerPack: i.shares_per_pack,
      packCount: i.pack_count,
      priceCents: i.price_cents,
      originalPriceCents: i.original_price_cents,
      referenceShareCents: i.reference_share_cents,
      storage: i.storage,
      portioning: i.portioning,
      available: !!i.available,
      bought: !!i.bought,
      shortfallDecision: i.shortfall_decision,
      claimed,
      mine: Number(i.mine),
      remaining: i.pack_count * i.shares_per_pack - claimed,
      shareEstimateCents: estimate(i.price_cents, 1, i.shares_per_pack),
      requiredPacks: packs,
      shortfall: packs * i.shares_per_pack - claimed,
      unit: i.unit ?? null,
      packUnits: i.pack_units ?? null,
      shareUnits: i.share_units ?? null,
      catalogKey: i.catalog_key ?? null,
    };
  });
  const claimFor = (i: Item, quantity: number): Claim => ({
    itemId: i.id,
    name: i.name,
    shareLabel: i.shareLabel,
    quantity,
    estimateCents: i.available
      ? estimate(i.priceCents, quantity, i.sharesPerPack)
      : 0,
    available: i.available,
    portioning: i.portioning,
  });
  const myClaims = items
    .filter((i) => i.mine > 0)
    .map((i) => claimFor(i, i.mine));
  const ms = await rows(
    db,
    `SELECT m.*,u.name,u.photo,(u.verified AND u.email LIKE '%@uvic.ca') AS university,(SELECT COUNT(*) FROM memberships mc JOIN orders oc ON oc.id=mc.order_id WHERE mc.user_id=u.id AND (mc.collected_at IS NOT NULL OR oc.organizer_id=u.id) AND oc.status='completed') AS completed FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.order_id=?`,
    [o.id],
  );
  const members: Member[] = [];
  for (const m of ms) {
    if (o.organizer_id !== uid && m.user_id !== uid) continue;
    const cs = await rows(
      db,
      "SELECT c.item_id,c.quantity FROM share_claims c JOIN order_items i ON i.id=c.item_id WHERE i.order_id=? AND c.user_id=?",
      [o.id, m.user_id],
    );
    const claims = cs.map((c) =>
      claimFor(
        items.find((i) => i.id === c.item_id)!,
        c.quantity,
      ),
    );
    members.push({
      userId: m.user_id,
      name: m.name,
      photo: m.photo,
      university: !!m.university,
      completed: Number(m.completed),
      attending: !!m.attending,
      arrived: !!m.arrived,
      packed: !!m.packed,
      collectedAt: m.collected_at ? iso(m.collected_at) : null,
      claims,
      estimateCents: claims.reduce((n, c) => n + c.estimateCents, 0),
    });
  }
  const ct = await first(
    db,
    "SELECT code FROM collection_tokens WHERE order_id=? AND user_id=? AND used_at IS NULL",
    [o.id, uid],
  );
  return {
    order: await summary(db, o, uid),
    items,
    myClaims,
    myEstimateCents: myClaims.reduce((n, c) => n + c.estimateCents, 0),
    mine: members.find((m) => m.userId === uid) ?? null,
    members: o.organizer_id === uid ? members : [],
    isOrganizer: o.organizer_id === uid,
    ...(o.organizer_id === uid ? { inviteToken: o.invite_token } : {}),
    ...(ct && o.status === "ready" ? { collectionCode: ct.code } : {}),
  };
}
export async function insertDraft(db: DB, b: OrderInput, uid: string) {
  const oid = id(),
    raw = token();
  await execute(
    db,
    `INSERT INTO orders(id,organizer_id,name,store,kind,visibility,deadline,purchase_at,pickup_at,pickup_end,pickup_location,pickup_lat,pickup_lng,public_pickup,max_members,cadence,invite_hash,invite_token) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      oid,
      uid,
      b.name,
      b.store,
      b.kind,
      b.visibility,
      new Date(b.deadline),
      new Date(b.purchaseAt),
      new Date(b.pickupAt),
      new Date(b.pickupEnd),
      b.pickupLocation,
      b.pickupLat,
      b.pickupLng,
      true,
      b.maxMembers,
      b.cadence,
      hash(raw),
      raw,
    ],
  );
  await insertItems(db, oid, b.items);
  await execute(db, "INSERT INTO memberships(order_id,user_id) VALUES(?,?)", [
    oid,
    uid,
  ]);
  return oid;
}
export async function insertItems(
  db: DB,
  oid: string,
  items: OrderInput["items"],
) {
  for (const i of items)
    await execute(
      db,
      `INSERT INTO order_items(id,order_id,name,category,pack_label,share_label,shares_per_pack,pack_count,price_cents,original_price_cents,reference_share_cents,storage,portioning,unit,pack_units,share_units,catalog_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id(),
        oid,
        i.name,
        i.category,
        i.packLabel,
        i.shareLabel,
        i.sharesPerPack,
        i.packCount,
        i.priceCents,
        i.priceCents,
        i.referenceShareCents,
        i.storage,
        i.portioning,
        i.unit ?? null,
        i.packUnits ?? null,
        i.shareUnits ?? null,
        i.catalogKey ?? null,
      ],
    );
}
export function validateFuture(b: OrderInput) {
  if (Date.parse(b.deadline) <= Date.now())
    fail(400, "PAST_DEADLINE", "Choose a deadline in the future.");
}
