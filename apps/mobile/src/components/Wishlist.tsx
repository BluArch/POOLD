import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG, money, type Wishlist } from "@poold/contracts";
import { Field, styles } from "./ui";
import { ItemIcon } from "./ItemIcon";
import { Badge } from "./Market";
import { palette as P, type, brand, shadow } from "../theme";

/** Rough value of one pack of each wanted item, from catalog prices. */
export const wishlistValue = (w: Wishlist) =>
  w.items.reduce(
    (n, i) =>
      n + (CATALOG.find((c) => c.key === i.catalogKey)?.priceCents ?? 0),
    0,
  );

/** A wishlist on the board. Organizers get an "Organize this" button. */
export function WishlistCard({
  wishlist: w,
  organizer = false,
}: {
  wishlist: Wishlist;
  organizer?: boolean;
}) {
  const value = wishlistValue(w);
  const top = w.items.slice(0, 4);
  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{
          backgroundColor: P.paper,
          borderRadius: 20,
          padding: 16,
          gap: 12,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: organizer ? brand.green : "#E9D48A",
          ...shadow,
          shadowOpacity: 0.05,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open wishlist ${w.title}`}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/wishlist/[id]",
              params: { id: w.id },
            })
          }
          style={({ pressed }) => ({ gap: 12, opacity: pressed ? 0.8 : 1 })}
        >
          <View style={styles.between}>
            <View style={[styles.row, { gap: 10, flex: 1 }]}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: brand.yellowSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="list-outline" size={18} color={P.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.label, { fontSize: 13 }]} numberOfLines={1}>
                  {w.store} · wishlist
                </Text>
                <Text style={[type.mono, { fontSize: 12 }]} numberOfLines={1}>
                  {w.mine ? "Started by you" : `Started by ${w.creatorName}`}
                </Text>
              </View>
            </View>
            {w.status === "open" ? (
              <Badge tone="urgent">Needs an organizer</Badge>
            ) : (
              <Badge tone="good">Being organized</Badge>
            )}
          </View>
          <Text style={type.cardTitle} numberOfLines={2}>
            {w.title}
          </Text>
          <View style={[styles.row, { gap: 6 }]}>
            {top.map((i) => {
              const c = CATALOG.find((x) => x.key === i.catalogKey);
              return (
                <ItemIcon
                  key={i.id}
                  item={{ name: i.name, category: c?.category }}
                  size={36}
                />
              );
            })}
            <Text
              style={[type.mono, { flex: 1, marginLeft: 4 }]}
              numberOfLines={2}
            >
              {w.items.length} {w.items.length === 1 ? "item" : "items"}
              {organizer && value > 0
                ? ` · about ${money(value)} in packs`
                : ""}
            </Text>
          </View>
          <View
            style={[
              styles.between,
              { borderTopWidth: 1, borderColor: P.line, paddingTop: 12 },
            ]}
          >
            <View style={[styles.row, { gap: 4 }]}>
              <Ionicons name="people-outline" size={15} color={P.muted} />
              <Text style={[type.mono, { fontSize: 12 }]}>
                {w.memberCount}{" "}
                {w.memberCount === 1 ? "person wants" : "people want"} this
              </Text>
            </View>
            {organizer ? (
              <Text style={[type.label, { fontSize: 13, color: P.carrot }]}>
                Details →
              </Text>
            ) : (
              <Text style={[type.label, { fontSize: 13 }]}>
                {w.joined ? "You’re in ✓" : "Join →"}
              </Text>
            )}
          </View>
        </Pressable>
        {organizer && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Organize ${w.title}`}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/create",
                params: { wishlist: w.id },
              })
            }
            style={({ pressed }) => ({
              backgroundColor: P.carrot,
              borderRadius: 999,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={[type.label, { color: P.white }]}>Organize this</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Add an item: type, then pick a catalog match or keep what you typed. */
export function ItemAdder({
  onAdd,
  exclude = [],
  label = "Add an item",
}: {
  onAdd: (item: { name: string; catalogKey: string | null }) => void;
  exclude?: string[];
  label?: string;
}) {
  const [text, setText] = useState("");
  const q = text.trim().toLowerCase();
  const matches = q
    ? CATALOG.filter(
        (c) =>
          c.name.toLowerCase().includes(q) &&
          !exclude.includes(c.name.toLowerCase()),
      ).slice(0, 4)
    : [];
  const add = (item: { name: string; catalogKey: string | null }) => {
    onAdd(item);
    setText("");
  };
  return (
    <View style={{ gap: 8 }}>
      <Field
        label={label}
        value={text}
        onChangeText={setText}
        placeholder="Search, e.g. rice, Ziploc, oat milk"
      />
      {matches.map((c) => (
        <Pressable
          key={c.key}
          accessibilityRole="button"
          onPress={() => add({ name: c.name, catalogKey: c.key })}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? P.track : P.paper,
              borderWidth: 1,
              borderColor: P.line,
              borderRadius: 14,
              padding: 10,
            },
          ]}
        >
          <ItemIcon item={c} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={type.label}>{c.name}</Text>
            <Text style={type.mono}>
              Pack of {c.packUnits} · {money(c.priceCents)} at Costco
            </Text>
          </View>
          <Ionicons name="add-circle" size={24} color={P.carrot} />
        </Pressable>
      ))}
      {!!q && !exclude.includes(q) && (
        <Pressable
          accessibilityRole="button"
          onPress={() => add({ name: text.trim(), catalogKey: null })}
          style={[styles.row, { minHeight: 40 }]}
        >
          <Ionicons name="add" size={18} color={P.carrot} />
          <Text style={[type.label, { color: P.carrot }]}>
            Add “{text.trim()}”
          </Text>
        </Pressable>
      )}
    </View>
  );
}
