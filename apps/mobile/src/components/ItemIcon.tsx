import React from "react";
import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { categoryColors, palette } from "../theme";

type Glyph = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
// Validate against the installed icon set, never pass an unknown glyph to native.
const valid = (name: string): Glyph =>
  name in MaterialCommunityIcons.glyphMap ? (name as Glyph) : "basket-outline";
const keywords: [RegExp, Glyph][] = [
  [/towel|toilet|tissue/i, valid("paper-roll")],
  [/rice/i, valid("rice")],
  [/pasta|noodle|penne|macaroni|dinner/i, valid("pasta")],
  [/coffee/i, valid("coffee")],
  [/tea/i, valid("tea")],
  [/granola|bar|cookie/i, valid("cookie")],
  [/chip|crisp|can|soup|beans|tomato/i, valid("food-variant")],
  [/cereal|oat/i, valid("bowl-mix")],
  [/milk/i, valid("cup")],
  [/soap|detergent|cleaner/i, valid("spray-bottle")],
  [/toothpaste|toothbrush/i, valid("toothbrush-paste")],
  [/shampoo|lotion/i, valid("lotion")],
];
const categories: Record<string, Glyph> = Object.fromEntries(
  Object.entries({
    Pantry: "basket-outline",
    "Canned goods": "food-variant",
    "Noodles & pasta": "pasta",
    Snacks: "cookie",
    "Drinks & coffee": "coffee",
    Breakfast: "bowl-mix",
    Household: "spray-bottle",
    "Personal care": "lotion",
  }).map(([key, name]) => [key, valid(name)]),
);
export function ItemIcon({
  item,
  size = 48,
  receipt = false,
}: {
  item: { name: string; category?: string };
  size?: 22 | 26 | 48 | 52;
  receipt?: boolean;
}) {
  const colors = categoryColors[item.category ?? ""] ?? {
    tile: palette.track,
    icon: palette.muted,
  };
  const name =
    keywords.find(([pattern]) => pattern.test(item.name))?.[1] ??
    categories[item.category ?? ""] ??
    "basket-outline";
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: receipt ? palette.chalkTile : colors.tile,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MaterialCommunityIcons
        name={name}
        size={size * 0.65}
        color={receipt ? palette.chalkTileIcon : colors.icon}
      />
    </View>
  );
}
