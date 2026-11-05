import React, { useEffect } from "react";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listenForPush } from "../../push";
import { Tabs, Redirect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../session";
import { Text } from "react-native";
import { palette as P, fonts } from "../../theme";
import { useRole } from "../../role";
import { Loading } from "../../components/ui";
export default function TabsLayout() {
  const role = useRole();
  const s = useSession(),
    params = useLocalSearchParams<{ id?: string; invite?: string }>(),
    insets = useSafeAreaInsets();
  useEffect(() => {
    if (s.user?.verified)
      return listenForPush((id) =>
        router.push({ pathname: "/(tabs)/order/[id]", params: { id } }),
      );
  }, [s.user?.id, s.user?.verified]);
  if (s.loading) return <Loading />;
  if (!s.user?.verified)
    return (
      <Redirect
        href={{
          pathname: "/",
          params: {
            ...(params.id ? { order: params.id } : {}),
            ...(params.invite ? { invite: params.invite } : {}),
          },
        }}
      />
    );
  const buying = role.role === "buying";
  const icon =
    (name: React.ComponentProps<typeof Ionicons>["name"]) =>
    ({ color, size }: { color: unknown; size: number }) => (
      <Ionicons
        name={name}
        size={size}
        color={typeof color === "string" ? color : P.muted}
      />
    );
  // Each role gets its own tabs; the other role's tabs are hidden, not removed,
  // so links between them keep working.
  const only = (show: boolean) =>
    show
      ? {}
      : {
          tabBarButton: () => null,
          tabBarItemStyle: { display: "none" as const },
        };
  return (
    <Tabs
      // Back returns to the previous screen, not always the first tab.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: role.colors.accent,
        tabBarInactiveTintColor: P.muted,
        tabBarStyle: {
          backgroundColor: P.paper,
          borderTopColor: P.line,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(8, insets.bottom),
        },
        tabBarLabel: ({ focused, color, children }) => (
          <Text
            style={{
              fontFamily: focused ? fonts.label : fonts.medium,
              fontSize: 11,
              lineHeight: 16,
              color: typeof color === "string" ? color : P.muted,
            }}
          >
            {children}
          </Text>
        ),
        sceneStyle: { backgroundColor: P.kraft },
      }}
    >
      <Tabs.Screen
        name="community"
        options={{
          title: "Browse",
          tabBarIcon: icon("search-outline"),
          ...only(buying),
        }}
      />
      <Tabs.Screen
        name="my-orders"
        options={{
          title: "My shares",
          tabBarIcon: icon("bag-handle-outline"),
          ...only(buying),
        }}
      />
      <Tabs.Screen
        name="organize"
        options={{
          title: "My groups",
          tabBarIcon: icon("clipboard-outline"),
          ...only(!buying),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "New group",
          tabBarIcon: icon("add-circle-outline"),
          ...only(!buying),
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: "Updates",
          tabBarIcon: icon("notifications-outline"),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Profile", tabBarIcon: icon("person-outline") }}
      />
      {["start", "invite", "order/[id]", "requests", "claim/[id]"].map(
        (name) => (
          <Tabs.Screen key={name} name={name} options={only(false)} />
        ),
      )}
    </Tabs>
  );
}
