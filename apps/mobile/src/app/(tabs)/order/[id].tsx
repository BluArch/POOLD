import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { type OrderView, STATUS_LABELS } from "@poold/contracts";
import {
  Screen,
  styles,
  useResource,
  ResourceState,
  when,
} from "../../../components/ui";
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
        v ? `${v.order.store} · ${STATUS_LABELS[v.order.status]}` : undefined
      }
      back
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <ResourceState resource={r} />
      {v && (
        <>
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
          {!v.isOrganizer && (
            <Text style={styles.muted}>
              Organized by {v.order.organizerName} · {v.order.memberCount} of{" "}
              {v.order.maxMembers} joined · Pickup {when(v.order.pickupAt)}
            </Text>
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
