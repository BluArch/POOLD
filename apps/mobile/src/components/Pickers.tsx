import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, styles, Field } from "./ui";

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
            borderColor: open ? C.ink : C.line,
          },
        ]}
      >
        <Text style={styles.text}>{formatDateTime(value)}</Text>
        <Ionicons name="calendar-outline" size={20} color={C.muted} />
      </Pressable>
      {!!hint && <Text style={styles.muted}>{hint}</Text>}
      {open && (
        <View
          style={{
            borderWidth: 1,
            borderColor: C.line,
            borderRadius: 10,
            padding: 12,
            gap: 10,
          }}
        >
          <View style={styles.between}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
              style={{ padding: 10 }}
            >
              <Ionicons name="chevron-back" size={20} color={C.ink} />
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
              style={{ padding: 10 }}
            >
              <Ionicons name="chevron-forward" size={20} color={C.ink} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row" }}>
            {DAYS.map((d, i) => (
              <Text
                key={i}
                style={[
                  styles.muted,
                  { flex: 1, textAlign: "center", fontSize: 13 },
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
                  <View key={`e${i}`} style={{ width: "14.28%", height: 40 }} />
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
                    width: "14.28%",
                    height: 40,
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
                      backgroundColor: selected ? C.ink : "transparent",
                      borderWidth: sameDay(d, new Date()) && !selected ? 1 : 0,
                      borderColor: C.line,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: selected ? "#fff" : disabled ? "#b5bec8" : C.ink,
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
                    minHeight: 40,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderColor: selected ? C.ink : C.line,
                    backgroundColor: selected ? C.ink : "#fff",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: disabled ? 0.35 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: selected ? "#fff" : C.ink,
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
              paddingVertical: 8,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ fontWeight: "600", color: C.blue, fontSize: 15 }}>
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
            borderColor: open ? C.ink : C.line,
          },
        ]}
      >
        <Text style={value || other ? styles.text : styles.muted}>
          {other ? "Other" : value || placeholder}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={C.muted}
        />
      </Pressable>
      {open && (
        <View
          accessibilityRole="menu"
          style={{
            borderWidth: 1,
            borderColor: C.line,
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
                  backgroundColor: pressed || selected ? C.soft : "#fff",
                  borderTopWidth: 1,
                  borderTopColor: "#eef1f4",
                })}
              >
                <Text style={styles.text}>
                  {o === "Other" ? "Other (type your own)" : o}
                </Text>
                {selected && (
                  <Ionicons name="checkmark" size={20} color={C.ink} />
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
