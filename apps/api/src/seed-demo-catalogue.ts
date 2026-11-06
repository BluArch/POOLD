/** Generated class-project examples. Names and prices are not retailer observations. */
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { plural, type CatalogItem } from "@poold/contracts";
import { database } from "./db.js";
import { importCatalogue } from "./import-catalogue.js";

type Category = CatalogItem["category"];
type DemoItem = [
  name: string,
  category: Category,
  unit: string,
  units: number,
  detail: string,
  cents: number,
];
const products: DemoItem[] = [
  ["Long-grain rice", "Pantry", "bag", 1, "5 kg", 1599],
  ["Jasmine rice", "Pantry", "bag", 1, "5 kg", 1899],
  ["Brown rice", "Pantry", "bag", 1, "2 kg", 1099],
  ["All-purpose flour", "Pantry", "bag", 1, "5 kg", 1199],
  ["Whole wheat flour", "Pantry", "bag", 1, "2 kg", 899],
  ["White sugar", "Pantry", "bag", 1, "2 kg", 699],
  ["Brown sugar", "Pantry", "bag", 1, "1 kg", 599],
  ["Dry red lentils", "Pantry", "bag", 1, "2 kg", 1199],
  ["Dry black beans", "Pantry", "bag", 1, "2 kg", 1099],
  ["Peanut butter", "Pantry", "jar", 2, "1 kg each", 1499],
  ["Sunflower oil", "Pantry", "bottle", 1, "3 L", 1599],
  ["Olive oil", "Pantry", "bottle", 1, "2 L", 2699],
  ["Tomato paste", "Canned goods", "can", 12, "156 mL each", 1399],
  ["Chickpeas", "Canned goods", "can", 12, "540 mL each", 1899],
  ["Kidney beans", "Canned goods", "can", 12, "540 mL each", 1899],
  ["Diced tomatoes", "Canned goods", "can", 12, "796 mL each", 2099],
  ["Canned corn", "Canned goods", "can", 12, "341 mL each", 1699],
  ["Canned tuna", "Canned goods", "can", 8, "170 g each", 1799],
  ["Penne pasta", "Noodles & pasta", "bag", 8, "500 g each", 1399],
  ["Spaghetti", "Noodles & pasta", "bag", 8, "500 g each", 1399],
  ["Macaroni", "Noodles & pasta", "bag", 8, "500 g each", 1399],
  ["Rice noodles", "Noodles & pasta", "bag", 4, "400 g each", 1299],
  ["Tomato pasta sauce", "Noodles & pasta", "jar", 6, "650 mL each", 2099],
  ["Instant noodles", "Noodles & pasta", "pack", 24, "one serving each", 1699],
  ["Rolled oats", "Breakfast", "bag", 1, "2 kg", 1099],
  ["Granola", "Breakfast", "bag", 2, "750 g each", 1599],
  ["Wheat cereal", "Breakfast", "box", 2, "1 kg each", 1499],
  ["Pancake mix", "Breakfast", "bag", 1, "2 kg", 1099],
  ["Maple syrup", "Breakfast", "bottle", 1, "1 L", 1899],
  ["Fruit bars", "Snacks", "bar", 36, "one serving each", 2399],
  ["Granola bars", "Snacks", "bar", 40, "one serving each", 2399],
  ["Potato chips", "Snacks", "bag", 12, "200 g each", 2499],
  ["Crackers", "Snacks", "box", 6, "400 g each", 1599],
  ["Trail mix", "Snacks", "bag", 2, "1 kg each", 2699],
  ["Roasted peanuts", "Snacks", "bag", 2, "1 kg each", 1799],
  ["Ground coffee", "Drinks & coffee", "bag", 2, "1 kg each", 3499],
  ["Black tea", "Drinks & coffee", "box", 1, "100 bags", 1099],
  ["Green tea", "Drinks & coffee", "box", 1, "100 bags", 1199],
  ["Sparkling water", "Drinks & coffee", "can", 24, "355 mL each", 1799],
  ["Bottled water", "Drinks & coffee", "bottle", 24, "500 mL each", 1099],
  ["Orange juice", "Drinks & coffee", "jug", 2, "2 L each", 1499],
  ["Dish soap", "Household", "bottle", 2, "1 L each", 1199],
  ["Laundry detergent", "Household", "jug", 1, "4 L", 2499],
  ["Dishwasher tablets", "Household", "tablet", 90, "one wash each", 2699],
  ["Paper towels", "Household", "roll", 12, "one roll each", 2499],
  ["Toilet paper", "Household", "roll", 24, "one roll each", 2799],
  ["Facial tissues", "Household", "box", 12, "one box each", 2299],
  ["Kitchen garbage bags", "Household", "bag", 100, "one bag each", 2199],
  ["Cleaning sponges", "Household", "sponge", 12, "one sponge each", 1199],
  ["All-purpose cleaner", "Household", "bottle", 3, "750 mL each", 1499],
  ["Food storage bags", "Household", "bag", 100, "one bag each", 1699],
  ["Hand soap", "Personal care", "bottle", 2, "1 L each", 1499],
  ["Toothpaste", "Personal care", "tube", 6, "one tube each", 1999],
  ["Shampoo", "Personal care", "bottle", 2, "1 L each", 1999],
  ["Conditioner", "Personal care", "bottle", 2, "1 L each", 1999],
  ["Body wash", "Personal care", "bottle", 2, "1 L each", 1899],
];
const bulkWeight: [name: string, centsPer100g: number][] = [
  ["Whole almonds", 329],
  ["Cashews", 349],
  ["Walnuts", 299],
  ["Pumpkin seeds", 249],
  ["Sunflower seeds", 139],
  ["Chia seeds", 269],
  ["Flax seeds", 119],
  ["Raisins", 119],
  ["Dried cranberries", 229],
  ["Dried apricots", 259],
  ["Dark chocolate chips", 269],
  ["Milk chocolate chips", 249],
  ["Coconut flakes", 199],
  ["Rolled oats", 79],
  ["Red lentils", 109],
  ["Chickpeas", 109],
  ["Brown rice", 89],
  ["Jasmine rice", 99],
  ["Granola mix", 159],
  ["Trail mix", 229],
  ["Popping corn", 69],
  ["Baking cocoa", 249],
  ["Cinnamon", 299],
  ["Curry powder", 259],
];
const shops = [
  {
    retailerId: "costco",
    channel: "warehouse",
    multiplier: 100,
    branches: ["00000000-0000-4000-8000-000000000256"],
  },
  {
    retailerId: "wholesale-club",
    channel: "store",
    multiplier: 97,
    branches: ["00000000-0000-4000-8000-000000000001"],
  },
  {
    retailerId: "bulk-barn",
    channel: "store",
    multiplier: 103,
    branches: [
      "00000000-0000-4000-8000-000000000661",
      "00000000-0000-4000-8000-000000000672",
      "00000000-0000-4000-8000-000000000773",
    ],
  },
  {
    retailerId: "walmart",
    channel: "store",
    multiplier: 108,
    branches: [
      "00000000-0000-4000-8000-000000003109",
      "00000000-0000-4000-8000-000000001214",
      "00000000-0000-4000-8000-000000003188",
    ],
  },
] as const;

export async function seedDemoCatalogue() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error(
      "Demo catalogue seeding is limited to a local development database.",
    );
  const db = database(),
    folder = await mkdtemp(join(tmpdir(), "poold-demo-catalogue-"));
  try {
    const at = "2026-11-05T00:00:00.000Z";
    for (const shop of shops) {
      const rows = products.map(
        ([name, category, unit, packUnits, detail, cents], index) => ({
          sourceProductId: `demo-${index + 1}`,
          name,
          sourceCategory: category,
          packLabel: `${plural(packUnits, unit)} (${detail})`,
          unit,
          packUnits,
          unitDetail: detail,
          offers: shop.branches.map((locationId) => ({
            locationId,
            sourceOfferId: `demo-${index + 1}`,
            priceBasis: "pack",
            priceCents: Math.round((cents * shop.multiplier) / 100),
            taxIncluded: true,
            availability: "unknown",
            observedAt: at,
            evidence:
              "Synthetic class-project estimate; no retailer observation.",
          })),
        }),
      );
      if (shop.retailerId === "bulk-barn")
        for (const [index, [name, cents]] of bulkWeight.entries())
          rows.push({
            sourceProductId: `demo-weight-${index + 1}`,
            name,
            sourceCategory: "Pantry",
            packLabel: "1000 g planned purchase",
            unit: "g",
            packUnits: 1000,
            unitDetail: "loose bulk food",
            offers: shop.branches.map((locationId) => ({
              locationId,
              sourceOfferId: `demo-weight-${index + 1}`,
              priceBasis: "100g",
              priceCents: cents,
              taxIncluded: true,
              availability: "unknown",
              observedAt: at,
              evidence:
                "Synthetic class-project estimate; no retailer observation.",
            })),
          });
      const manifest = join(folder, `${shop.retailerId}.json`),
        file = join(folder, `${shop.retailerId}.jsonl`);
      await writeFile(
        manifest,
        JSON.stringify({
          retailerId: shop.retailerId,
          sourceName: "POOLD class demo",
          channel: shop.channel,
          accessMethod: "synthetic-demo",
          coverageNote: `${rows.length} generated examples; no claim of retailer catalogue coverage`,
          rightsNote:
            "Generated for this class project; not sourced from retailer product or price data.",
          confirmedStorageRights: true,
          retainSourceData: false,
          retainImageReferences: false,
          scope: "class demo seed",
          full: false,
          expectedCount: null,
          categoryMapping: Object.fromEntries(
            products.map((x) => [x[1], x[1]]),
          ),
        }),
      );
      await writeFile(
        file,
        rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
      );
      await importCatalogue(db, manifest, file);
      console.log(
        `${shop.retailerId}: ${rows.length} demo products, ${rows.length * shop.branches.length} branch offers`,
      );
    }
  } finally {
    await db.end();
    await rm(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await seedDemoCatalogue();
