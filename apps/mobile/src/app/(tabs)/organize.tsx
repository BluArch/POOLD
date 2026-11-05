import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import type { OrderSummary, Status } from "@poold/contracts";
import {
  Screen,
  Button,
  EmptyState,
  useResource,
  ResourceState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { Segmented } from "../../components/Sections";

type Frame = "filling" | "active" | "done";
const FRAME_OF: Record<Status, Frame> = {
  draft: "filling",
  open: "filling",
  locked: "active",
  shopping: "active",
  ready: "active",
  completed: "done",
  cancelled: "done",
};
const FRAMES: { value: Frame; label: string; empty: string }[] = [
  {
    value: "filling",
    label: "Filling up",
    empty: "No groups collecting shares.",
  },
  {
    value: "active",
    label: "In progress",
    empty: "Nothing to shop or hand out.",
  },
  { value: "done", label: "Done", empty: "Finished groups show up here." },
];

/** Organizer side: every group you run, sorted by what needs doing. */
export const ORGANIZE_FRAME_OF = FRAME_OF;
export default function Organize() {
  const r = useResource<OrderSummary[]>("/orders?scope=organizing");
  const byFrame = (f: Frame) =>
    (r.data ?? [])
      .filter((o) => FRAME_OF[o.status] === f)
      .sort(
        (a, b) =>
          Number(b.status === "draft") - Number(a.status === "draft") ||
          Date.parse(a.pickupAt) - Date.parse(b.pickupAt),
      );
  const [frame, setFrame] = useState<Frame | null>(null);
  // Open on the work that needs attention first.
  useEffect(() => {
    if (frame || !r.data) return;
    setFrame(byFrame("active").length ? "active" : "filling");
  }, [r.data]);
  const current = frame ?? "filling";
  const list = byFrame(current);
  return (
    <Screen
      title="My groups"
      subtitle="Every run you organize"
      roleSwitch
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <Button icon="add" onPress={() => router.navigate("/(tabs)/create")}>
        New group
      </Button>
      <ResourceState resource={r} />
      {r.data && (
        <>
          <Segmented<Frame>
            options={FRAMES.map((f) => ({
              value: f.value,
              label: `${f.label} ${byFrame(f.value).length}`,
            }))}
            value={current}
            onChange={setFrame}
          />
          {list.map((o) => (
            <OrderRow key={o.id} order={o} showStatus organize />
          ))}
          {list.length === 0 && (
            <EmptyState
              icon="clipboard-outline"
              title={r.data.length ? "All clear" : "Start your first group"}
              message={
                r.data.length
                  ? FRAMES.find((f) => f.value === current)!.empty
                  : "Pick a store, add items, and choose a pickup spot."
              }
            />
          )}
        </>
      )}
    </Screen>
  );
}
