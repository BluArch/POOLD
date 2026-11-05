import React, { useState } from "react";
import { Text, View } from "react-native";
import { type } from "../../theme";
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

/** Buyer side: groups you've joined, plus the groups you run (labelled). */
export default function MyOrders() {
  const r = useResource<OrderSummary[]>("/orders?scope=mine");
  const session = useSession();
  const [frame, setFrame] = useState<Frame>("upcoming");
  // Groups you organize show here too (once published), in their own
  // section so it's clear you're also the organizer.
  const own = (r.data ?? []).filter((o) => o.organizerId === session.user?.id);
  const joined = (r.data ?? []).filter(
    (o) => o.organizerId !== session.user?.id,
  );
  const inFrame = (f: Frame, list: OrderSummary[]) =>
    list.filter((o) => (f === "past" ? ended(o) : !ended(o)));
  const forFrame = (f: Frame) => [...inFrame(f, joined), ...inFrame(f, own)];
  const ownList = inFrame(frame, own).sort(
    (a, b) => Date.parse(a.pickupAt) - Date.parse(b.pickupAt),
  );
  const list = inFrame(frame, joined).sort(
    (a, b) => Date.parse(a.pickupAt) - Date.parse(b.pickupAt),
  );
  return (
    <Screen
      title="My groups"
      subtitle="Groups you’re in"
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
      {ownList.length > 0 && (
        <View>
          <Text style={[type.section, { marginBottom: 4 }]}>
            Organized by you
          </Text>
          <Text style={[type.mono, { marginBottom: 10 }]}>
            Groups you run. Open one to add your own shares.
          </Text>
          {ownList.map((o) => (
            <OrderRow key={o.id} order={o} showStatus byYou />
          ))}
        </View>
      )}
      {r.data && !list.length && !ownList.length && (
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
