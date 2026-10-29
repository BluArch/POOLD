import { fileURLToPath } from "node:url";
import type { Pool } from "mysql2/promise";
import { insertDraft } from "./order-model.js";
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
  for (const [name, store, who, kind] of [
    ["Campus pantry run", "Costco", "maya", "community"],
    ["Roommate restock", "Walmart", "jordan", "community"],
    ["Saturday essentials", "Costco", "priya", "community"],
    ["A tray of eggs", "Costco", "maya", "quick"],
  ] as const) {
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
          items: [
            {
              name: "Eggs",
              category: "Chilled",
              packLabel: "30 eggs",
              shareLabel: "6 eggs",
              sharesPerPack: 5,
              packCount: 1,
              priceCents: 1299,
              referenceShareCents: null,
              storage: "Keep refrigerated. Bring a clean carton.",
              portioning: "Pack 6 eggs in each labeled carton.",
            },
            ...(kind === "community"
              ? [
                  {
                    name: "Jasmine rice",
                    category: "Pantry",
                    packLabel: "8 kg bag",
                    shareLabel: "1 kg",
                    sharesPerPack: 8,
                    packCount: 1,
                    priceCents: 2199,
                    referenceShareCents: null,
                    storage: "Store dry in a sealed container.",
                    portioning: "Weigh 1 kg per share.",
                  },
                ]
              : []),
          ],
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
