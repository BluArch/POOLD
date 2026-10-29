import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { type OrderSummary, STATUS_LABELS } from "@poold/contracts";
import { styles, C, when } from "./ui";
export function OrderRow({
  order: o,
  showStatus = false,
}: {
  order: OrderSummary;
  showStatus?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${o.name}`}
      onPress={() =>
        router.push({ pathname: "/(tabs)/order/[id]", params: { id: o.id } })
      }
      style={styles.section}
    >
      <View style={styles.between}>
        <Text style={[styles.h2, { flex: 1 }]}>{o.name}</Text>
        <Ionicons name="chevron-forward" size={26} color={C.muted} />
      </View>
      <Text style={styles.muted}>
        {o.organizerName} · {o.store}
        {o.kind === "quick" ? " · Quick split" : ""}
      </Text>
      <View style={styles.row}>
        <Ionicons name="location-outline" size={21} color={C.ink} />
        <Text style={[styles.text, { flex: 1 }]}>{o.pickupLocation}</Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="time-outline" size={21} color={C.ink} />
        <Text style={[styles.text, { flex: 1 }]}>{when(o.pickupAt)}</Text>
      </View>
      <Text style={styles.muted}>{o.preview || "No available items"}</Text>
      <Text style={styles.muted}>
        {o.memberCount} of {o.maxMembers} joined
        {o.memberCount >= o.maxMembers ? " · Full" : ""}
      </Text>
      <Text style={styles.muted}>
        {showStatus ? STATUS_LABELS[o.status] : `Closes ${when(o.deadline)}`}
        {o.visibility === "private" ? " · Private" : ""}
      </Text>
    </Pressable>
  );
}
