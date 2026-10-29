import React, { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { Screen, Field, Button, ErrorText, styles } from "../../components/ui";
export default function Invite() {
  const [value, setValue] = useState(""),
    [error, setError] = useState("");
  return (
    <Screen
      title="Join a private group."
      subtitle="Use the invite your organizer shared."
      back
    >
      <Field
        label="Invite link"
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        multiline
      />
      <Text style={styles.muted}>
        Invite links open a preview. You join when you confirm your shares.
      </Text>
      <ErrorText message={error} />
      <Button
        onPress={() => {
          const match = value.match(
            /(?:order\/|orders\/)([a-f0-9-]{36})\?invite=([a-f0-9]{64})/,
          );
          if (!match) {
            setError("Enter a complete POOLD invite link.");
            return;
          }
          router.push({
            pathname: "/(tabs)/order/[id]",
            params: { id: match[1], invite: match[2] },
          });
        }}
      >
        View group
      </Button>
    </Screen>
  );
}
