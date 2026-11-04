import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "./ui";
import { palette as P, type } from "../theme";
import { Chip, ChipRow, ShareBar } from "./Market";

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
        borderColor: P.line,
        borderRadius: 10,
        backgroundColor: P.paper,
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
          <Text style={type.section}>{title}</Text>
          {!!summary && <Text style={type.mono}>{summary}</Text>}
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={22}
          color={P.muted}
        />
      </Pressable>
      {open && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 16,
            gap: 12,
            borderTopWidth: 1,
            borderTopColor: P.line,
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
      hitSlop={2}
      onPress={() => onChange(next)}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: off ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: P.lineStrong,
          backgroundColor: icon === "add" ? P.chalk : P.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={icon}
          size={20}
          color={icon === "add" ? P.chalkText : P.ink}
        />
      </View>
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
  return <ShareBar others={value} yours={0} total={total} />;
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
    <ChipRow>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </ChipRow>
  );
}

/** Earlier work is reached through explicit links, never through the status bars. */
export function SummaryLinks({
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
    <View style={{ gap: 4 }}>
      {steps.map((label, i) =>
        i <= Math.min(current, steps.length - 1) && i !== viewing ? (
          <Pressable
            key={label}
            accessibilityRole="link"
            onPress={() => onSelect(i)}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text
              style={[
                styles.text,
                { color: P.herbText, textDecorationLine: "underline" },
              ]}
            >
              {i === Math.min(current, steps.length - 1)
                ? `Back to ${label.toLowerCase()}`
                : `See ${label.toLowerCase()} summary`}
            </Text>
          </Pressable>
        ) : null,
      )}
    </View>
  );
}
