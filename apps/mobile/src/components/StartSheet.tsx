import React from "react";
import { Pressable, View, Text } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Sheet } from "./Sheet";
import { styles } from "./ui";
import { palette as P } from "../theme";
const destinations = [
  {
    title: "Organize a group order",
    hint: "Plan a shopping run to share.",
    icon: "basket-outline",
    route: "create",
  },
  {
    title: "Join with a private invite",
    hint: "Open a group with its invite code.",
    icon: "key-outline",
    route: "invite",
  },
] as const;
export function StartSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet title="Start something new" visible={visible} onClose={onClose}>
      {destinations.map((d) => (
        <Pressable
          key={d.title}
          accessibilityRole="button"
          accessibilityLabel={d.title}
          onPress={() => {
            onClose();
            router.push({
              pathname: `/(tabs)/${d.route}`,
            });
          }}
          style={[
            styles.row,
            {
              minHeight: 72,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderColor: P.line,
            },
          ]}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: P.track,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={d.icon} size={26} color={P.chalk} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.h3}>{d.title}</Text>
            <Text style={styles.muted}>{d.hint}</Text>
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}
