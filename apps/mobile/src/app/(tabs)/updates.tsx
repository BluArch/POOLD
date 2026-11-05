import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { palette as P, type, brand } from "../../theme";
import type { Update } from "@poold/contracts";
import { post } from "../../api";
import {
  Screen,
  EmptyState,
  styles,
  ErrorText,
  useResource,
  ResourceState,
  useAction,
  when,
} from "../../components/ui";
import { useRole } from "../../role";

const kind = (message: string) =>
  /ready for pickup/i.test(message)
    ? {
        icon: "bag-check-outline" as const,
        bg: brand.greenSoft,
        fg: brand.greenDeep,
      }
    : /cancel|unavailable|price changed/i.test(message)
      ? { icon: "alert-circle-outline" as const, bg: "#FBE3E0", fg: P.beet }
      : {
          icon: "notifications-outline" as const,
          bg: brand.yellowSoft,
          fg: P.ink,
        };

export default function Updates() {
  const r = useResource<Update[]>("/notifications"),
    a = useAction(),
    role = useRole();
  const unread = r.data?.filter((n) => !n.seen).length ?? 0;
  return (
    <Screen
      title="Updates"
      subtitle={unread ? `${unread} new` : "You’re all caught up"}
      roleSwitch
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      {unread > 0 && (
        <Pressable
          accessibilityRole="button"
          disabled={a.busy}
          onPress={() =>
            void a.run(async () => {
              await post("/notifications/read");
              await r.refresh();
            })
          }
          style={{
            alignSelf: "flex-end",
            minHeight: 36,
            justifyContent: "center",
          }}
        >
          <Text style={[type.label, { color: role.colors.accent }]}>
            Mark all as read
          </Text>
        </Pressable>
      )}
      <ErrorText message={a.error} />
      <ResourceState resource={r} />
      {r.data?.length === 0 && (
        <EmptyState
          icon="notifications-outline"
          title="No updates yet"
          message="Changes to your groups show up here."
        />
      )}
      {r.data && r.data.length > 0 && (
        <View style={[styles.card, { padding: 0, gap: 0, overflow: "hidden" }]}>
          {r.data.map((n, index) => {
            const k = kind(n.message);
            return (
              <Pressable
                key={n.id}
                accessibilityRole={n.orderId ? "button" : undefined}
                disabled={!n.orderId}
                onPress={() =>
                  n.orderId &&
                  router.push({
                    pathname: "/(tabs)/order/[id]",
                    params: { id: n.orderId },
                  })
                }
                style={({ pressed }) => ({
                  flexDirection: "row",
                  gap: 12,
                  padding: 14,
                  borderTopWidth: index ? 1 : 0,
                  borderColor: P.line,
                  backgroundColor: pressed
                    ? P.track
                    : n.seen
                      ? P.paper
                      : "#FFFCF0",
                })}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: k.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={k.icon} size={20} color={k.fg} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={[
                      styles.text,
                      !n.seen && { fontFamily: "Manrope_700Bold" },
                    ]}
                  >
                    {n.message}
                  </Text>
                  <Text style={type.mono}>{when(n.createdAt)}</Text>
                </View>
                {!n.seen && (
                  <View
                    accessibilityLabel="New"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: brand.orange,
                      marginTop: 6,
                    }}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
