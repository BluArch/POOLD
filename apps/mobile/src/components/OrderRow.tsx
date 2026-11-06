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
  join = false,
}: {
  order: OrderSummary;
  showStatus?: boolean;
  organize?: boolean;
  /** Buyer view of a group you organize and also take shares in. */
  byYou?: boolean;
  /** Show a clear "Join group" button (buyer Home). */
  join?: boolean;
}) {
  const open = () =>
    router.push({
      pathname: "/(tabs)/order/[id]",
      params: { id: o.id, ...(organize ? { view: "organize" } : {}) },
    });
  // Look at the list without picking anything.
  const browse = () =>
    router.push({
      pathname: "/(tabs)/order/[id]",
      params: { id: o.id, view: "browse" },
    });
  const full = o.memberCount >= o.maxMembers && !o.joined;
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
    <View
      style={{
        marginBottom: 12,
        backgroundColor: P.paper,
        borderRadius: 20,
        padding: 16,
        gap: 12,
        ...shadow,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${o.name}`}
        onPress={open}
        style={({ pressed }) => ({ gap: 12, opacity: pressed ? 0.75 : 1 })}
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
      </Pressable>
      {join && o.status === "open" && (
        <View style={{ gap: 8 }}>
          {o.joined || full ? (
            <CardButton
              label={full ? "View list" : "View my shares"}
              icon={full ? "list-outline" : "bag-check-outline"}
              a11y={full ? `View what's in ${o.name}` : `View your shares in ${o.name}`}
              onPress={full ? browse : open}
            />
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <CardButton
                  label="View list"
                  icon="list-outline"
                  a11y={`View what's in ${o.name}`}
                  onPress={browse}
                />
                <CardButton
                  primary
                  label="Join group"
                  icon="add-circle-outline"
                  a11y={`Join ${o.name}`}
                  onPress={open}
                />
              </View>
              <Text
                style={[type.mono, { fontSize: 12, textAlign: "center" }]}
              >
                Free to join · nothing is charged until shares close
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function CardButton({
  label,
  icon,
  a11y,
  onPress,
  primary = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  a11y: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 46,
        borderRadius: 999,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary ? P.carrot : P.paper,
        borderWidth: primary ? 0 : 1.5,
        borderColor: P.line,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name={icon} size={19} color={primary ? P.white : P.ink} />
      <Text style={[type.label, { color: primary ? P.white : P.ink }]}>
        {label}
      </Text>
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
