import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
export const itemInput = z.object({
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
