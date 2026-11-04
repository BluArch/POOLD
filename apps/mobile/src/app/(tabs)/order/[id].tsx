import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { type OrderView } from "@poold/contracts";
import {
  Screen,
  styles,
  useResource,
  ResourceState,
  when,
} from "../../../components/ui";
import { Stamp, StatusTrack } from "../../../components/Market";
import { deadlineLabel } from "../../../theme";
import { Segmented } from "../../../components/Sections";
import { MemberView } from "../../../components/MemberView";
import { OrganizerView } from "../../../components/OrganizerView";

type Mode = "organize" | "member";

export default function Order() {
  const { id, invite, view } = useLocalSearchParams<{
    id: string;
    invite?: string;
    view?: string;
  }>();
  const r = useResource<OrderView>(
      `/orders/${id}${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`,
    ),
    v = r.data;
  // Organizers land on their tools when they come from the Organize tab;
  // everyone else (and organizers coming from Community/My Orders) sees the buyer view.
  const [mode, setMode] = useState<Mode>(
    view === "organize" ? "organize" : "member",
  );
  useEffect(() => {
    if (v && !v.isOrganizer) setMode("member");
    if (v?.isOrganizer && v.order.status === "draft") setMode("organize");
  }, [v?.isOrganizer, v?.order.status]);

  const showOrganizer = !!v?.isOrganizer && mode === "organize";
  return (
    <Screen
      title={v?.order.name ?? "Your group."}
      subtitle={
        v
          ? `${v.order.store} · ${v.order.organizerName} · PICKUP ${when(v.order.pickupAt)} · ${v.order.pickupLocation}`
          : undefined
      }
      stamp={
        v ? (
          <Stamp
            urgent={
              v.order.status === "cancelled" ||
              (v.order.status === "open" &&
                Date.parse(v.order.deadline) - Date.now() < 86400000)
            }
          >
            {v.order.status === "open"
              ? deadlineLabel(v.order.deadline)
              : v.order.status}
          </Stamp>
        ) : undefined
      }
      back
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <ResourceState resource={r} />
      {v && (
        <>
          <StatusTrack status={v.order.status} />
          {v.isOrganizer && v.order.status !== "draft" && (
            <View style={{ gap: 6 }}>
              <Segmented<Mode>
                options={[
                  { value: "organize", label: "Organize" },
                  { value: "member", label: "My share" },
                ]}
                value={mode}
                onChange={setMode}
              />
              <Text style={styles.muted}>
                {mode === "organize"
                  ? "Only you see this. Members see the buyer view."
                  : "This is what members see. Your own shares live here."}
              </Text>
            </View>
          )}
          {showOrganizer ? (
            <OrganizerView view={v} refresh={r.refresh} />
          ) : (
            <MemberView view={v} refresh={r.refresh} invite={invite} />
          )}
        </>
      )}
    </Screen>
  );
}
