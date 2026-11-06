import React from "react";
import { Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { type OrderSummary } from "@poold/contracts";
import {
  Screen,
  Button,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { palette as P, type, roles, brand } from "../../theme";
import { useSession } from "../../session";

const TIPS: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  text: string;
}[] = [
  {
    icon: "cart-outline",
    title: "Plan a run you’re doing anyway",
    text: "Pick a store, sealed bulk packs and a pickup spot.",
  },
  {
    icon: "person-add-outline",
    title: "Add your own share",
    text: "You have to buy for yourself too. You pay for it at the store.",
  },
  {
    icon: "lock-closed-outline",
    title: "Close shares",
    text: "Buyers’ cards get a hold for their shares. Nothing is charged yet.",
  },
  {
    icon: "receipt-outline",
    title: "Shop and upload proof",
    text: "Starting shopping charges the holds and releases the item money to you. Upload the receipt and a photo.",
  },
  {
    icon: "bag-handle-outline",
    title: "Hand out and get your fee",
    text: "Check each pickup code. The 5% service fees are released when every bag is handed out.",
  },
];

const needsYou = (o: OrderSummary) =>
  ["draft", "locked", "shopping", "ready"].includes(o.status) ||
  (o.status === "open" && Date.parse(o.deadline) - Date.now() < 86400000);

/** Organizer home: your groups at a glance, then how organizing works. */
export default function Hub() {
  const r = useResource<OrderSummary[]>("/orders?scope=organizing");
  const s = useSession();
  const all = r.data ?? [];
  const count = (st: string[]) =>
    all.filter((o) => st.includes(o.status)).length;
  const urgent = all.filter(needsYou).length;
  return (
    <Screen
      title={`Hi, ${s.user?.name.split(" ")[0] ?? "there"}`}
      subtitle="Ready to organize a run?"
      roleSwitch
      onRefresh={() => void r.refresh()}
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
      <Button icon="add" onPress={() => router.navigate("/(tabs)/create")}>
        Start a group
      </Button>

      <View style={[styles.card, { gap: 12 }]}>
        <Text style={styles.h2} accessibilityRole="header">
          How organizing works
        </Text>
        {TIPS.map((tip, n) => (
          <View
            key={tip.title}
            style={[styles.row, { alignItems: "flex-start" }]}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: roles.organizing.tab,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={tip.icon} size={17} color={P.ink} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.label}>
                {n + 1}. {tip.title}
              </Text>
              <Text style={type.mono}>{tip.text}</Text>
            </View>
          </View>
        ))}
        <Text
          accessibilityRole="link"
          onPress={() => router.push("/policies")}
          style={[type.label, { color: P.carrot }]}
        >
          Payments and no-show rules →
        </Text>
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
