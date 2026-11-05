import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { type OrderSummary, money } from "@poold/contracts";
import { styles } from "./ui";
import { palette as P, type, deadlineLabel, shadow, brand } from "../theme";
import { ItemIcon } from "./ItemIcon";
import { Badge, STATUS_TEXT } from "./Market";

const day = (date: string) =>
  new Date(date).toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function OrderRow({
  order: o,
  showStatus = false,
  organize = false,
  byYou = false,
}: {
  order: OrderSummary;
  showStatus?: boolean;
  organize?: boolean;
  /** Buyer view of a group you organize and also take shares in. */
  byYou?: boolean;
}) {
  const items =
    o.previewItems ??
    o.preview
      .split(" · ")
      .filter(Boolean)
      .slice(0, 4)
      .map((name) => ({
        name,
        category: "",
        priceCents: 0,
        sharesPerPack: 0,
        unit: null,
      }));
  const count = o.preview.split(" · ").filter(Boolean).length;
  const perShare = items
    .filter((i) => i.sharesPerPack > 0)
    .map((i) =>
      Math.floor(
        (i.priceCents + Math.floor(i.sharesPerPack / 2)) / i.sharesPerPack,
      ),
    );
  const from = perShare.length ? Math.min(...perShare) : 0;
  const organizer = o.organizerName
    .split(" ")
    .map((name, i) => (i ? `${name[0]}.` : name))
    .join(" ");
  const closingSoon =
    o.status === "open" && Date.parse(o.deadline) - Date.now() < 86400000;
  const badge =
    showStatus || o.status !== "open"
      ? STATUS_TEXT[o.status]
      : deadlineLabel(o.deadline);
  const tone =
    o.status === "cancelled" || (closingSoon && !showStatus)
      ? "urgent"
      : o.status === "ready"
        ? "good"
        : o.status === "draft"
          ? "neutral"
          : organize
            ? "organizer"
            : "buyer";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${o.name}`}
      onPress={() =>
        router.push({
          pathname: "/(tabs)/order/[id]",
          params: { id: o.id, ...(organize ? { view: "organize" } : {}) },
        })
      }
      style={({ pressed }) => ({
        marginBottom: 12,
        opacity: pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View
        style={{
          backgroundColor: P.paper,
          borderRadius: 20,
          padding: 16,
          gap: 12,
          ...shadow,
        }}
      >
        <View style={[styles.between, { alignItems: "center" }]}>
          <View style={[styles.row, { gap: 10, flex: 1 }]}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor:
                  organize || byYou ? brand.greenSoft : brand.yellowSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={
                  o.kind === "quick" ? "flash-outline" : "storefront-outline"
                }
                size={18}
                color={organize || byYou ? brand.greenDeep : P.ink}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { fontSize: 13 }]} numberOfLines={1}>
                {o.store}
                {o.visibility === "private" ? " · Private" : ""}
              </Text>
              <Text style={[type.mono, { fontSize: 12 }]} numberOfLines={1}>
                {organize
                  ? "You organize"
                  : byYou
                    ? o.myShares > 0
                      ? `Organized by you · ${o.myShares} ${o.myShares === 1 ? "share" : "shares"} for you`
                      : "Organized by you"
                    : `by ${organizer}${o.organizerRating ? ` · ★ ${o.organizerRating.average.toFixed(1)}` : ""}`}
              </Text>
            </View>
          </View>
          <Badge tone={tone}>{badge}</Badge>
        </View>
        <Text style={type.cardTitle} numberOfLines={2}>
          {o.name}
        </Text>
        {items.length > 0 ? (
          <View style={[styles.row, { gap: 6 }]}>
            {items.slice(0, 4).map((item, index) => (
              <ItemIcon key={`${item.name}-${index}`} item={item} size={36} />
            ))}
            <Text
              style={[type.mono, { flex: 1, marginLeft: 4 }]}
              numberOfLines={2}
            >
              {count} {count === 1 ? "item" : "items"}
              {from > 0 ? ` · from ${money(from)}/share` : ""}
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>No items yet</Text>
        )}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 14,
            borderTopWidth: 1,
            borderColor: P.line,
            paddingTop: 12,
          }}
        >
          <Meta icon="people-outline">{`${o.memberCount}/${o.maxMembers}`}</Meta>
          <Meta icon="time-outline">{day(o.pickupAt)}</Meta>
          <Meta icon="location-outline">{o.pickupLocation}</Meta>
        </View>
      </View>
    </Pressable>
  );
}

function Meta({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  children: string;
}) {
  return (
    <View style={[styles.row, { gap: 4, flexShrink: 1 }]}>
      <Ionicons name={icon} size={15} color={P.muted} />
      <Text
        style={[type.mono, { fontSize: 12, flexShrink: 1 }]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </View>
  );
}
