import React from "react";
import { Text, View } from "react-native";
import type { OrderSummary } from "@poold/contracts";
import {
  Screen,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
export default function MyOrders() {
  const r = useResource<OrderSummary[]>("/orders?scope=mine");
  return (
    <Screen
      title="Your shares, together."
      subtitle="Upcoming pickups and past orders."
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <ResourceState resource={r} />
      {r.data?.length === 0 && (
        <Text style={styles.muted}>
          Find a group in Community to claim your first share.
        </Text>
      )}
      {[
        [
          "Current orders",
          r.data?.filter((o) => !["completed", "cancelled"].includes(o.status)),
        ],
        [
          "History",
          r.data?.filter((o) => ["completed", "cancelled"].includes(o.status)),
        ],
      ].map(([label, os]) => (
        <View key={label as string}>
          {(os as OrderSummary[] | undefined)?.length ? (
            <Text style={styles.pill}>{label as string}</Text>
          ) : null}
          {(os as OrderSummary[] | undefined)?.map((o) => (
            <OrderRow key={o.id} order={o} showStatus />
          ))}
        </View>
      ))}
    </Screen>
  );
}
