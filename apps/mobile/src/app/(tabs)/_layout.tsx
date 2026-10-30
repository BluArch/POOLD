import React, { useEffect } from "react";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listenForPush } from "../../push";
import { Tabs, Redirect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../session";
import { C, Loading } from "../../components/ui";
export default function TabsLayout() {
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
  return (
    <Tabs
      // Back returns to the previous screen, not always the first tab.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: "#74808b",
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: C.line,
          height: 64 + insets.bottom,
          paddingTop: 5,
          paddingBottom: Math.max(8, insets.bottom),
        },
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
        sceneStyle: { backgroundColor: "#fff" },
      }}
    >
      <Tabs.Screen
        name="community"
        options={{
          title: "Community",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="people-outline"
              size={size}
              color={typeof color === "string" ? color : C.ink}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="my-orders"
        options={{
          title: "My Orders",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="bag-outline"
              size={size}
              color={typeof color === "string" ? color : C.ink}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="organize"
        options={{
          title: "Organize",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="storefront-outline"
              size={size}
              color={typeof color === "string" ? color : C.ink}
            />
          ),
        }}
      />
      {[
        "invite",
        "order/[id]",
        "create",
        "account",
        "updates",
        "requests",
        "claim/[id]",
      ].map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarButton: () => null,
            tabBarItemStyle: { display: "none" },
          }}
        />
      ))}
    </Tabs>
  );
}
