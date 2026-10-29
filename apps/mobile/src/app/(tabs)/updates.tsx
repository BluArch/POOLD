import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import type { Update } from "@poold/contracts";
import { post } from "../../api";
import {
  Screen,
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
      title="You’re up to date."
      subtitle="Order changes, invitations and pickup reminders."
      back
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
        <Text style={styles.muted}>Your updates will appear here.</Text>
      )}
      {r.data?.map((n) => (
        <View key={n.id} style={styles.section}>
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
