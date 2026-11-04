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
  type StyleProp,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import { palette as P, fonts, type, shape, spacing } from "../theme";
/** Compatibility for screens migrated in subsequent commits. */
export const C = { ...P, blue: P.herbText, red: P.beet, soft: P.paper };
export const styles = StyleSheet.create({
  title: type.title,
  h2: type.section,
  h3: type.item,
  text: type.body,
  muted: { ...type.body, color: P.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  section: {
    padding: 16,
    borderWidth: 1,
    borderColor: P.line,
    borderRadius: shape.card,
    backgroundColor: P.paper,
    gap: 10,
  },
  input: {
    ...type.body,
    borderWidth: 1.5,
    borderColor: P.line,
    borderRadius: shape.input,
    padding: 13,
    minHeight: 48,
    backgroundColor: P.paper,
  },
  error: { ...type.body, color: P.beet },
  label: type.label,
  pill: { ...type.mono, textTransform: "uppercase" },
  note: {
    backgroundColor: P.paper,
    padding: 16,
    borderRadius: shape.card,
    gap: 8,
    borderWidth: 1,
    borderColor: P.line,
  },
});
const FooterContext = React.createContext<(node: React.ReactNode) => void>(
  () => {},
);
/** Place a child-owned action in Screen's fixed footer, above navigation. */
export function ScreenFooter({ children }: { children: React.ReactNode }) {
  const setFooter = React.useContext(FooterContext);
  useEffect(() => {
    setFooter(children);
    return () => setFooter(null);
  }, [children, setFooter]);
  return null;
}
export function Screen({
  title,
  subtitle,
  children,
  back = false,
  refreshing = false,
  onRefresh,
  header,
  stamp,
  footer,
  titleStyle,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  back?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  header?: React.ReactNode;
  stamp?: React.ReactNode;
  footer?: React.ReactNode;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const [childFooter, setChildFooter] = useState<React.ReactNode>(null);
  return (
    <FooterContext.Provider value={setChildFooter}>
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={{ flex: 1, backgroundColor: back ? P.kraft : P.chalk }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: P.kraft }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 28 }}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  tintColor={P.herb}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                />
              ) : undefined
            }
          >
            <View style={{ backgroundColor: back ? P.kraft : P.chalk }}>
              <View
                style={{
                  width: "100%",
                  maxWidth: spacing.maxWidth,
                  alignSelf: "center",
                  padding: spacing.page,
                  gap: 14,
                }}
              >
                <View style={styles.between}>
                  {back ? (
                    <IconButton
                      name="arrow-back-outline"
                      label="Back"
                      onPress={() =>
                        router.canGoBack()
                          ? router.back()
                          : router.replace("/(tabs)/community")
                      }
                    />
                  ) : (
                    <Text
                      style={{
                        fontFamily: fonts.italic,
                        fontSize: 24,
                        color: P.chalkText,
                      }}
                    >
                      poold
                    </Text>
                  )}
                  {stamp}
                </View>
                <View style={{ gap: 8 }}>
                  {back && !!subtitle && (
                    <Text style={type.mono}>{subtitle.toUpperCase()}</Text>
                  )}
                  <Text
                    accessibilityRole="header"
                    style={[
                      back ? type.detailTitle : type.title,
                      { color: back ? P.ink : P.chalkText },
                      titleStyle,
                    ]}
                  >
                    {title}
                  </Text>
                  {!back && !!subtitle && (
                    <Text style={[type.mono, { color: P.chalkMuted }]}>
                      {subtitle.toUpperCase()}
                    </Text>
                  )}
                </View>
                {header}
              </View>
            </View>
            <View
              style={{
                width: "100%",
                maxWidth: spacing.maxWidth,
                alignSelf: "center",
                padding: spacing.page,
                gap: spacing.section,
              }}
            >
              {children}
            </View>
          </ScrollView>
          {(footer || childFooter) && (
            <View
              style={{
                paddingHorizontal: 12,
                paddingBottom: 8,
                width: "100%",
                maxWidth: spacing.maxWidth,
                alignSelf: "center",
              }}
            >
              {footer || childFooter}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </FooterContext.Provider>
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
        opacity: pressed ? 0.7 : 1,
        borderRadius: 22,
        backgroundColor: P.paper,
        borderWidth: 1,
        borderColor: P.line,
      })}
    >
      <Ionicons name={name} size={25} color={P.chalk} />
    </Pressable>
  );
}
export function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
  danger = false,
  variant,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  danger?: boolean;
  variant?: "primary" | "secondary" | "outline" | "danger";
}) {
  const v = variant ?? (secondary ? "outline" : danger ? "danger" : "primary");
  const background =
    v === "primary"
      ? P.carrot
      : v === "secondary"
        ? P.chalk
        : v === "danger"
          ? P.beet
          : P.paper;
  const color =
    v === "secondary" || v === "danger"
      ? P.chalkText
      : danger
        ? P.beet
        : v === "primary"
          ? P.actionInk
          : P.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        paddingVertical: 13,
        paddingHorizontal: 20,
        ...(v === "primary" ? shape.tag : { borderRadius: 26 }),
        borderWidth: v === "outline" ? 1.5 : 0,
        borderColor: P.lineStrong,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {v === "primary" && (
        <View
          accessible={false}
          style={{
            position: "absolute",
            left: 9,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: P.paper,
          }}
        />
      )}
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: 15,
          lineHeight: 22,
          color,
          textAlign: "center",
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          { borderColor: focused ? P.chalk : P.line },
          props.multiline ? { minHeight: 90, textAlignVertical: "top" } : null,
          props.style,
        ]}
        placeholderTextColor={P.muted}
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
      aria-pressed={selected}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: selected ? P.ink : P.line,
        borderRadius: 10,
        backgroundColor: selected ? P.chalk : P.paper,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontFamily: fonts.label,
          color: selected ? P.chalkText : P.muted,
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
        color={disabled ? P.muted : P.ink}
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
      color={P.herb}
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
export function EmptyState({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.note}>
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
        <Ionicons name="basket-outline" size={26} color={P.chalk} />
      </View>
      <Text style={styles.h3}>{title}</Text>
      <Text style={styles.muted}>{message}</Text>
      {children}
    </View>
  );
}
export function ResourceState({
  resource,
}: {
  resource: { loading: boolean; error: string; refresh: () => Promise<void> };
}) {
  return (
    <>
      {resource.loading && (
        <View style={styles.note}>
          <Loading />
          <Text style={styles.h3}>Getting things ready</Text>
          <Text style={styles.muted}>
            Your group details will be here shortly.
          </Text>
        </View>
      )}
      {!!resource.error && (
        <View style={styles.note}>
          <Text style={styles.h3}>Couldn’t load this</Text>
          <ErrorText message={resource.error} />
          <Button secondary onPress={() => void resource.refresh()}>
            Retry
          </Button>
        </View>
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
