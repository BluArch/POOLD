import { palette as P } from "../theme";
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles, Field } from "./ui";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const formatDateTime = (d: Date) =>
  d.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const formatTime = (minutes: number) => {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
};

/** Calendar + time picker. Times are in 30-minute steps, in local time. */
export function DateTimeField({
  label,
  value,
  onChange,
  min,
  hint,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  /** Earliest allowed moment; earlier days and times are disabled. */
  min?: Date;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    new Date(value.getFullYear(), value.getMonth(), 1),
  );
  useEffect(() => {
    if (open) setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [open]);

  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from(
      { length: days },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];
  const minutes = value.getHours() * 60 + value.getMinutes();
  const setDay = (d: Date) => {
    const next = new Date(d);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(min && next < min ? roundUp(min) : next);
  };
  const setMinutes = (m: number) => {
    const next = new Date(value);
    next.setHours(Math.floor(m / 60), m % 60, 0, 0);
    onChange(next);
  };
  const times = Array.from({ length: 48 }, (_, i) => i * 30);
  const tooEarly = (m: number) => {
    if (!min) return false;
    const t = new Date(value);
    t.setHours(Math.floor(m / 60), m % 60, 0, 0);
    return t < min;
  };
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDateTime(value)}. Change`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[
          styles.input,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderColor: open ? P.ink : P.line,
          },
        ]}
      >
        <Text style={styles.text}>{formatDateTime(value)}</Text>
        <Ionicons name="calendar-outline" size={20} color={P.muted} />
      </Pressable>
      {!!hint && <Text style={styles.muted}>{hint}</Text>}
      {open && (
        <View
          style={{
            borderWidth: 1,
            borderColor: P.line,
            borderRadius: 10,
            padding: 8,
            gap: 10,
            backgroundColor: P.paper,
          }}
        >
          <View style={styles.between}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
              style={{ padding: 10, minHeight: 44, minWidth: 44 }}
            >
              <Ionicons name="chevron-back" size={20} color={P.ink} />
            </Pressable>
            <Text style={styles.h3}>
              {month.toLocaleDateString("en-CA", {
                month: "long",
                year: "numeric",
              })}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
              style={{ padding: 10, minHeight: 44, minWidth: 44 }}
            >
              <Ionicons name="chevron-forward" size={20} color={P.ink} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ width: 308 }}>
              <View style={{ flexDirection: "row" }}>
                {DAYS.map((d, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.muted,
                      { width: 44, textAlign: "center", fontSize: 13 },
                    ]}
                  >
                    {d}
                  </Text>
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {cells.map((d, i) => {
                  if (!d)
                    return (
                      <View key={`e${i}`} style={{ width: 44, height: 44 }} />
                    );
                  const disabled = !!min && d < startOfDay(min);
                  const selected = sameDay(d, value);
                  return (
                    <Pressable
                      key={d.toISOString()}
                      accessibilityRole="button"
                      accessibilityLabel={d.toDateString()}
                      accessibilityState={{ selected, disabled }}
                      disabled={disabled}
                      onPress={() => setDay(d)}
                      style={{
                        width: 44,
                        height: 44,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: selected ? P.ink : "transparent",
                          borderWidth:
                            sameDay(d, new Date()) && !selected ? 1 : 0,
                          borderColor: P.line,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            color: selected
                              ? P.paper
                              : disabled
                                ? P.muted
                                : P.ink,
                            fontWeight: selected ? "700" : "400",
                          }}
                        >
                          {d.getDate()}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
          <Text style={styles.label}>Time</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            contentOffset={{ x: Math.max(0, (minutes / 30 - 2) * 88), y: 0 }}
          >
            {times.map((m) => {
              const selected = m === minutes;
              const disabled = tooEarly(m);
              return (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => setMinutes(m)}
                  style={{
                    width: 80,
                    minHeight: 44,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderColor: selected ? P.ink : P.line,
                    backgroundColor: selected ? P.ink : P.paper,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: disabled ? 0.35 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: selected ? P.paper : P.ink,
                      fontWeight: selected ? "600" : "400",
                    }}
                  >
                    {formatTime(m)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={{
              alignSelf: "flex-end",
              minHeight: 44,
              paddingVertical: 8,
              paddingHorizontal: 14,
            }}
          >
            <Text
              style={{ fontWeight: "600", color: P.herbText, fontSize: 15 }}
            >
              Done
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Rounds up to the next half hour. */
export const roundUp = (d: Date) => {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const m = r.getMinutes();
  if (m % 30) r.setMinutes(m + (30 - (m % 30)));
  return r;
};

/** Drop-down list. With `allowOther`, an "Other…" choice lets people type their own. */
export function Select({
  label,
  value,
  options,
  onChange,
  allowOther = false,
  placeholder = "Choose…",
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  allowOther?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const isOther = allowOther && !!value && !options.includes(value);
  const [other, setOther] = useState(isOther);
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${other ? "Other" : value || placeholder}. Change`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[
          styles.input,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderColor: open ? P.ink : P.line,
          },
        ]}
      >
        <Text style={value || other ? styles.text : styles.muted}>
          {other ? "Other" : value || placeholder}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={P.muted}
        />
      </Pressable>
      {open && (
        <View
          accessibilityRole="menu"
          style={{
            borderWidth: 1,
            borderColor: P.line,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {[...options, ...(allowOther ? ["Other"] : [])].map((o) => {
            const selected = o === "Other" ? other : !other && o === value;
            return (
              <Pressable
                key={o}
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
                onPress={() => {
                  setOpen(false);
                  if (o === "Other") {
                    setOther(true);
                    onChange(isOther ? value : "");
                  } else {
                    setOther(false);
                    onChange(o);
                  }
                }}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  minHeight: 44,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  backgroundColor: pressed || selected ? P.paper : P.paper,
                  borderTopWidth: 1,
                  borderTopColor: P.line,
                })}
              >
                <Text style={styles.text}>
                  {o === "Other" ? "Other (type your own)" : o}
                </Text>
                {selected && (
                  <Ionicons name="checkmark" size={20} color={P.ink} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
      {other && (
        <Field
          label={`Your ${label.toLowerCase()}`}
          value={value}
          onChangeText={onChange}
          placeholder="Type a category"
        />
      )}
    </View>
  );
}
