import React from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { OrderSummary } from "@poold/contracts";
import {
  Screen,
  Button,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
export default function Organize() {
  const r = useResource<OrderSummary[]>("/orders?scope=organizing");
  return (
    <Screen
      title="Make a little go further."
      subtitle="Create a group. Shop, pack, hand out."
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <Button onPress={() => router.push("/(tabs)/create")}>
        Create a group order
      </Button>
      <ResourceState resource={r} />
      {r.data?.length === 0 && (
        <Text style={styles.muted}>
          Your drafts and organized orders will appear here.
        </Text>
      )}
      <View>
        {r.data?.map((o) => (
          <OrderRow key={o.id} order={o} showStatus />
        ))}
      </View>
    </Screen>
  );
}
