import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import Svg, { Path, Line } from "react-native-svg";
import type { Status } from "@poold/contracts";
import { palette as P, type, fonts, shape } from "../theme";

export function Zigzag({
  color = P.paper,
  top = false,
}: {
  color?: string;
  top?: boolean;
}) {
  const [width, setWidth] = useState(360);
  const d = `M0 0 ${Array.from({ length: Math.ceil(width / 12) }, (_, i) => `L${i * 12 + 6} 8 L${i * 12 + 12} 0`).join(" ")} Z`;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg
        aria-hidden={true}
        focusable={false}
        width="100%"
        height={8}
        viewBox={`0 0 ${width} 8`}
        preserveAspectRatio="none"
        style={top ? { transform: [{ rotate: "180deg" }] } : undefined}
      >
        <Path d={d} fill={color} />
      </Svg>
    </View>
  );
}
export function DottedLeader({ dark = false }: { dark?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 8, alignSelf: "center" }}>
      <Svg aria-hidden={true} focusable={false} height={2} width="100%">
        <Line
          x1="0"
          y1="1"
          x2="100%"
          y2="1"
          stroke={dark ? P.chalkLeader : P.lineStrong}
          strokeWidth={1.5}
          strokeDasharray="1 4"
        />
      </Svg>
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
  dark = false,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  dark?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      aria-pressed={!!selected}
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: "center" }}
    >
      <View
        style={{
          minHeight: 36,
          justifyContent: "center",
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: shape.chip,
          borderWidth: 1.5,
          borderColor: dark ? P.chalkLine : P.lineStrong,
          backgroundColor: selected
            ? dark
              ? P.chalkText
              : P.chalk
            : "transparent",
        }}
      >
        <Text
          style={{
            ...type.label,
            fontSize: 13,
            color: selected
              ? dark
                ? P.chalk
                : P.chalkText
              : dark
                ? P.chalkText
                : P.ink,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {children}
    </ScrollView>
  );
}
export function Stamp({
  children,
  urgent = false,
}: {
  children: string;
  urgent?: boolean;
}) {
  const color = urgent ? P.beet : P.chalk;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: color,
        borderRadius: 6,
        paddingHorizontal: 9,
        paddingVertical: 6,
        transform: [{ rotate: "-3deg" }],
      }}
    >
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: 12,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function PriceTag({
  children,
  spots = false,
}: {
  children: string;
  spots?: boolean;
}) {
  return (
    <View
      style={{
        ...shape.tag,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: spots ? P.herb : P.tag,
        paddingVertical: 6,
        paddingLeft: 8,
        paddingRight: 12,
        alignSelf: "flex-start",
      }}
    >
      <View
        style={{
          height: 6,
          width: 6,
          borderRadius: 3,
          backgroundColor: P.paper,
        }}
      />
      <Text
        style={{
          ...type.mono,
          color: spots ? P.white : P.ink,
          fontFamily: spots ? fonts.bold : fonts.mono,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function ShareBar({
  others,
  yours,
  total,
  unit = "shares",
}: {
  others: number;
  yours: number;
  total: number;
  unit?: string;
}) {
  const otherPct = total > 0 ? Math.min(1, Math.max(0, others / total)) : 0;
  const minePct =
    total > 0 ? Math.min(1 - otherPct, Math.max(0, yours / total)) : 0;
  return (
    <View
      accessible
      accessibilityLabel={`${others} of ${total} ${unit} claimed by others, ${yours} by you`}
      style={{
        height: 8,
        borderRadius: 4,
        backgroundColor: P.track,
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      <View
        style={{ width: `${otherPct * 100}%`, backgroundColor: P.herbSoft }}
      />
      <View style={{ width: `${minePct * 100}%`, backgroundColor: P.herb }} />
    </View>
  );
}
export function StatusTrack({ status }: { status: Status }) {
  if (status === "draft" || status === "cancelled")
    return <Stamp urgent={status === "cancelled"}>{status}</Stamp>;
  const labels = [
    "Open",
    "Locked",
    "Shopping",
    status === "completed" ? "Done" : "Ready",
  ];
  const index =
    status === "completed"
      ? 3
      : ["open", "locked", "shopping", "ready"].indexOf(status);
  return (
    <View
      accessible
      accessibilityLabel={`Group status: ${labels[index]}, step ${index + 1} of 4`}
      style={{ flexDirection: "row", gap: 8 }}
    >
      {labels.map((label, i) => (
        <View key={label} style={{ flex: 1, gap: 6 }}>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: i <= index ? P.herb : P.line,
            }}
          />
          <Text
            style={{
              ...type.label,
              fontSize: 13,
              fontFamily: i === index ? fonts.bold : fonts.medium,
              color: i === index ? P.herbText : P.muted,
            }}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
