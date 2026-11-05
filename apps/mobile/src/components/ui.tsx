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
  Modal,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import {
  palette as P,
  fonts,
  type,
  shape,
  spacing,
  roles,
  shadow,
  type Role,
} from "../theme";
import { useRole, ROLE_HOME } from "../role";
import { getPref, setPref } from "../storage";
import { TourTarget } from "./Tour";
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
  card: {
    padding: 16,
    borderRadius: shape.card,
    backgroundColor: P.paper,
    gap: 10,
    ...shadow,
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
  pill: { ...type.label, color: P.muted },
  note: {
    backgroundColor: P.track,
    padding: 16,
    borderRadius: shape.card,
    gap: 8,
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
  role: roleOverride,
  roleSwitch = false,
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
  /** Colour the header for this role instead of the current one. */
  role?: Role;
  /** Show the Buying / Organizing switch (home screens). */
  roleSwitch?: boolean;
}) {
  const [childFooter, setChildFooter] = useState<React.ReactNode>(null);
  const current = useRole();
  const colors = roles[roleOverride ?? current.role];
  const band = back ? P.kraft : colors.header;
  return (
    <FooterContext.Provider value={setChildFooter}>
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={{ flex: 1, backgroundColor: band }}
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
            <View
              style={{
                backgroundColor: band,
                borderBottomLeftRadius: back ? 0 : 28,
                borderBottomRightRadius: back ? 0 : 28,
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxWidth: spacing.maxWidth,
                  alignSelf: "center",
                  paddingHorizontal: spacing.page,
                  paddingTop: 12,
                  paddingBottom: back ? 4 : 22,
                  gap: 12,
                }}
              >
                <View style={styles.between}>
                  {back ? (
                    <IconButton
                      name="chevron-back"
                      label="Back"
                      onPress={() =>
                        router.canGoBack()
                          ? router.back()
                          : router.replace(ROLE_HOME[current.role])
                      }
                    />
                  ) : (
                    <Text
                      style={{
                        fontFamily: fonts.title,
                        fontSize: 24,
                        letterSpacing: -0.8,
                        color: colors.headerText,
                      }}
                    >
                      poold
                    </Text>
                  )}
                  {roleSwitch ? (
                    <TourTarget id="role-switch">
                      <RoleSwitch />
                    </TourTarget>
                  ) : (
                    stamp
                  )}
                </View>
                <View style={{ gap: 4 }}>
                  {back && !!subtitle && (
                    <Text style={type.mono}>{subtitle}</Text>
                  )}
                  <Text
                    accessibilityRole="header"
                    style={[
                      back ? type.detailTitle : type.title,
                      { color: back ? P.ink : colors.headerText },
                      titleStyle,
                    ]}
                  >
                    {title}
                  </Text>
                  {!back && !!subtitle && (
                    <Text
                      style={[
                        type.body,
                        { color: colors.headerMuted, fontSize: 14 },
                      ]}
                    >
                      {subtitle}
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
                paddingTop: 18,
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
/** Switch between the buyer side and the organizer side of the app. */
const SWITCH_TEXT: Record<Role, string> = {
  buying: "You’ll see groups to join and the shares you’ve picked.",
  organizing: "You’ll see the groups you run, plus tools to shop and hand out.",
};
/** Switch between the buyer side and the organizer side of the app. */
export function RoleSwitch() {
  const { role, setRole } = useRole();
  const colors = roles[role];
  const [asking, setAsking] = useState<Role | null>(null),
    [dontAsk, setDontAsk] = useState(false);
  const go = (r: Role) => {
    setAsking(null);
    setRole(r);
    router.navigate(ROLE_HOME[r]);
  };
  return (
    <>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          padding: 3,
          borderRadius: 999,
          backgroundColor: colors.headerLight
            ? "rgba(22,22,22,0.07)"
            : "rgba(255,255,255,0.18)",
        }}
      >
        {(["buying", "organizing"] as const).map((r) => {
          const selected = r === role;
          return (
            <Pressable
              key={r}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={roles[r].label}
              onPress={() => {
                if (selected) return;
                void getPref("poold.skipSwitchConfirm").then((skip) =>
                  skip === "yes" ? go(r) : setAsking(r),
                );
              }}
              style={{
                minHeight: 36,
                paddingHorizontal: 12,
                borderRadius: 999,
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: selected ? P.white : "transparent",
              }}
            >
              <Ionicons
                name={roles[r].icon}
                size={15}
                color={selected ? roles[r].accent : colors.headerText}
              />
              <Text
                style={{
                  fontFamily: fonts.label,
                  fontSize: 13,
                  color: selected ? P.ink : colors.headerText,
                }}
              >
                {roles[r].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Modal
        visible={!!asking}
        transparent
        animationType="fade"
        onRequestClose={() => setAsking(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(22,22,22,0.45)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          {asking && (
            <View
              accessibilityViewIsModal
              style={{
                width: "100%",
                maxWidth: 380,
                backgroundColor: P.paper,
                borderRadius: 24,
                padding: 22,
                gap: 12,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: roles[asking].tab,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={roles[asking].icon} size={26} color={P.ink} />
              </View>
              <Text
                accessibilityRole="header"
                style={[type.cardTitle, { textAlign: "center" }]}
              >
                Switch to {roles[asking].label.toLowerCase()}?
              </Text>
              <Text style={[styles.muted, { textAlign: "center" }]}>
                {SWITCH_TEXT[asking]} You can switch back any time.
              </Text>
              <View style={{ alignSelf: "stretch" }}>
                <Check
                  label="Don’t ask me again"
                  value={dontAsk}
                  onChange={setDontAsk}
                />
              </View>
              <View style={{ alignSelf: "stretch", gap: 8 }}>
                <Button
                  onPress={() => {
                    if (dontAsk) void setPref("poold.skipSwitchConfirm", "yes");
                    go(asking);
                  }}
                >
                  {`Switch to ${roles[asking].label}`}
                </Button>
                <Button secondary onPress={() => setAsking(null)}>
                  {`Stay on ${roles[role].label}`}
                </Button>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
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
      <Ionicons name={name} size={22} color={P.ink} />
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
  icon,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  danger?: boolean;
  variant?: "primary" | "secondary" | "outline" | "danger";
  icon?: React.ComponentProps<typeof Ionicons>["name"];
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
  const color = v === "outline" ? (danger ? P.beet : P.ink) : P.white;
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
        borderRadius: 999,
        borderWidth: v === "outline" ? 1.5 : 0,
        borderColor: danger ? "#E7B8B3" : P.line,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
    >
      {icon && <Ionicons name={icon} size={19} color={color} />}
      <Text
        style={{
          fontFamily: fonts.label,
          fontSize: 15,
          lineHeight: 21,
          color,
          textAlign: "center",
          flexShrink: 1,
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
        borderRadius: 999,
        backgroundColor: selected ? P.chalk : P.paper,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontFamily: fonts.label,
          color: selected ? P.chalkText : P.ink,
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
  icon = "basket-outline",
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View style={[styles.note, { alignItems: "center", paddingVertical: 24 }]}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          backgroundColor: P.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={26} color={P.ink} />
      </View>
      <Text style={[styles.h3, { textAlign: "center" }]}>{title}</Text>
      <Text style={[styles.muted, { textAlign: "center" }]}>{message}</Text>
      {children && (
        <View style={{ alignSelf: "stretch", gap: 8 }}>{children}</View>
      )}
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
      {resource.loading && <Loading />}
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
