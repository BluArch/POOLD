import { fileURLToPath } from "node:url";
import type { Pool } from "mysql2/promise";
import { insertDraft } from "./order-model.js";
import { CATALOG, itemFromUnits, type ItemInput } from "@poold/contracts";
import { database, execute, transaction, first } from "./db.js";
import { passwordHash, token, id } from "./security.js";
export async function seed(db: Pool) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seeding is disabled in production.");
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
      await execute(c, "UPDATE orders SET status='open' WHERE id=?", [oid]);
    });
  }
  // Sample wishlists: things buyers want that still need an organizer.
  const wishes: [string, string, string, string[]][] = [
    [
      "Snack run for finals week",
      "jordan",
      "Stocking up for exams. Anyone want to split?",
      ["goldfish-24", "nutri-grain-40", "welchs-60", "mccafe-4"],
    ],
    [
      "Bathroom basics",
      "priya",
      "Our floor keeps running out of these.",
      ["lysol-toilet-4", "crest-scope-5", "head-shoulders-2"],
    ],
    ["Pantry staples", "alex", "", ["kd-24", "green-giant-corn-12", "oats-2"]],
  ];
  for (const [title, who, note, keys] of wishes) {
    if (
      await first(
        db,
        "SELECT id FROM wishlists WHERE title=? AND creator_id=? AND status='open'",
        [title, `demo-${who}`],
      )
    )
      continue;
    await transaction(db, async (c) => {
      const wid = id();
      await execute(
        c,
        "INSERT INTO wishlists(id,creator_id,title,store,pickup_location,note) VALUES(?,?,?,?,?,?)",
        [wid, `demo-${who}`, title, "Costco", "UVic SUB main lobby", note],
      );
      const fans = ["jordan", "priya", "alex"].filter((x) => x !== who);
      for (const u of [who, ...fans.slice(0, keys.length > 3 ? 2 : 1)])
        await execute(
          c,
          "INSERT IGNORE INTO wishlist_members(wishlist_id,user_id) VALUES(?,?)",
          [wid, `demo-${u}`],
        );
      for (const [n, key] of keys.entries()) {
        const item = CATALOG.find((x) => x.key === key)!;
        const iid = id();
        await execute(
          c,
          "INSERT INTO wishlist_items(id,wishlist_id,name,catalog_key,added_by) VALUES(?,?,?,?,?)",
          [iid, wid, item.name, item.key, `demo-${who}`],
        );
        const wanters = [who, ...fans.slice(0, n % 3)];
        for (const u of wanters)
          await execute(
            c,
            "INSERT IGNORE INTO wishlist_members(wishlist_id,user_id) VALUES(?,?)",
            [wid, `demo-${u}`],
          );
        for (const u of wanters)
          await execute(
            c,
            "INSERT IGNORE INTO wishlist_wants(item_id,user_id) VALUES(?,?)",
            [iid, `demo-${u}`],
          );
      }
    });
  }
  console.log("Local demo account ready: Maya.");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = database();
  try {
    await seed(db);
  } finally {
    await db.end();
  }
}
