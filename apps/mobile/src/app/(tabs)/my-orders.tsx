import React, { useState } from "react";
import { router } from "expo-router";
import type { OrderSummary } from "@poold/contracts";
import {
  Screen,
  Button,
  EmptyState,
  useResource,
  ResourceState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { Segmented } from "../../components/Sections";
import { useSession } from "../../session";

type Frame = "upcoming" | "past";
const ended = (o: OrderSummary) =>
  o.status === "completed" || o.status === "cancelled";

/** Buyer side: the groups you've joined. Groups you organize live in Organizing. */
export default function MyOrders() {
  const r = useResource<OrderSummary[]>("/orders?scope=mine");
  const session = useSession();
  const [frame, setFrame] = useState<Frame>("upcoming");
  const joined = (r.data ?? []).filter(
    (o) => o.organizerId !== session.user?.id,
  );
  const forFrame = (f: Frame) =>
    joined.filter((o) => (f === "past" ? ended(o) : !ended(o)));
  const list = forFrame(frame).sort(
    (a, b) => Date.parse(a.pickupAt) - Date.parse(b.pickupAt),
  );
  return (
    <Screen
      title="My shares"
      subtitle="Groups you’ve joined"
      roleSwitch
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
      header={
        <Segmented<Frame>
          options={[
            {
              value: "upcoming",
              label: `Upcoming ${r.data ? forFrame("upcoming").length : ""}`,
            },
            {
              value: "past",
              label: `Past ${r.data ? forFrame("past").length : ""}`,
            },
          ]}
          value={frame}
          onChange={setFrame}
        />
      }
    >
      <ResourceState resource={r} />
      {list.map((o) => (
        <OrderRow key={o.id} order={o} showStatus />
      ))}
      {r.data && !list.length && (
        <EmptyState
          icon="bag-handle-outline"
          title={frame === "past" ? "Nothing here yet" : "No shares yet"}
          message={
            frame === "past"
              ? "Finished groups will show up here."
              : "Join a group and pick your first share."
          }
        >
          {frame === "upcoming" && (
            <Button onPress={() => router.navigate("/(tabs)/community")}>
              Find a group
            </Button>
          )}
        </EmptyState>
      )}
    </Screen>
  );
}
