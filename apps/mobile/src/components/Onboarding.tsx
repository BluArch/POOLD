import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "./ui";
import { ItemIcon } from "./ItemIcon";
import { Badge } from "./Market";
import { palette as P, type, brand, shadow, fonts, roles } from "../theme";

type Slide = {
  title: string;
  body: string;
  bg: string;
  art: React.ReactNode;
};

const card = {
  backgroundColor: P.paper,
  borderRadius: 20,
  padding: 16,
  gap: 10,
  width: 280,
  ...shadow,
  shadowOpacity: 0.12,
} as const;

/** Mini versions of real screens, so the intro matches what people will see. */
const SLIDES: Slide[] = [
  {
    title: "Join a group",
    body: "Students near you are already heading to Costco. Hop in.",
    bg: roles.buying.header,
    art: (
      <View style={card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={type.label}>Costco</Text>
          <Badge tone="buyer">2 days left</Badge>
        </View>
        <Text style={type.cardTitle}>Campus pantry run</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <ItemIcon
            item={{ name: "Kraft Dinner", category: "Noodles & pasta" }}
            size={36}
          />
          <ItemIcon
            item={{ name: "Diced tomatoes", category: "Canned goods" }}
            size={36}
          />
          <ItemIcon
            item={{ name: "Rice Krispies", category: "Snacks" }}
            size={36}
          />
        </View>
        <Text style={type.mono}>3 of 6 joined · UVic SUB</Text>
      </View>
    ),
  },
  {
    title: "Pick your share",
    body: "Take 2 cans from a 12-pack. Pay only for what you take.",
    bg: roles.buying.header,
    art: (
      <View style={card}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <ItemIcon
            item={{ name: "Diced tomatoes", category: "Canned goods" }}
            size={48}
          />
          <View style={{ flex: 1 }}>
            <Text style={type.item}>Diced tomatoes</Text>
            <Text style={type.mono}>2 cans per share</Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={[type.label, { fontSize: 18 }]}>$2.25</Text>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Circle icon="remove" />
            <Text style={type.item}>1</Text>
            <Circle icon="add" filled />
          </View>
        </View>
      </View>
    ),
  },
  {
    title: "Pick it up",
    body: "Grab your bag on campus. Show your code and you’re done.",
    bg: roles.buying.header,
    art: (
      <View style={[card, { alignItems: "center" }]}>
        <Text style={type.mono}>Show this code to Maya</Text>
        <Text style={[type.total, { letterSpacing: 2 }]}>4F2A 9C1B</Text>
        <Badge tone="good">Ready for pickup</Badge>
      </View>
    ),
  },
  {
    title: "Or organize one",
    body: "Going shopping anyway? Start a group and split the bulk packs.",
    bg: roles.organizing.header,
    art: (
      <View style={card}>
        <Text style={type.cardTitle}>Your groups</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            ["2", "Open"],
            ["1", "Shopping"],
          ].map(([n, label]) => (
            <View
              key={label}
              style={{
                flex: 1,
                backgroundColor: brand.greenSoft,
                borderRadius: 14,
                padding: 10,
              }}
            >
              <Text style={type.total}>{n}</Text>
              <Text style={type.mono}>{label}</Text>
            </View>
          ))}
        </View>
        <View
          style={{
            backgroundColor: P.carrot,
            borderRadius: 999,
            paddingVertical: 10,
            alignItems: "center",
          }}
        >
          <Text style={[type.label, { color: P.white }]}>New group</Text>
        </View>
      </View>
    ),
  },
];

function Circle({
  icon,
  filled = false,
}: {
  icon: "add" | "remove";
  filled?: boolean;
}) {
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: filled ? P.carrot : P.track,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon} size={18} color={filled ? P.white : P.ink} />
    </View>
  );
}

/** Swipeable intro shown the first time someone opens the app. */
export function Onboarding({
  onDone,
}: {
  onDone: (next: "register" | "login") => void;
}) {
  const [page, setPage] = useState(0),
    [width, setWidth] = useState(0);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const last = page === SLIDES.length - 1;
  const slide = SLIDES[page];
  const dark = false;
  const go = (n: number) => {
    scroller.current?.scrollTo({ x: n * width, animated: true });
    setPage(n);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const n = Math.round(e.nativeEvent.contentOffset.x / width);
    if (n !== page && n >= 0 && n < SLIDES.length) setPage(n);
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: slide.bg }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 8,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.title,
            fontSize: 24,
            letterSpacing: -0.8,
            color: dark ? P.white : P.ink,
          }}
        >
          poold
        </Text>
        {!last && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onDone("register")}
            style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}
          >
            <Text style={[type.label, { color: dark ? P.white : P.ink }]}>
              Skip
            </Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s) => (
          <View
            key={s.title}
            accessibilityLabel={`${s.title}. ${s.body}`}
            style={{
              width: width || 360,
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            {s.art}
          </View>
        ))}
      </ScrollView>
      <View
        style={{
          backgroundColor: P.kraft,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          padding: 24,
          paddingBottom: 28,
          gap: 14,
          width: "100%",
          maxWidth: 640,
          alignSelf: "center",
        }}
      >
        <View
          style={{ flexDirection: "row", gap: 6, justifyContent: "center" }}
        >
          {SLIDES.map((s, n) => (
            <Pressable
              key={s.title}
              accessibilityRole="button"
              accessibilityLabel={`Go to slide ${n + 1}`}
              onPress={() => go(n)}
              hitSlop={8}
            >
              <View
                style={{
                  width: n === page ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: n === page ? P.ink : P.lineStrong,
                }}
              />
            </Pressable>
          ))}
        </View>
        <Text
          accessibilityRole="header"
          style={[type.title, { textAlign: "center" }]}
        >
          {slide.title}
        </Text>
        <Text style={[type.body, { textAlign: "center", color: P.muted }]}>
          {slide.body}
        </Text>
        {last ? (
          <>
            <Button onPress={() => onDone("register")}>Get started</Button>
            <Button secondary onPress={() => onDone("login")}>
              I already have an account
            </Button>
          </>
        ) : (
          <Button onPress={() => go(page + 1)}>Next</Button>
        )}
      </View>
    </SafeAreaView>
  );
}
