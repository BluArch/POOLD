import { fileURLToPath } from "node:url";
import type { Pool } from "mysql2/promise";
import { insertDraft } from "./order-model.js";
import { CATALOG, itemFromUnits, type ItemInput } from "@poold/contracts";
import { database, execute, transaction, first } from "./db.js";
import { passwordHash, token } from "./security.js";
export async function seed(db: Pool) {
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.HOSTED_DEMO_ENABLED !== "true" ||
      process.env.DEMO_ENABLED !== "true")
  )
    throw new Error(
      "Hosted seeding requires both HOSTED_DEMO_ENABLED=true and DEMO_ENABLED=true.",
    );
  for (const [key, name] of [
    ["maya", "Maya R."],
    ["jordan", "Jordan L."],
    ["alex", "Alex K."],
    ["priya", "Priya S."],
  ])
    await execute(
      db,
      "INSERT IGNORE INTO users(id,email,name,password_hash,verified,demo) VALUES(?,?,?,?,TRUE,?)",
      [
        `demo-${key}`,
        `${key}@demo.poold.invalid`,
        name,
        await passwordHash(token()),
        key === "maya",
      ],
    );
  // Keep other sample organizers as data actors, without demo sign-in access.
  // Retire old demo sessions without deleting their orders or collection history.
  await transaction(db, async (c) => {
    await execute(
      c,
      "DELETE s FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.id IN ('demo-jordan','demo-alex','demo-priya') AND u.demo=TRUE",
    );
    await execute(
      c,
      "UPDATE users SET demo=FALSE WHERE id IN ('demo-jordan','demo-alex','demo-priya')",
    );
  });
  // Sample groups use sealed multipacks, so every share is clearly described
  // ("1 share = 4 boxes") and nothing has to be opened to split it.
  const pick = (key: string, shareUnits: number) => {
    const c = CATALOG.find((x) => x.key === key)!;
    return itemFromUnits({
      ...c,
      shareUnits,
      packCount: 1,
      catalogKey: c.key,
    });
  };
  const samples: [
    string,
    string,
    string,
    "community" | "quick",
    ItemInput[],
  ][] = [
    [
      "Campus pantry run",
      "Costco",
      "maya",
      "community",
      [
        pick("kd-24", 4),
        pick("aylmer-tomatoes-8", 2),
        pick("rice-krispies-54", 9),
      ],
    ],
    [
      "Roommate restock",
      "Costco",
      "jordan",
      "community",
      [
        pick("ziploc-sandwich-4", 1),
        pick("dove-16", 4),
        pick("sensodyne-4", 1),
      ],
    ],
    [
      "Saturday essentials",
      "Costco",
      "priya",
      "community",
      [pick("sapporo-24", 6), pick("goldfish-24", 6), pick("coke-32", 8)],
    ],
    [
      "Split a box of Clif bars",
      "Costco",
      "maya",
      "quick",
      [pick("clif-10", 5)],
    ],
  ];
  for (const [name, store, who, kind, items] of samples) {
    const existing = await first(
      db,
      "SELECT id,status,deadline FROM orders WHERE name=? AND organizer_id=?",
      [name, `demo-${who}`],
    );
    // Keep sample groups that are still joinable or mid-way through (so a
    // demo in progress isn't wiped). Replace ones that expired or finished,
    // so every account always has open groups to browse.
    const stale =
      existing &&
      (["completed", "cancelled", "locked"].includes(existing.status) ||
        (existing.status === "open" &&
          new Date(existing.deadline).getTime() < Date.now() + 6 * 3600000));
    if (existing && !stale) continue;
    if (existing) {
      await execute(db, "DELETE FROM collection_tokens WHERE order_id=?", [
        existing.id,
      ]);
      await execute(db, "DELETE FROM orders WHERE id=?", [existing.id]);
    }
    const at = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
    await transaction(db, async (c) => {
      const oid = await insertDraft(
        c,
        {
          name,
          store,
          kind,
          visibility: "public",
          maxMembers: 6,
          // Three days to join, so sample groups last through a class demo.
          deadline: at(72),
          purchaseAt: at(74),
          pickupAt: at(76),
          pickupEnd: at(78),
          pickupLocation: "UVic SUB main lobby",
          pickupLat: 48.4649,
          pickupLng: -123.3089,
          publicPickup: true,
          cadence: "once",
          items,
        },
        `demo-${who}`,
      );
      // Samples don't count toward the weekly limit (no published_at).
      await execute(c, "UPDATE orders SET status='open' WHERE id=?", [oid]);
      // Organizers always take a share of their own run.
      await execute(
        c,
        "INSERT INTO share_claims(item_id,user_id,quantity) SELECT id,?,1 FROM order_items WHERE order_id=? ORDER BY name LIMIT 1",
        [`demo-${who}`, oid],
      );
    });
  }
  // Sample buyers already have a test card saved; Maya adds hers in the app.
  for (const [who, last4] of [
    ["jordan", "4242"],
    ["alex", "4444"],
    ["priya", "4242"],
  ])
    await execute(
      db,
      "INSERT IGNORE INTO payment_methods(user_id,brand,last4,outcome) VALUES(?,?,?,'ok')",
      [`demo-${who}`, last4 === "4444" ? "Mastercard" : "Visa", last4],
    );
  console.log("Demo account ready: Maya.");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = database();
  try {
    await seed(db);
  } finally {
    await db.end();
  }
}
