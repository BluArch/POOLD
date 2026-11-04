import type { TextStyle } from "react-native";

export const palette = {
  chalk: "#24382E",
  chalkText: "#F4EEDC",
  chalkMuted: "#C9D3C4",
  chalkLine: "#4E6456",
  chalkLeader: "#6F8577",
  chalkTile: "#34503F",
  chalkTileIcon: "#F4B47A",
  kraft: "#EFE5D2",
  paper: "#FBF7EE",
  line: "#DCCFB4",
  lineStrong: "#B7A985",
  ink: "#213328",
  // Near-ink action text clears 4.5:1 on carrot; the original pair is 4.46:1.
  actionInk: "#203126",
  white: "#FFFFFF",
  muted: "#5E5A48",
  beet: "#8E2A45",
  carrot: "#E07A2E",
  herb: "#4F7F34",
  herbText: "#3E6629",
  herbSoft: "#A9BF8F",
  track: "#E6DAC1",
  tag: "#F4D9B8",
};
export const categoryColors: Record<string, { tile: string; icon: string }> = {
  Pantry: { tile: "#E3E6CF", icon: "#4A5530" },
  "Canned goods": { tile: "#E9D6D0", icon: "#7A3328" },
  "Noodles & pasta": { tile: "#F4D9B8", icon: "#7A4A12" },
  Snacks: { tile: "#EAD3C0", icon: "#6E3B1E" },
  "Drinks & coffee": { tile: "#E2D8E6", icon: "#5B3A66" },
  Breakfast: { tile: "#F3E3B3", icon: "#725A0E" },
  Household: { tile: "#DCE6E8", icon: "#2E4D57" },
  "Personal care": { tile: "#DDE9DF", icon: "#2F5E44" },
};
export const fonts = {
  display: "Fraunces_600SemiBold",
  title: "Fraunces_700Bold",
  italic: "Fraunces_600SemiBold_Italic",
  body: "WorkSans_400Regular",
  medium: "WorkSans_500Medium",
  label: "WorkSans_600SemiBold",
  bold: "WorkSans_700Bold",
  mono: "DMMono_400Regular",
  monoMedium: "DMMono_500Medium",
};
export const type = {
  title: {
    fontFamily: fonts.title,
    fontSize: 34,
    lineHeight: 40,
    color: palette.ink,
  },
  detailTitle: {
    fontFamily: fonts.title,
    fontSize: 30,
    lineHeight: 34,
    color: palette.ink,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: palette.ink,
  },
  section: {
    fontFamily: fonts.italic,
    fontSize: 20,
    lineHeight: 26,
    color: palette.ink,
  },
  item: {
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 23,
    color: palette.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: palette.ink,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: 14,
    lineHeight: 20,
    color: palette.ink,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 17,
    letterSpacing: 0.6,
    color: palette.muted,
  },
  total: {
    fontFamily: fonts.title,
    fontSize: 28,
    lineHeight: 34,
    color: palette.ink,
  },
} satisfies Record<string, TextStyle>;
export const shape = {
  card: 12,
  input: 10,
  chip: 8,
  tag: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
  },
};
export const spacing = { page: 20, section: 16, card: 16, maxWidth: 640 };
export const deadlineLabel = (date: string) => {
  const remaining = Date.parse(date) - Date.now();
  if (remaining <= 0) return "Closed";
  if (remaining < 3600000) return "Under 1 hour";
  if (remaining < 86400000) return `${Math.ceil(remaining / 3600000)}h left`;
  return new Date(date).toLocaleDateString("en-CA", { weekday: "short" });
};
