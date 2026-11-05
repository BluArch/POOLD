import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import type { Status } from "@poold/contracts";
import { palette as P, type, fonts, brand } from "../theme";

/** Kept so older screens still compile; the new look has no torn-paper edges. */
export function Zigzag(_: { color?: string; top?: boolean }) {
  return null;
}
/** A flexible gap between a label and its value. */
export function DottedLeader(_: { dark?: boolean }) {
  return <View style={{ flex: 1, minWidth: 8 }} />;
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
          paddingHorizontal: 14,
          paddingVertical: 7,
          borderRadius: 999,
          borderWidth: selected || dark ? 0 : 1,
          borderColor: P.line,
          backgroundColor: selected ? P.chalk : P.paper,
        }}
      >
        <Text
          style={{
            ...type.label,
            fontSize: 13,
            color: selected ? P.chalkText : P.ink,
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
type Tone = "neutral" | "urgent" | "good" | "buyer" | "organizer";
const tones: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: P.track, fg: P.ink },
  urgent: { bg: "#FBE3E0", fg: P.beet },
  good: { bg: brand.greenSoft, fg: brand.greenDeep },
  buyer: { bg: brand.yellow, fg: P.ink },
  organizer: { bg: brand.greenDark, fg: P.white },
};
/** Small rounded status label. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: Tone;
}) {
  const t = tones[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: t.bg,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.label,
          fontSize: 12,
          lineHeight: 16,
          color: t.fg,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
/** Older name for Badge. */
export function Stamp({
  children,
  urgent = false,
}: {
  children: string;
  urgent?: boolean;
}) {
  return <Badge tone={urgent ? "urgent" : "neutral"}>{children}</Badge>;
}
export function PriceTag({
  children,
  spots = false,
}: {
  children: string;
  spots?: boolean;
}) {
  return <Badge tone={spots ? "good" : "buyer"}>{children}</Badge>;
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
        height: 6,
        borderRadius: 3,
        backgroundColor: P.track,
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      <View
        style={{ width: `${otherPct * 100}%`, backgroundColor: P.herbSoft }}
      />
      <View
        style={{ width: `${minePct * 100}%`, backgroundColor: brand.orange }}
      />
    </View>
  );
}
export const STATUS_TEXT: Record<Status, string> = {
  draft: "Draft",
  open: "Open",
  locked: "Shares closed",
  shopping: "Shopping",
  ready: "Ready for pickup",
  completed: "Done",
  cancelled: "Cancelled",
};
export function StatusTrack({ status }: { status: Status }) {
  if (status === "draft" || status === "cancelled")
    return (
      <Badge tone={status === "cancelled" ? "urgent" : "neutral"}>
        {STATUS_TEXT[status]}
      </Badge>
    );
  const labels = ["Open", "Closed", "Shopping", "Pickup"];
  const index =
    status === "completed"
      ? 4
      : ["open", "locked", "shopping", "ready"].indexOf(status);
  return (
    <View
      accessible
      accessibilityLabel={`Group status: ${STATUS_TEXT[status]}`}
      style={{ flexDirection: "row", gap: 6 }}
    >
      {labels.map((label, i) => (
        <View key={label} style={{ flex: 1, gap: 6 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= index ? brand.greenDark : P.line,
            }}
          />
          <Text
            style={{
              ...type.mono,
              fontSize: 12,
              fontFamily: i === index ? fonts.label : fonts.mono,
              color: i === index ? P.ink : P.muted,
            }}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
