import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { OrderSummary, Status } from "@poold/contracts";
import {
  Screen,
  Button,
  EmptyState,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { Segmented } from "../../components/Sections";
import { type, roles } from "../../theme";

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

/** Organizer home: every group you run, sorted by what needs doing. */
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
  const counts = {
    drafts: (r.data ?? []).filter((o) => o.status === "draft").length,
    open: (r.data ?? []).filter((o) => o.status === "open").length,
    active: byFrame("active").length,
  };
  return (
    <Screen
      title="Your groups"
      subtitle="Runs you organize"
      roleSwitch
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
      header={
        <View style={[styles.row, { gap: 8 }]}>
          <Stat value={counts.open} label="Open" />
          <Stat value={counts.active} label="In progress" />
          <Stat value={counts.drafts} label="Drafts" />
        </View>
      }
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: roles.organizing.headerLight
          ? "rgba(255,255,255,0.6)"
          : "rgba(255,255,255,0.16)",
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
