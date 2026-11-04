import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listenForPush } from "../../push";
import { Tabs, Redirect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../session";
import { Pressable, View, Text } from "react-native";
import { palette as P, fonts } from "../../theme";
import { StartSheet } from "../../components/StartSheet";
import { Loading } from "../../components/ui";
export default function TabsLayout() {
  const [startOpen, setStartOpen] = useState(false);
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
    <>
      <Tabs
        // Back returns to the previous screen, not always the first tab.
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: P.beet,
          tabBarInactiveTintColor: P.muted,
          tabBarStyle: {
            backgroundColor: P.paper,
            borderTopColor: P.line,
            height: 64 + insets.bottom,
            paddingTop: 5,
            paddingBottom: Math.max(8, insets.bottom),
          },
          tabBarLabel: ({ focused, color, children }) => (
            <Text
              style={{
                fontFamily: focused ? fonts.bold : fonts.medium,
                fontSize: 11,
                lineHeight: 16,
                color: typeof color === "string" ? color : P.muted,
              }}
            >
              {children}
            </Text>
          ),
          tabBarLabelStyle: {
            fontSize: 11,
            lineHeight: 16,
            fontFamily: fonts.label,
          },
          sceneStyle: { backgroundColor: P.paper },
        }}
      >
        <Tabs.Screen
          name="community"
          options={{
            title: "Discover",
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name="compass-outline"
                size={size}
                color={typeof color === "string" ? color : P.ink}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="my-orders"
          options={{
            title: "My groups",
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name="bag-handle-outline"
                size={size}
                color={typeof color === "string" ? color : P.ink}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="start"
          options={{
            title: "Start",
            tabBarButton: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start something new"
                onPress={() => setStartOpen(true)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingBottom: 4,
                }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: P.chalk,
                    borderWidth: 4,
                    borderColor: P.kraft,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: -22,
                  }}
                >
                  <Ionicons name="add" size={30} color={P.chalkText} />
                </View>
                <Text
                  style={{
                    fontFamily: fonts.label,
                    fontSize: 11,
                    color: P.muted,
                  }}
                >
                  Start
                </Text>
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen
          name="updates"
          options={{
            title: "Updates",
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name="notifications-outline"
                size={size}
                color={typeof color === "string" ? color : P.muted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name="person-outline"
                size={size}
                color={typeof color === "string" ? color : P.muted}
              />
            ),
          }}
        />
        {[
          "invite",
          "order/[id]",
          "create",
          "organize",
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
      <StartSheet visible={startOpen} onClose={() => setStartOpen(false)} />
    </>
  );
}
