import React, { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { OrderSummary } from "@poold/contracts";
import {
  Screen,
  Button,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { Chip, ChipRow } from "../../components/Market";
import { useSession } from "../../session";
type Frame = "upcoming" | "organizing" | "past";
const ended = (o: OrderSummary) =>
  o.status === "completed" || o.status === "cancelled";
export default function MyOrders() {
  const mine = useResource<OrderSummary[]>("/orders?scope=mine");
  const organizing = useResource<OrderSummary[]>("/orders?scope=organizing");
  const resource = {
    loading: mine.loading || organizing.loading,
    error: mine.error || organizing.error,
    refresh: async () => {
      await Promise.all([mine.refresh(), organizing.refresh()]);
    },
  };
  const loaded =
    !resource.loading &&
    !resource.error &&
    mine.data !== null &&
    organizing.data !== null;
  const session = useSession();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const [choice, setChoice] = useState<Frame>("upcoming");
  const frame: Frame =
    filter === "organizing" || filter === "past" || filter === "upcoming"
      ? filter
      : choice;
  const all = [
    ...new Map(
      [...(mine.data ?? []), ...(organizing.data ?? [])].map((o) => [o.id, o]),
    ).values(),
  ];
  const forFrame = (f: Frame) =>
    all.filter((o) =>
      f === "past"
        ? ended(o)
        : !ended(o) &&
          (f !== "upcoming" || o.status !== "draft") &&
          (f !== "organizing" || o.organizerId === session.user?.id),
    );
  const list = forFrame(frame).sort(
    (a, b) =>
      (frame === "organizing"
        ? Number(b.status === "draft") - Number(a.status === "draft")
        : 0) || Date.parse(a.pickupAt) - Date.parse(b.pickupAt),
  );
  return (
    <Screen
      title="My groups"
      subtitle="Your shares and shopping runs"
      onRefresh={() => void resource.refresh()}
      refreshing={resource.loading}
      header={
        <ChipRow>
          {(
            [
              ["upcoming", "Upcoming"],
              ["organizing", "Organizing"],
              ["past", "Past"],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              dark
              label={loaded ? `${label} ${forFrame(value).length}` : label}
              selected={frame === value}
              onPress={() => {
                setChoice(value);
                router.setParams({ filter: value });
              }}
            />
          ))}
        </ChipRow>
      }
    >
      <ResourceState resource={resource} />
      {list.map((o) => (
        <OrderRow
          key={o.id}
          order={o}
          showStatus
          organize={o.organizerId === session.user?.id}
        />
      ))}
      {loaded && !list.length && (
        <View style={styles.note}>
          <Text style={styles.h3}>
            {frame === "past"
              ? "Past groups will appear here."
              : "A little better, together."}
          </Text>
          <Text style={styles.muted}>
            {frame === "organizing"
              ? "Start a group to plan your next shopping run."
              : "Discover a group and claim your first share."}
          </Text>
          <Button
            secondary
            onPress={() =>
              router.push(
                frame === "organizing" ? "/(tabs)/create" : "/(tabs)/community",
              )
            }
          >
            {frame === "organizing" ? "Start a group" : "Discover groups"}
          </Button>
        </View>
      )}
    </Screen>
  );
}
