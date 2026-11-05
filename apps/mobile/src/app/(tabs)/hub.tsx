import React from "react";
import { Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { OrderSummary, Wishlist } from "@poold/contracts";
import {
  Screen,
  Button,
  EmptyState,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { WishlistCard } from "../../components/Wishlist";
import { palette as P, type, roles, brand } from "../../theme";
import { useSession } from "../../session";

const needsYou = (o: OrderSummary) =>
  ["draft", "locked", "shopping", "ready"].includes(o.status) ||
  (o.status === "open" && Date.parse(o.deadline) - Date.now() < 86400000);

/**
 * Organizer home: a quick way into your own groups, then the wishlists
 * buyers posted that are waiting for someone to organize them.
 */
export default function Hub() {
  const r = useResource<OrderSummary[]>("/orders?scope=organizing");
  const wishes = useResource<Wishlist[]>("/wishlists");
  const s = useSession();
  const all = r.data ?? [];
  const count = (st: string[]) =>
    all.filter((o) => st.includes(o.status)).length;
  const urgent = all.filter(needsYou).length;
  const waiting = (wishes.data ?? []).filter((w) => !w.mine);
  return (
    <Screen
      title={`Hi, ${s.user?.name.split(" ")[0] ?? "there"}`}
      subtitle="Ready to organize a run?"
      roleSwitch
      onRefresh={() => void Promise.all([r.refresh(), wishes.refresh()])}
      refreshing={r.loading}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View my groups"
        onPress={() => router.navigate("/(tabs)/organize")}
        style={({ pressed }) => [
          styles.card,
          { gap: 12, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={styles.between}>
          <View style={[styles.row, { gap: 10 }]}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: roles.organizing.tab,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="albums" size={20} color={P.ink} />
            </View>
            <View>
              <Text style={styles.h2}>My groups</Text>
              <Text style={type.mono}>
                {urgent
                  ? `${urgent} ${urgent === 1 ? "needs" : "need"} a step from you`
                  : "Nothing waiting on you"}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color={P.muted} />
        </View>
        <View style={[styles.row, { gap: 8 }]}>
          <Stat value={count(["open"])} label="Open" />
          <Stat
            value={count(["locked", "shopping", "ready"])}
            label="In progress"
          />
          <Stat value={count(["draft"])} label="Drafts" />
        </View>
      </Pressable>
      <Button
        secondary
        icon="add"
        onPress={() => router.navigate("/(tabs)/create")}
      >
        Start a group from scratch
      </Button>

      <View>
        <Text
          style={[type.section, { marginBottom: 2 }]}
          accessibilityRole="header"
        >
          Groups looking for an organizer
        </Text>
        <Text style={[type.mono, { marginBottom: 12 }]}>
          Buyers posted what they want. Pick one up and it becomes your group.
        </Text>
        <ResourceState resource={wishes} />
        {waiting.map((w) => (
          <WishlistCard key={w.id} wishlist={w} organizer />
        ))}
        {wishes.data && waiting.length === 0 && (
          <EmptyState
            icon="list-outline"
            title="No requests right now"
            message="When buyers post a wishlist, it shows up here."
          />
        )}
      </View>
      <ResourceState resource={r} />
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
        backgroundColor: brand.greenSoft,
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
