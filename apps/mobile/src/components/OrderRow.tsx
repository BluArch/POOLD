import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { type OrderSummary, STATUS_LABELS, money } from "@poold/contracts";
import { styles, when } from "./ui";
import { palette as P, type, deadlineLabel } from "../theme";
import { ItemIcon } from "./ItemIcon";
import { Stamp, PriceTag, DottedLeader, Zigzag } from "./Market";

export function OrderRow({
  order: o,
  showStatus = false,
  organize = false,
}: {
  order: OrderSummary;
  showStatus?: boolean;
  organize?: boolean;
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
  const organizer = o.organizerName
    .split(" ")
    .map((name, i) => (i ? `${name[0]}.` : name))
    .join(" ");
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
        marginBottom: 16,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          backgroundColor: P.paper,
          borderWidth: 1,
          borderColor: P.line,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          padding: 16,
          gap: 12,
        }}
      >
        <View style={[styles.between, { alignItems: "flex-start" }]}>
          <Text style={[type.mono, { flex: 1 }]}>
            {[o.store, organizer, o.visibility === "private" ? "Private" : ""]
              .filter(Boolean)
              .join(" · ")
              .toUpperCase()}
          </Text>
          <Stamp
            urgent={
              o.status === "cancelled" ||
              (!showStatus && Date.parse(o.deadline) - Date.now() < 86400000)
            }
          >
            {showStatus ? STATUS_LABELS[o.status] : deadlineLabel(o.deadline)}
          </Stamp>
        </View>
        {showStatus && (
          <Text style={[type.mono, { color: P.herbText }]}>
            {organize ? "ORGANIZING" : "JOINED"}
          </Text>
        )}
        <Text style={type.cardTitle}>{o.name}</Text>
        {items.map((item, index) => (
          <View key={`${item.name}-${index}`} style={[styles.row, { gap: 8 }]}>
            <ItemIcon item={item} size={26} />
            <Text style={[type.body, { flexShrink: 1 }]}>{item.name}</Text>
            <DottedLeader />
            {item.sharesPerPack > 0 && (
              <Text style={[type.mono, { color: P.ink }]}>
                {money(
                  Math.floor(
                    (item.priceCents + Math.floor(item.sharesPerPack / 2)) /
                      item.sharesPerPack,
                  ),
                )}
                /share
              </Text>
            )}
          </View>
        ))}
        {count > 4 && <Text style={type.mono}>+{count - 4} MORE</Text>}
        {!items.length && <Text style={styles.muted}>No available items</Text>}
        <View
          style={{
            borderTopWidth: 1,
            borderStyle: "dashed",
            borderColor: P.line,
            paddingTop: 12,
            gap: 10,
          }}
        >
          <View
            style={[
              styles.row,
              { flexWrap: "wrap", justifyContent: "space-between" },
            ]}
          >
            <PriceTag
              spots
            >{`${o.memberCount} of ${o.maxMembers} spots`}</PriceTag>
            <View style={[styles.row, { gap: 4, flexShrink: 1 }]}>
              <Ionicons name="location-outline" size={14} color={P.muted} />
              <Text style={[type.mono, { flexShrink: 1 }]}>
                {o.pickupLocation}
              </Text>
            </View>
          </View>
          <Text style={type.mono}>
            PICKUP · {when(o.pickupAt).toUpperCase()}
          </Text>
        </View>
      </View>
      <Zigzag />
    </Pressable>
  );
}
