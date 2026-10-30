import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { OrderSummary } from "@poold/contracts";
import {
  Screen,
  styles,
  useResource,
  ResourceState,
  C,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { Segmented } from "../../components/Sections";
import { useSession } from "../../session";

type Frame = "current" | "past";
const ENDED = ["completed", "cancelled"];

/** Groups you joined as a buyer. Groups you organize live in the Organize tab. */
export default function MyOrders() {
  const r = useResource<OrderSummary[]>("/orders?scope=mine"),
    s = useSession();
  const [frame, setFrame] = useState<Frame>("current");
  const all = r.data ?? [];
  const joined = all.filter((o) => o.organizerId !== s.user?.id);
  const organizing = all.length - joined.length;
  const current = joined.filter((o) => !ENDED.includes(o.status));
  const past = joined.filter((o) => ENDED.includes(o.status));
  const list = frame === "current" ? current : past;

  return (
    <Screen
      title="Your shares, together."
      subtitle="Groups you joined as a buyer."
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <ResourceState resource={r} />
      {r.data && (
        <>
          <Segmented<Frame>
            options={[
              { value: "current", label: `Upcoming ${current.length}` },
              { value: "past", label: `Past ${past.length}` },
            ]}
            value={frame}
            onChange={setFrame}
          />
          {list.length === 0 ? (
            <View style={styles.note}>
              <Text style={styles.muted}>
                {frame === "current"
                  ? "Find a group in Community to claim your first share."
                  : "Collected and cancelled orders will appear here."}
              </Text>
            </View>
          ) : (
            <View>
              {list.map((o) => (
                <OrderRow key={o.id} order={o} showStatus />
              ))}
            </View>
          )}
          {organizing > 0 && (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/(tabs)/organize")}
              style={styles.note}
            >
              <Text style={styles.text}>
                You organize {organizing} group{organizing === 1 ? "" : "s"}.
              </Text>
              <Text style={[styles.muted, { color: C.blue }]}>
                See them in Organize, including your own shares →
              </Text>
            </Pressable>
          )}
        </>
      )}
    </Screen>
  );
}
