import { fileURLToPath } from "node:url";
import type { Pool } from "mysql2/promise";
import { insertDraft } from "./order-model.js";
import { CATALOG, itemFromUnits, type ItemInput } from "@poold/contracts";
import { database, execute, transaction, first } from "./db.js";
import { passwordHash, token } from "./security.js";
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
    if (
      await first(db, "SELECT id FROM orders WHERE name=? AND organizer_id=?", [
        name,
        `demo-${who}`,
      ])
    )
      continue;
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
          deadline: at(24),
          purchaseAt: at(26),
          pickupAt: at(28),
          pickupEnd: at(30),
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
