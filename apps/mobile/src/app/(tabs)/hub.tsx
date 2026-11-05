import React from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { OrderSummary } from "@poold/contracts";
import {
  Screen,
  Button,
  EmptyState,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { type, roles } from "../../theme";
import { useSession } from "../../session";

const needsYou = (o: OrderSummary) =>
  ["draft", "locked", "shopping", "ready"].includes(o.status) ||
  (o.status === "open" && Date.parse(o.deadline) - Date.now() < 86400000);

/** Organizer home: what needs doing now, and a quick way to start a group. */
export default function Hub() {
  const r = useResource<OrderSummary[]>("/orders?scope=organizing");
  const s = useSession();
  const all = r.data ?? [];
  const now = all
    .filter(needsYou)
    .sort((a, b) => Date.parse(a.pickupAt) - Date.parse(b.pickupAt));
  const count = (st: string[]) =>
    all.filter((o) => st.includes(o.status)).length;
  return (
    <Screen
      title={`Hi, ${s.user?.name.split(" ")[0] ?? "there"}`}
      subtitle="Your groups at a glance"
      roleSwitch
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
      header={
        <View style={[styles.row, { gap: 8 }]}>
          <Stat value={count(["open"])} label="Open" />
          <Stat
            value={count(["locked", "shopping", "ready"])}
            label="In progress"
          />
          <Stat value={count(["draft"])} label="Drafts" />
        </View>
      }
    >
      <Button icon="add" onPress={() => router.navigate("/(tabs)/create")}>
        Start a new group
      </Button>
      <ResourceState resource={r} />
      {r.data && (
        <View>
          <Text
            style={[type.section, { marginBottom: 10 }]}
            accessibilityRole="header"
          >
            Needs you now
          </Text>
          {now.map((o) => (
            <OrderRow key={o.id} order={o} showStatus organize />
          ))}
          {now.length === 0 && (
            <EmptyState
              icon="checkmark-done-outline"
              title={
                all.length ? "You’re all caught up" : "Start your first group"
              }
              message={
                all.length
                  ? "Groups that need a step from you show up here."
                  : "Pick a store, add items, and choose a pickup spot."
              }
            >
              {all.length > 0 && (
                <Button
                  secondary
                  onPress={() => router.navigate("/(tabs)/organize")}
                >
                  See all my groups
                </Button>
              )}
            </EmptyState>
          )}
        </View>
      )}
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: roles.organizing.headerLight
          ? "rgba(255,255,255,0.6)"
          : "rgba(255,255,255,0.16)",
      }}
    >
      <Text
        style={[
          type.total,
          { color: roles.organizing.headerText, fontSize: 24, lineHeight: 28 },
        ]}
      >
        {value}
      </Text>
      <Text
        style={[
          type.mono,
          { color: roles.organizing.headerMuted, fontSize: 12 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
