import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
export const C = {
  ink: "#101c2b",
  muted: "#586a81",
  line: "#d5dce4",
  blue: "#245a89",
  red: "#a12626",
  soft: "#f4f6f8",
};
export const styles = StyleSheet.create({
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -0.8,
    lineHeight: 37,
  },
  h2: { fontSize: 22, fontWeight: "600", color: C.ink, letterSpacing: -0.4 },
  h3: { fontSize: 18, fontWeight: "600", color: C.ink },
  text: { fontSize: 16, color: C.ink, lineHeight: 24 },
  muted: { fontSize: 15, color: C.muted, lineHeight: 23 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  section: {
    paddingVertical: 22,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 7,
    padding: 13,
    minHeight: 48,
    fontSize: 16,
    color: C.ink,
    backgroundColor: "#fff",
  },
  error: { color: C.red, fontSize: 15, lineHeight: 23 },
  label: { fontSize: 14, fontWeight: "600", color: C.ink },
  pill: {
    color: C.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  note: { backgroundColor: C.soft, padding: 16, borderRadius: 8, gap: 8 },
});
export function Screen({
  title,
  subtitle,
  children,
  back = false,
  refreshing = false,
  onRefresh,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  back?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: "#fff" }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 40,
            gap: 20,
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            ) : undefined
          }
        >
          <View style={styles.between}>
            <View style={styles.row}>
              {back && (
                <IconButton
                  name="arrow-back-outline"
                  label="Back"
                  onPress={() =>
                    router.canGoBack()
                      ? router.back()
                      : router.replace("/(tabs)/community")
                  }
                />
              )}
              <Text
                style={{
                  fontSize: 27,
                  fontWeight: "700",
                  letterSpacing: -1,
                  color: C.ink,
                }}
              >
                poold
              </Text>
            </View>
            <View style={styles.row}>
              <IconButton
                name="notifications-outline"
                label="Updates"
                onPress={() => router.push("/(tabs)/updates")}
              />
              <IconButton
                name="person-outline"
                label="Account"
                onPress={() => router.push("/(tabs)/account")}
              />
            </View>
          </View>
          <View style={{ gap: 8, marginTop: 14 }}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {!!subtitle && <Text style={styles.muted}>{subtitle}</Text>}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function IconButton({
  name,
  label,
  onPress,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Ionicons name={name} size={25} color={C.muted} />
    </Pressable>
  );
}
export function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
  danger = false,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        padding: 14,
        minHeight: 48,
        borderRadius: 7,
        borderWidth: secondary ? 1 : 0,
        borderColor: C.line,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: secondary ? "#fff" : danger ? C.red : C.ink,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "600",
          color: secondary ? (danger ? C.red : C.ink) : "#fff",
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        style={[
          styles.input,
          props.multiline ? { minHeight: 90, textAlignVertical: "top" } : null,
          props.style,
        ]}
        placeholderTextColor="#68788b"
      />
    </View>
  );
}
export function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: selected ? C.ink : C.line,
        borderRadius: 7,
        backgroundColor: selected ? C.soft : "#fff",
      }}
    >
      <Text
        style={{
          fontSize: 14,
          color: selected ? C.ink : C.muted,
          fontWeight: selected ? "600" : "400",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Check({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
        paddingVertical: 8,
      }}
    >
      <Ionicons
        name={value ? "checkbox" : "square-outline"}
        size={24}
        color={disabled ? C.muted : C.ink}
      />
      <Text style={[styles.text, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}
export function ErrorText({ message }: { message: string }) {
  return message ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  ) : null;
}
export function Loading() {
  return (
    <ActivityIndicator
      accessibilityLabel="Loading"
      color={C.ink}
      style={{ padding: 30 }}
    />
  );
}
export function useResource<T>(path: string) {
  const generation = useRef(0);
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setError("");
    try {
      const r = await api<T>(path);
      if (version === generation.current) setData(r);
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [path]);
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void refresh();
    }, [refresh]),
  );
  return { data, loading, error, refresh, setData };
}
export function ResourceState({
  resource,
}: {
  resource: { loading: boolean; error: string; refresh: () => Promise<void> };
}) {
  return (
    <>
      {resource.loading && <Loading />}
      <ErrorText message={resource.error} />
      {!!resource.error && (
        <Button secondary onPress={() => void resource.refresh()}>
          Retry
        </Button>
      )}
    </>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}
export const when = (date: string) =>
  new Date(date).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function CurrencyField({
  label,
  valueCents,
  onChangeCents,
}: {
  label: string;
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
}) {
  const [value, setValue] = useState(
    valueCents === null || valueCents === 0 ? "" : String(valueCents / 100),
  );
  useEffect(() => {
    setValue((current) => {
      const parsed = current === "" ? null : Math.round(Number(current) * 100);
      return parsed === valueCents || (parsed === null && valueCents === 0)
        ? current
        : valueCents === null
          ? ""
          : String(valueCents / 100);
    });
  }, [valueCents]);
  return (
    <Field
      label={label}
      keyboardType="decimal-pad"
      value={value}
      onChangeText={(next) => {
        if (!/^\d*(\.\d{0,2})?$/.test(next)) return;
        setValue(next);
        onChangeCents(next === "" ? null : Math.round(Number(next) * 100));
      }}
    />
  );
}
