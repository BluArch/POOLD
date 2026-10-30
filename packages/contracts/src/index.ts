import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
export const itemInput = z
  .object({
    name: text(100),
    category: text(40).default("Pantry"),
    packLabel: text(60),
    shareLabel: text(60),
    sharesPerPack: z.number().int().min(1).max(1000),
    packCount: z.number().int().min(1).max(100),
    priceCents: z.number().int().min(1).max(1000000),
    referenceShareCents: z
      .number()
      .int()
      .min(1)
      .max(1000000)
      .nullable()
      .default(null),
    storage: z.string().trim().max(180).default(""),
    portioning: z.string().trim().max(240).default(""),
    /** Optional structure: a pack of `packUnits` sealed units, `shareUnits` per share. */
    unit: z.string().trim().min(1).max(30).nullable().default(null),
    packUnits: z.number().int().min(1).max(10000).nullable().default(null),
    shareUnits: z.number().int().min(1).max(10000).nullable().default(null),
    catalogKey: z.string().trim().max(60).nullable().default(null),
  })
  .superRefine((i, ctx) => {
    const given = [i.unit, i.packUnits, i.shareUnits].filter((v) => v !== null);
    if (given.length && given.length !== 3)
      ctx.addIssue({
        code: "custom",
        message: `${i.name}: give the unit, units per pack and units per share together.`,
      });
    if (i.packUnits !== null && i.shareUnits !== null) {
      if (i.shareUnits > i.packUnits)
        ctx.addIssue({
          code: "custom",
          message: `${i.name}: a share can’t be bigger than the whole pack.`,
        });
      else if (i.packUnits % i.shareUnits !== 0)
        ctx.addIssue({
          code: "custom",
          message: `${i.name}: ${i.packUnits} can’t be split evenly into shares of ${i.shareUnits}.`,
        });
      else if (i.sharesPerPack !== i.packUnits / i.shareUnits)
        ctx.addIssue({
          code: "custom",
          message: `${i.name}: shares per pack must be ${i.packUnits / i.shareUnits} (${i.packUnits} ÷ ${i.shareUnits}).`,
        });
    }
  });
export const orderInput = z
  .object({
    name: text(80),
    store: text(80),
    kind: z.enum(["community", "quick"]).default("community"),
    visibility: z.enum(["public", "private"]).default("public"),
    deadline: z.iso.datetime({ offset: true }),
    purchaseAt: z.iso.datetime({ offset: true }),
    pickupAt: z.iso.datetime({ offset: true }),
    pickupEnd: z.iso.datetime({ offset: true }),
    pickupLocation: text(160),
    pickupLat: z.number().min(-90).max(90).nullable().default(null),
    pickupLng: z.number().min(-180).max(180).nullable().default(null),
    publicPickup: z.literal(true),
    maxMembers: z.number().int().min(2).max(10).default(6),
    cadence: z.enum(["once", "weekly", "monthly"]).default("once"),
    items: z.array(itemInput).min(1).max(30),
  })
  .superRefine((b, ctx) => {
    if (!(
      Date.parse(b.deadline) <= Date.parse(b.purchaseAt) &&
      Date.parse(b.purchaseAt) <= Date.parse(b.pickupAt) &&
      Date.parse(b.pickupAt) < Date.parse(b.pickupEnd)
    ))
      ctx.addIssue({
        code: "custom",
        message:
          "Dates must follow deadline → purchase → pickup start → pickup end.",
      });
    if (b.kind === "quick" && b.items.length !== 1)
      ctx.addIssue({
        code: "custom",
        message: "A quick split must contain exactly one item.",
      });
    if ((b.pickupLat === null) !== (b.pickupLng === null))
      ctx.addIssue({
        code: "custom",
        message: "Provide both pickup coordinates or neither.",
      });
  });
export const claimsInput = z
  .object({
    revision: z.number().int().positive(),
    attending: z.boolean(),
    claims: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          quantity: z.number().int().min(0).max(100000),
        }),
      )
      .max(30),
  })
  .superRefine((b, c) => {
    if (b.claims.some((i) => i.quantity > 0) && !b.attending)
      c.addIssue({
        code: "custom",
        message: "Confirm that you can attend pickup.",
      });
    if (new Set(b.claims.map((i) => i.itemId)).size !== b.claims.length)
      c.addIssue({ code: "custom", message: "Choose each item only once." });
  });
export const profileInput = z
  .object({
    name: text(60),
    photo: z.string().max(180000).nullable().default(null),
  })
  .refine(
    (b) =>
      !b.photo ||
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.photo),
    "Choose a small PNG, JPEG or WebP photo.",
  );
export const registerInput = z.object({
  name: z
    .string({ error: "Enter your display name." })
    .trim()
    .min(1, "Enter your display name.")
    .max(60, "Your display name must be 60 characters or fewer."),
  email: z
    .email({ error: "Enter a valid email address, like name@example.com." })
    .max(254, "Your email address must be 254 characters or fewer.")
    .transform((s) => s.toLowerCase()),
  password: z
    .string({ error: "Enter a password with at least 8 characters." })
    .min(8, "Your password must be at least 8 characters long.")
    .max(128, "Your password must be 128 characters or fewer."),
});
export const loginInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
  native: z.boolean().optional(),
});
export type OrderInput = z.infer<typeof orderInput>;
export type ItemInput = z.infer<typeof itemInput>;
export type Status =
  | "draft"
  | "open"
  | "locked"
  | "shopping"
  | "ready"
  | "completed"
  | "cancelled";
export interface User {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  university: boolean;
  photo: string | null;
  demo: boolean;
  completed: number;
}
export interface OrderSummary {
  id: string;
  name: string;
  store: string;
  kind: "community" | "quick";
  visibility: "public" | "private";
  status: Status;
  deadline: string;
  purchaseAt: string;
  pickupAt: string;
  pickupEnd: string;
  pickupLocation: string;
  pickupLat: number | null;
  pickupLng: number | null;
  maxMembers: number;
  memberCount: number;
  organizerName: string;
  organizerId: string;
  joined: boolean;
  preview: string;
  cadence: "once" | "weekly" | "monthly";
  revision: number;
}
export interface Item {
  id: string;
  name: string;
  category: string;
  packLabel: string;
  shareLabel: string;
  sharesPerPack: number;
  packCount: number;
  priceCents: number;
  originalPriceCents: number;
  referenceShareCents: number | null;
  storage: string;
  portioning: string;
  available: boolean;
  bought: boolean;
  shortfallDecision: "pending" | "proceed" | "skip";
  claimed: number;
  mine: number;
  remaining: number;
  shareEstimateCents: number;
  shortfall: number;
  requiredPacks: number;
  unit: string | null;
  packUnits: number | null;
  shareUnits: number | null;
  catalogKey: string | null;
}
export interface Claim {
  itemId: string;
  name: string;
  shareLabel: string;
  quantity: number;
  estimateCents: number;
  available: boolean;
  portioning: string;
}
export interface Member {
  userId: string;
  name: string;
  university: boolean;
  photo: string | null;
  completed: number;
  attending: boolean;
  arrived: boolean;
  packed: boolean;
  collectedAt: string | null;
  claims: Claim[];
  estimateCents: number;
}
export interface OrderView {
  order: OrderSummary;
  items: Item[];
  myClaims: Claim[];
  myEstimateCents: number;
  mine: Member | null;
  members: Member[];
  inviteToken?: string;
  collectionCode?: string;
  isOrganizer: boolean;
}
export interface ProductRequest {
  id: string;
  name: string;
  note: string;
  votes: number;
  voted: boolean;
  target: number;
  /** True when the signed-in user created this request. */
  mine: boolean;
  /** Group the request belongs to, or null for a community-wide suggestion. */
  orderId: string | null;
  status: "open" | "added" | "declined";
  creatorName: string;
}
export interface Update {
  id: string;
  orderId: string | null;
  message: string;
  seen: boolean;
  createdAt: string;
}
export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    cents / 100,
  );
export const STATUS_LABELS: Record<Status, string> = {
  draft: "Draft",
  open: "Open",
  locked: "Shares locked",
  shopping: "Shopping",
  ready: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const PICKUP_PLACES = [
  { name: "UVic SUB main lobby", lat: 48.4649, lng: -123.3089 },
  { name: "McPherson Library entrance", lat: 48.4635, lng: -123.3096 },
  { name: "CARSA main entrance", lat: 48.4683, lng: -123.3106 },
];

export const emailCodeInput = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the six-digit verification code."),
  native: z.boolean().optional(),
});
export interface EmailVerification {
  delivery: "none" | "pending" | "smtp" | "outbox" | "failed";
  expiresAt: string | null;
  resendAt: string | null;
  remainingAttempts: number;
  message: string;
}

/* ---------- Item categories, units and the shared-item catalog ---------- */

export const CATEGORIES = [
  "Pantry",
  "Canned goods",
  "Noodles & pasta",
  "Snacks",
  "Drinks & coffee",
  "Breakfast",
  "Household",
  "Personal care",
] as const;

/** "1 box", "6 boxes": units are stored in the singular. */
export const plural = (n: number, unit: string): string => {
  if (n === 1) return `${n} ${unit}`;
  if (/(s|x|ch|sh)$/.test(unit)) return `${n} ${unit}es`;
  if (/[^aeiou]y$/.test(unit)) return `${n} ${unit.slice(0, -1)}ies`;
  return `${n} ${unit}s`;
};

/** Every whole share size that splits a pack evenly, e.g. 24 → 1, 2, 3, 4, 6, 8, 12, 24. */
export const shareSizes = (packUnits: number) =>
  Array.from({ length: packUnits }, (_, i) => i + 1).filter(
    (n) => packUnits % n === 0,
  );

export interface CatalogItem {
  key: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  /** Singular name of one sealed unit inside the pack, e.g. "can". */
  unit: string;
  /** How many sealed units are in one Costco pack. */
  packUnits: number;
  /** Extra detail about each unit, e.g. "796 mL each". */
  unitDetail: string;
  priceCents: number;
  /** Walmart Victoria price for one unit, used as the comparison price. */
  walmartUnitCents: number;
  storage: string;
  /** Suggested share size when the item is picked. */
  suggestedShare: number;
}

const DRY = "Store at room temperature. Keep sealed until opened.";

/**
 * Sealed multipacks that can be split without opening anything.
 * Prices: Costco.ca (Langford warehouse) and Walmart.ca (Victoria Hillside),
 * checked October 29, 2026. Organizers can update a price if it changed.
 */
export const CATALOG: CatalogItem[] = [
  {
    key: "kd-24",
    name: "Kraft Dinner Original",
    category: "Pantry",
    unit: "box",
    packUnits: 24,
    unitDetail: "200 g each",
    priceCents: 2099,
    walmartUnitCents: 167,
    storage: DRY,
    suggestedShare: 4,
  },
  {
    key: "kd-cups-12",
    name: "Kraft Dinner snack cups",
    category: "Pantry",
    unit: "cup",
    packUnits: 12,
    unitDetail: "58 g each",
    priceCents: 1999,
    walmartUnitCents: 197,
    storage: DRY,
    suggestedShare: 3,
  },
  {
    key: "oats-2",
    name: "Quaker Quick Oats",
    category: "Breakfast",
    unit: "bag",
    packUnits: 2,
    unitDetail: "2.58 kg each",
    priceCents: 1099,
    walmartUnitCents: 1024,
    storage: DRY,
    suggestedShare: 1,
  },
  {
    key: "aylmer-tomatoes-8",
    name: "Aylmer diced tomatoes",
    category: "Canned goods",
    unit: "can",
    packUnits: 8,
    unitDetail: "796 mL each",
    priceCents: 1799,
    walmartUnitCents: 298,
    storage: DRY,
    suggestedShare: 2,
  },
  {
    key: "green-giant-corn-12",
    name: "Green Giant Niblets corn",
    category: "Canned goods",
    unit: "can",
    packUnits: 12,
    unitDetail: "341 mL each",
    priceCents: 2099,
    walmartUnitCents: 188,
    storage: DRY,
    suggestedShare: 3,
  },
  {
    key: "sapporo-24",
    name: "Sapporo Ichiban noodles",
    category: "Noodles & pasta",
    unit: "pack",
    packUnits: 24,
    unitDetail: "100 g each",
    priceCents: 2799,
    walmartUnitCents: 99,
    storage: DRY,
    suggestedShare: 6,
  },
  {
    key: "rice-krispies-54",
    name: "Rice Krispies Squares",
    category: "Snacks",
    unit: "bar",
    packUnits: 54,
    unitDetail: "22 g each, individually wrapped",
    priceCents: 1299,
    walmartUnitCents: 43,
    storage: DRY,
    suggestedShare: 9,
  },
  {
    key: "welchs-60",
    name: "Welch’s Fruit Snacks",
    category: "Snacks",
    unit: "pouch",
    packUnits: 60,
    unitDetail: "22 g each",
    priceCents: 1899,
    walmartUnitCents: 40,
    storage: DRY,
    suggestedShare: 10,
  },
  {
    key: "motts-74",
    name: "Mott’s Fruitsations",
    category: "Snacks",
    unit: "pouch",
    packUnits: 74,
    unitDetail: "23 g each",
    priceCents: 1699,
    walmartUnitCents: 35,
    storage: DRY,
    suggestedShare: 37,
  },
  {
    key: "goldfish-24",
    name: "Goldfish Cheddar snack packs",
    category: "Snacks",
    unit: "bag",
    packUnits: 24,
    unitDetail: "43 g each",
    priceCents: 1399,
    walmartUnitCents: 76,
    storage: DRY,
    suggestedShare: 6,
  },
  {
    key: "dole-peach-20",
    name: "Dole diced peach cups",
    category: "Snacks",
    unit: "cup",
    packUnits: 20,
    unitDetail: "107 mL each",
    priceCents: 1699,
    walmartUnitCents: 99,
    storage: DRY,
    suggestedShare: 4,
  },
  {
    key: "quaker-yogourt-40",
    name: "Quaker Yogourt granola bars",
    category: "Snacks",
    unit: "bar",
    packUnits: 40,
    unitDetail: "35 g each, individually wrapped",
    priceCents: 1499,
    walmartUnitCents: 57,
    storage: DRY,
    suggestedShare: 10,
  },
  {
    key: "nutri-grain-40",
    name: "Kellogg’s Nutri-Grain bars",
    category: "Snacks",
    unit: "bar",
    packUnits: 40,
    unitDetail: "37 g each, individually wrapped",
    priceCents: 1799,
    walmartUnitCents: 43,
    storage: DRY,
    suggestedShare: 10,
  },
  {
    key: "clif-10",
    name: "Clif Bar, Crunchy Peanut Butter",
    category: "Snacks",
    unit: "bar",
    packUnits: 10,
    unitDetail: "68 g each, individually wrapped",
    priceCents: 1499,
    walmartUnitCents: 148,
    storage: DRY,
    suggestedShare: 5,
  },
  {
    key: "coke-32",
    name: "Coca-Cola",
    category: "Drinks & coffee",
    unit: "can",
    packUnits: 32,
    unitDetail: "355 mL each",
    priceCents: 2499,
    walmartUnitCents: 69,
    storage: DRY,
    suggestedShare: 8,
  },
  {
    key: "mccafe-4",
    name: "McCafé Premium Roast ground coffee",
    category: "Drinks & coffee",
    unit: "bag",
    packUnits: 4,
    unitDetail: "340 g each",
    priceCents: 3999,
    walmartUnitCents: 1165,
    storage: "Store in a cool, dry place. Keep sealed until opened.",
    suggestedShare: 1,
  },
  {
    key: "ziploc-large-3",
    name: "Ziploc large freezer bags",
    category: "Household",
    unit: "box",
    packUnits: 3,
    unitDetail: "50 bags each",
    priceCents: 2399,
    walmartUnitCents: 1558,
    storage: "Keep dry.",
    suggestedShare: 1,
  },
  {
    key: "ziploc-sandwich-4",
    name: "Ziploc sandwich bags",
    category: "Household",
    unit: "box",
    packUnits: 4,
    unitDetail: "150 bags each",
    priceCents: 2099,
    walmartUnitCents: 972,
    storage: "Keep dry.",
    suggestedShare: 1,
  },
  {
    key: "lysol-toilet-4",
    name: "Lysol toilet bowl cleaner",
    category: "Household",
    unit: "bottle",
    packUnits: 4,
    unitDetail: "946 mL each",
    priceCents: 1999,
    walmartUnitCents: 729,
    storage: "Keep upright, away from children.",
    suggestedShare: 1,
  },
  {
    key: "dove-16",
    name: "Dove Original bar soap",
    category: "Personal care",
    unit: "bar",
    packUnits: 16,
    unitDetail: "106 g each",
    priceCents: 1999,
    walmartUnitCents: 199,
    storage: "Keep dry.",
    suggestedShare: 4,
  },
  {
    key: "sensodyne-4",
    name: "Sensodyne whitening toothpaste",
    category: "Personal care",
    unit: "tube",
    packUnits: 4,
    unitDetail: "145 mL each",
    priceCents: 2299,
    walmartUnitCents: 750,
    storage: "Room temperature.",
    suggestedShare: 1,
  },
  {
    key: "crest-scope-5",
    name: "Crest + Scope toothpaste",
    category: "Personal care",
    unit: "tube",
    packUnits: 5,
    unitDetail: "170 mL each",
    priceCents: 1549,
    walmartUnitCents: 704,
    storage: "Room temperature.",
    suggestedShare: 1,
  },
  {
    key: "listerine-2",
    name: "Listerine Total Care Zero mouthwash",
    category: "Personal care",
    unit: "bottle",
    packUnits: 2,
    unitDetail: "1.5 L each",
    priceCents: 1499,
    walmartUnitCents: 1198,
    storage: "Room temperature.",
    suggestedShare: 1,
  },
  {
    key: "head-shoulders-2",
    name: "Head & Shoulders Classic Clean shampoo",
    category: "Personal care",
    unit: "bottle",
    packUnits: 2,
    unitDetail: "950 mL each",
    priceCents: 1749,
    walmartUnitCents: 1790,
    storage: "Room temperature.",
    suggestedShare: 1,
  },
];

/** Default member instructions for handing out sealed units. */
export const portioningFor = (shareUnits: number, unit: string) =>
  `Give ${plural(shareUnits, unit)} per share. Don’t open the packaging.`;

/** Builds the item fields the API needs from a pack and share size. */
export const itemFromUnits = (b: {
  name: string;
  category: string;
  unit: string;
  packUnits: number;
  shareUnits: number;
  unitDetail?: string;
  priceCents: number;
  walmartUnitCents?: number | null;
  packCount: number;
  storage: string;
  catalogKey?: string | null;
}): ItemInput => ({
  name: b.name,
  category: b.category,
  unit: b.unit,
  packUnits: b.packUnits,
  shareUnits: b.shareUnits,
  catalogKey: b.catalogKey ?? null,
  packLabel:
    `${plural(b.packUnits, b.unit)}${b.unitDetail ? ` (${b.unitDetail})` : ""}`.slice(
      0,
      60,
    ),
  shareLabel: plural(b.shareUnits, b.unit).slice(0, 60),
  sharesPerPack: b.packUnits / b.shareUnits,
  packCount: b.packCount,
  priceCents: b.priceCents,
  referenceShareCents: b.walmartUnitCents
    ? b.walmartUnitCents * b.shareUnits
    : null,
  storage: b.storage,
  portioning: portioningFor(b.shareUnits, b.unit),
});

/* ---------- Product requests ---------- */
export const requestInput = z.object({
  name: z.string().trim().min(1).max(100),
  note: z.string().trim().max(300).default(""),
});

/**
 * Plain-language description of what one share holds, for any item:
 * { share: "1 share = 4 boxes (200 g each)", pack: "6 shares from each pack of 24 boxes" }.
 */
export const describeShare = (i: {
  shareLabel: string;
  packLabel: string;
  sharesPerPack: number;
  unit?: string | null;
  packUnits?: number | null;
  shareUnits?: number | null;
}) => {
  const detail = i.packLabel.match(/\((.*)\)/)?.[1];
  const packName = i.packLabel.replace(/\s*\(.*\)\s*$/, "");
  return {
    share: `1 share = ${i.shareLabel}${detail ? ` (${detail})` : ""}`,
    pack: `${i.sharesPerPack} share${i.sharesPerPack === 1 ? "" : "s"} from each pack of ${packName}`,
  };
};

/** "2 shares = 8 boxes" when the unit is known, otherwise "2 × 6 eggs". */
export const claimText = (
  quantity: number,
  i: { shareLabel: string; unit?: string | null; shareUnits?: number | null },
) =>
  i.unit && i.shareUnits
    ? `${quantity} share${quantity === 1 ? "" : "s"} = ${plural(quantity * i.shareUnits, i.unit)}`
    : `${quantity} share${quantity === 1 ? "" : "s"} × ${i.shareLabel}`;
