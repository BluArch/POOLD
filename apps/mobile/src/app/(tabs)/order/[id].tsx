import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { type OrderView } from "@poold/contracts";
import {
  Screen,
  styles,
  useResource,
  ResourceState,
  ErrorText,
  when,
} from "../../../components/ui";
import { post } from "../../../api";
import { Badge, StatusTrack, STATUS_TEXT } from "../../../components/Market";
import { palette as P, type, deadlineLabel } from "../../../theme";
import { Segmented } from "../../../components/Sections";
import { MemberView } from "../../../components/MemberView";
import { OrganizerView } from "../../../components/OrganizerView";
import { useRole } from "../../../role";

type Mode = "organize" | "member";

export default function Order() {
  const { id, invite, view, paid } = useLocalSearchParams<{
    id: string;
    invite?: string;
    view?: string;
    paid?: string;
  }>();
  const role = useRole();
  const r = useResource<OrderView>(
      `/orders/${id}${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`,
    ),
    v = r.data;
  // Organizers land on their tools when they're on the organizing side.
  const [mode, setMode] = useState<Mode>(
    view === "organize" || role.role === "organizing" ? "organize" : "member",
  );
  useEffect(() => {
    if (v && !v.isOrganizer) setMode("member");
    if (v?.isOrganizer && v.order.status === "draft") setMode("organize");
  }, [v?.isOrganizer, v?.order.status]);

  // Back from Stripe test checkout: ask the server to confirm, once.
  const [payError, setPayError] = useState("");
  useEffect(() => {
    if (!paid?.startsWith("cs_test_")) return;
    void post(`/orders/${id}/pay/confirm`, { sessionId: paid })
      .catch((e) => setPayError((e as Error).message))
      .finally(() => {
        router.setParams({ paid: undefined });
        void r.refresh();
      });
  }, [paid]);
  // During pickup, check every few seconds so a confirmed code shows up
  // on the buyer's phone (and the organizer's) without pulling to refresh.
  const live = v?.order.status === "ready" || v?.order.status === "shopping";
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void r.refresh(), 5000);
    return () => clearInterval(timer);
  }, [live, r.refresh]);
  const showOrganizer = !!v?.isOrganizer && mode === "organize";
  const o = v?.order;
  return (
    <Screen
      title={o?.name ?? "Group"}
      subtitle={
        o
          ? `${o.store} · by ${o.organizerName}${o.organizerRating ? ` · ★ ${o.organizerRating.average.toFixed(1)} (${o.organizerRating.count})` : ""}`
          : undefined
      }
      role={showOrganizer ? "organizing" : "buying"}
      stamp={
        o ? (
          <Badge
            tone={
              o.status === "cancelled"
                ? "urgent"
                : o.status === "ready"
                  ? "good"
                  : showOrganizer
                    ? "organizer"
                    : "buyer"
            }
          >
            {o.status === "open"
              ? deadlineLabel(o.deadline)
              : STATUS_TEXT[o.status]}
          </Badge>
        ) : undefined
      }
      back
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <ResourceState resource={r} />
      <ErrorText message={payError} />
      {v && o && (
        <>
          <View style={[styles.card, { gap: 12 }]}>
            <Info icon="location-outline">{o.pickupLocation}</Info>
            <Info icon="time-outline">
              {`Pickup ${when(o.pickupAt)} – ${new Date(o.pickupEnd).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}`}
            </Info>
            <Info icon="people-outline">
              {`${o.memberCount} of ${o.maxMembers} joined`}
            </Info>
            <StatusTrack status={o.status} />
          </View>
          {v.isOrganizer && o.status !== "draft" && (
            <Segmented<Mode>
              options={[
                { value: "organize", label: "Manage group" },
                { value: "member", label: "My share" },
              ]}
              value={mode}
              onChange={setMode}
            />
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

function Info({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  children: string;
}) {
  return (
    <View style={[styles.row, { gap: 10 }]}>
      <Ionicons name={icon} size={18} color={P.muted} />
      <Text style={[type.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}
