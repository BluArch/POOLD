import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { palette as P, type } from "../../theme";
import type { Update } from "@poold/contracts";
import { post } from "../../api";
import {
  Screen,
  EmptyState,
  styles,
  Button,
  ErrorText,
  useResource,
  ResourceState,
  useAction,
  when,
} from "../../components/ui";
export default function Updates() {
  const r = useResource<Update[]>("/notifications"),
    a = useAction();
  return (
    <Screen
      title="Updates"
      subtitle="Order changes, invitations and pickup reminders."
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <Button
        secondary
        disabled={a.busy}
        onPress={() =>
          void a.run(async () => {
            await post("/notifications/read");
            await r.refresh();
          })
        }
      >
        Mark all as read
      </Button>
      <ErrorText message={a.error} />
      <ResourceState resource={r} />
      {r.data?.length === 0 && (
        <EmptyState
          title="You’re all caught up"
          message="Your updates will appear here."
        />
      )}
      {r.data?.map((n) => (
        <View key={n.id} style={styles.section}>
          <View style={styles.row}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: /ready for pickup/i.test(n.message)
                  ? P.herb
                  : /cancel|unavailable|price changed/i.test(n.message)
                    ? P.beet
                    : P.chalk,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={P.chalkText}
              />
            </View>
            <Text style={[type.label, { flex: 1 }]}>
              {/ready for pickup/i.test(n.message)
                ? "Ready for pickup"
                : n.seen
                  ? "Group update"
                  : "New update"}
            </Text>
          </View>
          <Text style={styles.pill}>
            {n.seen ? "Read" : "New"} · {when(n.createdAt)}
          </Text>
          <Text style={styles.text}>{n.message}</Text>
          {n.orderId && (
            <Button
              secondary
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/order/[id]",
                  params: { id: n.orderId! },
                })
              }
            >
              View order
            </Button>
          )}
        </View>
      ))}
    </Screen>
  );
}
