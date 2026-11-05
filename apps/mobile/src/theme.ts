import type { TextStyle } from "react-native";

/**
 * POOLD colours, taken from the product website (pooldtest.vercel.app):
 * cream background, orange actions, yellow for buyers, green for organizers.
 */
export const brand = {
  cream: "#F4EDE1",
  orange: "#E84B2C",
  // Orange dark enough for white button text (4.7:1).
  orangeDeep: "#D23D20",
  yellow: "#F8E99B",
  yellowSoft: "#FCF5D2",
  green: "#879B79",
  greenDark: "#65745D",
  greenDeep: "#4C5A45",
  greenSoft: "#E3E9DC",
  black: "#161616",
  white: "#FFFFFF",
};

/**
 * Semantic tokens. The names are kept from the earlier theme so every screen
 * picks up the new look; the comments say what each one is used for now.
 */
export const palette = {
  /** Dark surfaces: selected chips, stepper "+" and dark buttons. */
  chalk: brand.black,
  /** Text on dark surfaces. */
  chalkText: brand.white,
  chalkMuted: "#D8D2C6",
  chalkLine: "#3A3A3A",
  chalkLeader: "#8A857B",
  chalkTile: brand.greenDark,
  chalkTileIcon: brand.white,
  /** Page background. */
  kraft: brand.cream,
  /** Cards and inputs. */
  paper: brand.white,
  line: "#E6DDCD",
  lineStrong: "#CBBFAB",
  ink: brand.black,
  actionInk: brand.white,
  white: brand.white,
  muted: "#625D55",
  /** Errors and urgent states. */
  beet: "#B3261E",
  /** Primary action. */
  carrot: brand.orangeDeep,
  /** Progress and success. */
  herb: brand.greenDark,
  herbText: brand.greenDeep,
  herbSoft: "#B9C6AE",
  track: "#EFE7DA",
  tag: brand.yellow,
};

export type Role = "buying" | "organizing";

type RoleColors = {
  header: string;
  headerText: string;
  headerMuted: string;
  /** True when the header is light, so controls on it use dark tints. */
  headerLight: boolean;
  /** Pill behind the selected tab icon. */
  tab: string;
  accent: string;
  soft: string;
  label: string;
  icon: "basket-outline" | "clipboard-outline";
};

/** Each role has its own colour so people always know which side they are on. */
export const roles: Record<Role, RoleColors> = {
  buying: {
    header: "#FBEFC5",
    headerText: brand.black,
    headerMuted: "#6B5F3A",
    headerLight: true,
    tab: "#F6E08A",
    accent: brand.orangeDeep,
    soft: brand.yellowSoft,
    label: "Buying",
    icon: "basket-outline",
  },
  organizing: {
    header: "#DFE7D5",
    headerText: "#2F3A2A",
    headerMuted: "#55634D",
    headerLight: true,
    tab: "#C5D4B6",
    accent: brand.greenDeep,
    soft: brand.greenSoft,
    label: "Organizing",
    icon: "clipboard-outline",
  },
};

export const categoryColors: Record<string, { tile: string; icon: string }> = {
  Pantry: { tile: "#F3EBD3", icon: "#6B5A1E" },
  "Canned goods": { tile: "#F6E0D8", icon: "#9A3A22" },
  "Noodles & pasta": { tile: "#FBEBC8", icon: "#87561A" },
  Snacks: { tile: "#F7E3D2", icon: "#8A4520" },
  "Drinks & coffee": { tile: "#EDE3EC", icon: "#6A4565" },
  Breakfast: { tile: "#FAF0C4", icon: "#7A6210" },
  Household: { tile: "#E1EBEE", icon: "#2F5562" },
  "Personal care": { tile: "#E3E9DC", icon: "#4C5A45" },
};

export const fonts = {
  display: "Outfit_700Bold",
  title: "Outfit_800ExtraBold",
  italic: "Outfit_600SemiBold",
  body: "Manrope_500Medium",
  medium: "Manrope_600SemiBold",
  label: "Manrope_700Bold",
  bold: "Manrope_800ExtraBold",
  mono: "Manrope_600SemiBold",
  monoMedium: "Manrope_700Bold",
};

export const type = {
  title: {
    fontFamily: fonts.title,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    color: palette.ink,
  },
  detailTitle: {
    fontFamily: fonts.title,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: palette.ink,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 19,
    lineHeight: 24,
    color: palette.ink,
  },
  section: {
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 24,
    color: palette.ink,
  },
  item: {
    fontFamily: fonts.label,
    fontSize: 16,
    lineHeight: 22,
    color: palette.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: palette.ink,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: 14,
    lineHeight: 20,
    color: palette.ink,
  },
  /** Small secondary details (store, time, counts). */
  mono: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    color: palette.muted,
  },
  total: {
    fontFamily: fonts.title,
    fontSize: 26,
    lineHeight: 32,
    color: palette.ink,
  },
} satisfies Record<string, TextStyle>;

export const shape = {
  card: 18,
  input: 12,
  chip: 999,
  tag: { borderRadius: 999 },
};

export const shadow = {
  shadowColor: "#3B2F1E",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

export const spacing = { page: 16, section: 14, card: 16, maxWidth: 640 };

export const deadlineLabel = (date: string) => {
  const remaining = Date.parse(date) - Date.now();
  if (remaining <= 0) return "Closed";
  if (remaining < 3600000) return "Closes soon";
  if (remaining < 86400000) return `${Math.ceil(remaining / 3600000)}h left`;
  const days = Math.ceil(remaining / 86400000);
  return `${days} days left`;
};
