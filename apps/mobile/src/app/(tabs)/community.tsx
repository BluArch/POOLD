import { palette as P } from "../../theme";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { type OrderSummary, PICKUP_PLACES } from "@poold/contracts";
import {
  Screen,
  Button,
  Choice,
  styles,
  useResource,
  ResourceState,
  EmptyState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { Chip, ChipRow } from "../../components/Market";
import { Sheet } from "../../components/Sheet";
import { Select, DateTimeField } from "../../components/Pickers";
import { useSession } from "../../session";
import { useRole } from "../../role";
import { Ionicons } from "@expo/vector-icons";
import { type as T, brand } from "../../theme";

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={[T.section, { marginBottom: 10 }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

const HOW = [
  { icon: "people-outline", text: "Join a group going to Costco" },
  { icon: "pie-chart-outline", text: "Take only the share you need" },
  { icon: "bag-check-outline", text: "Pick it up on campus" },
] as const;

/** Short starting point for people who haven't joined anything yet. */
function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <View
      style={[styles.card, { backgroundColor: brand.yellowSoft, padding: 0 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[styles.row, { minHeight: 52, paddingHorizontal: 16 }]}
      >
        <Ionicons name="help-circle-outline" size={20} color={P.ink} />
        <Text style={[styles.h3, { flex: 1 }]}>How it works</Text>
        <Text style={T.mono}>{open ? "Hide" : "3 steps"}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={P.muted}
        />
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
          {HOW.map((step, n) => (
            <View key={step.text} style={styles.row}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: P.paper,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={step.icon} size={17} color={P.ink} />
              </View>
              <Text style={[styles.text, { flex: 1 }]}>
                {n + 1}. {step.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

type Frame = "all" | "soon";
type Day = "any" | "today" | "tomorrow" | "pick";
const ANY_STORE = "Any store",
  ANY_PLACE = "Anywhere";
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Community() {
  const s = useSession(),
    role = useRole();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [frame, setFrame] = useState<Frame>("all"),
    [store, setStore] = useState(ANY_STORE),
    [place, setPlace] = useState(ANY_PLACE),
    [day, setDay] = useState<Day>("any"),
    [picked, setPicked] = useState(new Date());
  const date =
    day === "today"
      ? ymd(new Date())
      : day === "tomorrow"
        ? ymd(new Date(Date.now() + 86400000))
        : day === "pick"
          ? ymd(picked)
          : "";
  const query = `${store !== ANY_STORE ? `&store=${encodeURIComponent(store)}` : ""}${place !== ANY_PLACE ? `&pickup=${encodeURIComponent(place)}` : ""}${date ? `&date=${date}` : ""}`;
  const r = useResource<OrderSummary[]>(`/orders?scope=discover${query}`);
  const filtered =
    store !== ANY_STORE ||
    place !== ANY_PLACE ||
    day !== "any" ||
    frame !== "all";

  const all = r.data ?? [];
  const others = all.filter((o) => o.organizerId !== s.user?.id);
  const inFrame = others.filter(
    (o) =>
      frame === "all" ||
      (Date.parse(o.deadline) > Date.now() &&
        Date.parse(o.deadline) - Date.now() <= 86400000),
  );
  const joined = inFrame.filter((o) => o.joined);
  const open = inFrame
    .filter((o) => !o.joined)
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));

  return (
    <Screen
      title="Find a group"
      subtitle={`${others.length} open near UVic`}
      roleSwitch
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
      header={
        <ChipRow>
          <Chip
            dark
            label="All"
            selected={frame === "all" && store === ANY_STORE}
            onPress={() => {
              setFrame("all");
              setStore(ANY_STORE);
            }}
          />
          <Chip
            dark
            label="Closing soon"
            selected={frame === "soon"}
            onPress={() => setFrame(frame === "soon" ? "all" : "soon")}
          />
          {[
            ["Costco", "Costco"],
            ["Walmart", "Walmart"],
            ["Real Canadian Superstore", "Superstore"],
          ].map(([value, label]) => (
            <Chip
              key={value}
              dark
              label={label}
              selected={store === value}
              onPress={() => setStore(store === value ? ANY_STORE : value)}
            />
          ))}
          <Chip
            dark
            label={`Filters${place !== ANY_PLACE || day !== "any" ? " · On" : ""}`}
            onPress={() => setFiltersOpen(true)}
          />
        </ChipRow>
      }
    >
      <Sheet
        title="Filter groups"
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
      >
        <Select
          label="Store"
          value={store}
          options={[ANY_STORE, "Costco", "Walmart", "Real Canadian Superstore"]}
          onChange={(v) => setStore(v || ANY_STORE)}
        />
        <Select
          label="Pickup place"
          value={place}
          options={[ANY_PLACE, ...PICKUP_PLACES.map((p) => p.name)]}
          onChange={setPlace}
        />
        <Text style={styles.label}>Pickup day</Text>
        <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
          {(
            [
              ["any", "Any day"],
              ["today", "Today"],
              ["tomorrow", "Tomorrow"],
              ["pick", "Pick a day"],
            ] as const
          ).map(([v, label]) => (
            <Choice
              key={v}
              label={label}
              selected={day === v}
              onPress={() => setDay(v)}
            />
          ))}
        </View>
        {day === "pick" && (
          <DateTimeField
            label="Pickup day"
            value={picked}
            onChange={setPicked}
            min={new Date(new Date().setHours(0, 0, 0, 0))}
          />
        )}
        {filtered && (
          <Button
            secondary
            onPress={() => {
              setStore(ANY_STORE);
              setPlace(ANY_PLACE);
              setDay("any");
              setFrame("all");
            }}
          >
            Clear filters
          </Button>
        )}
        <Button onPress={() => setFiltersOpen(false)}>Show groups</Button>
      </Sheet>

      <ResourceState resource={r} />
      {r.data && joined.length === 0 && !filtered && <HowItWorks />}
      {joined.length > 0 && (
        <View>
          <SectionTitle>You’re in</SectionTitle>
          {joined.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </View>
      )}
      {r.data && (
        <View>
          <SectionTitle>Open groups</SectionTitle>
          {open.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
          {open.length === 0 && (
            <EmptyState
              icon="search-outline"
              title={filtered ? "No groups match" : "No open groups yet"}
              message={
                filtered
                  ? "Try clearing a filter."
                  : "Check back soon, or start one yourself."
              }
            >
              {filtered ? (
                <Button
                  secondary
                  onPress={() => {
                    setStore(ANY_STORE);
                    setPlace(ANY_PLACE);
                    setDay("any");
                    setFrame("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  secondary
                  onPress={() => {
                    role.setRole("organizing");
                    router.navigate("/(tabs)/create");
                  }}
                >
                  Organize a group
                </Button>
              )}
            </EmptyState>
          )}
        </View>
      )}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/(tabs)/invite")}
        style={[styles.section, styles.row]}
      >
        <Ionicons name="key-outline" size={20} color={P.ink} />
        <Text style={[styles.label, { flex: 1 }]}>Have an invite link?</Text>
        <Ionicons name="chevron-forward" size={18} color={P.muted} />
      </Pressable>
    </Screen>
  );
}
