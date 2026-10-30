import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { OrderSummary, Status } from "@poold/contracts";
import {
  Screen,
  Button,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { Segmented } from "../../components/Sections";

type Frame = "filling" | "active" | "done";

/** Which frame an organized order belongs in. */
const FRAME_OF: Record<Status, Frame> = {
  draft: "filling",
  open: "filling",
  locked: "active",
  shopping: "active",
  ready: "active",
  completed: "done",
  cancelled: "done",
};

const FRAMES: { value: Frame; label: string; empty: string; hint: string }[] = [
  {
    value: "filling",
    label: "Filling up",
    hint: "Drafts and groups still collecting shares.",
    empty: "No groups are filling up. Create one to get started.",
  },
  {
    value: "active",
    label: "In progress",
    hint: "Shares are closed. Shop, then hand out.",
    empty: "Nothing in progress. Close shares on a group to start shopping.",
  },
  {
    value: "done",
    label: "Done",
    hint: "Completed and cancelled groups.",
    empty: "Finished groups will appear here.",
  },
];

export default function Organize() {
  const r = useResource<OrderSummary[]>("/orders?scope=organizing");
  const byFrame = (f: Frame) =>
    (r.data ?? [])
      .filter((o) => FRAME_OF[o.status] === f)
      // Drafts first, then soonest pickup.
      .sort(
        (a, b) =>
          Number(b.status === "draft") - Number(a.status === "draft") ||
          Date.parse(a.pickupAt) - Date.parse(b.pickupAt),
      );
  const [frame, setFrame] = useState<Frame | null>(null);
  // Open the most useful frame first: work in progress, then groups filling up.
  useEffect(() => {
    if (frame || !r.data) return;
    setFrame(
      byFrame("active").length
        ? "active"
        : byFrame("filling").length
          ? "filling"
          : "done",
    );
  }, [r.data]);
  const current = FRAMES.find((f) => f.value === (frame ?? "filling"))!;
  const list = byFrame(current.value);

  return (
    <Screen
      title="Make a little go further."
      subtitle="Groups you organize."
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <Button onPress={() => router.push("/(tabs)/create")}>
        Create a group order
      </Button>
      <ResourceState resource={r} />
      {r.data && (
        <>
          <Segmented<Frame>
            options={FRAMES.map((f) => ({
              value: f.value,
              label: `${f.label} ${byFrame(f.value).length}`,
            }))}
            value={current.value}
            onChange={setFrame}
          />
          <Text style={styles.muted}>{current.hint}</Text>
          {list.length === 0 ? (
            <View style={styles.note}>
              <Text style={styles.muted}>{current.empty}</Text>
            </View>
          ) : (
            <View>
              {list.map((o) => (
                <OrderRow key={o.id} order={o} showStatus organize />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
