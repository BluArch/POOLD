import React, { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton, styles } from "./ui";
import { palette as P, type } from "../theme";

export function Sheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [visible, onClose]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: Platform.OS === "web" ? "center" : "flex-end",
          alignItems: "center",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: P.chalk,
            opacity: 0.65,
          }}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={{
            width: "100%",
            maxWidth: 640,
            maxHeight: "85%",
            backgroundColor: P.paper,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: P.line,
          }}
        >
          <View style={[styles.between, { padding: 20 }]}>
            <Text
              accessibilityRole="header"
              style={[type.cardTitle, { flex: 1 }]}
            >
              {title}
            </Text>
            <IconButton
              name="close-outline"
              label={`Close ${title}`}
              onPress={onClose}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14 }}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
