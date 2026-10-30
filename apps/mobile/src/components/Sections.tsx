import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, styles } from "./ui";

/** A card that expands and collapses, so long screens stay easy to scan. */
export function Collapsible({
  title,
  summary,
  open: controlledOpen,
  onToggle,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? localOpen;
  const toggle = () => {
    if (onToggle) onToggle(!open);
    if (controlledOpen === undefined) setLocalOpen(!open);
  };
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 10,
        backgroundColor: "#fff",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${summary ? `, ${summary}` : ""}`}
        onPress={toggle}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 56,
          paddingHorizontal: 16,
          paddingVertical: 12,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.h3}>{title}</Text>
          {!!summary && <Text style={styles.muted}>{summary}</Text>}
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={22}
          color={C.muted}
        />
      </Pressable>
      {open && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 16,
            gap: 12,
            borderTopWidth: 1,
            borderTopColor: C.line,
            paddingTop: 14,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

/** − n + control for choosing a whole number of shares. */
export function QuantityStepper({
  value,
  max,
  onChange,
  label,
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const btn = (
    icon: "remove" | "add",
    next: number,
    off: boolean,
    a11y: string,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={() => onChange(next)}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: C.line,
        alignItems: "center",
        justifyContent: "center",
        opacity: off ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={C.ink} />
    </Pressable>
  );
  return (
    <View style={[styles.row, { gap: 10 }]}>
      {btn(
        "remove",
        Math.max(0, value - 1),
        disabled || value <= 0,
        `One fewer share of ${label}`,
      )}
      <Text
        accessibilityLabel={`${value} shares of ${label}`}
        style={[styles.h3, { minWidth: 28, textAlign: "center" }]}
      >
        {value}
      </Text>
      {btn(
        "add",
        Math.min(max, value + 1),
        disabled || value >= max,
        `One more share of ${label}`,
      )}
    </View>
  );
}

export function ProgressBar({
  value,
  total,
}: {
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: value }}
      style={{
        height: 8,
        borderRadius: 4,
        backgroundColor: C.soft,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          backgroundColor: C.ink,
        }}
      />
    </View>
  );
}

/** Two-option switch, e.g. "Organize" vs "My share". */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: C.soft,
        borderRadius: 9,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 42,
              borderRadius: 7,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? "#fff" : "transparent",
              borderWidth: selected ? 1 : 0,
              borderColor: C.line,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: selected ? "600" : "400",
                color: selected ? C.ink : C.muted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Numbered progress across the organizer's steps. Reached steps can be revisited. */
export function StepTracker({
  steps,
  current,
  viewing,
  onSelect,
}: {
  steps: string[];
  current: number;
  viewing: number;
  onSelect: (i: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {steps.map((label, i) => {
        const done = i < current,
          active = i === viewing,
          reachable = i <= current;
        return (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityLabel={`Step ${i + 1}: ${label}${done ? ", done" : i === current ? ", current" : ""}`}
            accessibilityState={{ selected: active, disabled: !reachable }}
            disabled={!reachable}
            onPress={() => onSelect(i)}
            style={{ flex: 1, gap: 6, opacity: reachable ? 1 : 0.45 }}
          >
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: i <= current ? C.ink : C.line,
              }}
            />
            <View style={[styles.row, { gap: 5 }]}>
              {done ? (
                <Ionicons name="checkmark-circle" size={16} color={C.ink} />
              ) : (
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: active ? C.ink : C.muted,
                  }}
                >
                  {i + 1}
                </Text>
              )}
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: active ? "700" : "500",
                  color: active ? C.ink : C.muted,
                  textDecorationLine: active ? "underline" : "none",
                }}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
