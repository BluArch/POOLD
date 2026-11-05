import React, { useEffect } from "react";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listenForPush } from "../../push";
import { Tabs, Redirect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../session";
import { Text, View } from "react-native";
import { palette as P, fonts } from "../../theme";
import { useRole } from "../../role";
import { Loading } from "../../components/ui";
export default function TabsLayout() {
  const role = useRole();
  const s = useSession(),
    params = useLocalSearchParams<{ id?: string; invite?: string }>(),
    insets = useSafeAreaInsets(),
    bottom = Math.min(insets.bottom, 20);
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
  // Active tab: filled icon on a coloured pill, so it's obvious where you are.
  const icon =
    (name: "home" | "albums" | "notifications" | "person") =>
    ({ focused }: { focused: boolean; color: unknown; size: number }) => (
      <View
        style={{
          width: 48,
          height: 26,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? role.colors.tab : "transparent",
        }}
      >
        <Ionicons
          name={focused ? name : (`${name}-outline` as const)}
          size={20}
          color={focused ? P.ink : P.muted}
        />
      </View>
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
        tabBarActiveTintColor: P.ink,
        tabBarInactiveTintColor: P.muted,
        tabBarStyle: {
          backgroundColor: P.paper,
          borderTopColor: P.line,
          // Compact bar: phones' home-indicator space is capped so the tabs
          // never take over the screen.
          height: 56 + bottom,
          paddingTop: 4,
          paddingBottom: Math.max(6, bottom),
        },
        tabBarLabel: ({ focused, color, children }) => (
          <Text
            style={{
              fontFamily: focused ? fonts.bold : fonts.medium,
              fontSize: 10.5,
              lineHeight: 14,
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
        options={{ title: "Home", tabBarIcon: icon("home"), ...only(buying) }}
      />
      <Tabs.Screen
        name="hub"
        options={{ title: "Home", tabBarIcon: icon("home"), ...only(!buying) }}
      />
      <Tabs.Screen
        name="my-orders"
        options={{
          title: "My groups",
          tabBarIcon: icon("albums"),
          ...only(buying),
        }}
      />
      <Tabs.Screen
        name="organize"
        options={{
          title: "My groups",
          tabBarIcon: icon("albums"),
          ...only(!buying),
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: "Updates",
          tabBarIcon: icon("notifications"),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Profile", tabBarIcon: icon("person") }}
      />
      {[
        "create",
        "start",
        "invite",
        "order/[id]",
        "requests",
        "claim/[id]",
        "pay/[id]",
      ].map((name) => (
        <Tabs.Screen key={name} name={name} options={only(false)} />
      ))}
    </Tabs>
  );
}
