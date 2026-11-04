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
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { Chip, ChipRow } from "../../components/Market";
import { Sheet } from "../../components/Sheet";
import { Select, DateTimeField } from "../../components/Pickers";
import { useSession } from "../../session";

type Frame = "all" | "soon";
type Day = "any" | "today" | "tomorrow" | "pick";
const ANY_STORE = "Any store",
  ANY_PLACE = "Anywhere";
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Community() {
  const s = useSession();
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
  const mineOrganizing = all.filter((o) => o.organizerId === s.user?.id);
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
      title="Discover"
      subtitle={`${new Date().toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "2-digit" })} · ${all.length} groups open near UVic`}
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
            label={`More filters${place !== ANY_PLACE || day !== "any" ? " · On" : ""}`}
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
      {joined.length > 0 && (
        <View>
          <Text style={[styles.h2, { marginBottom: 12 }]}>You’re in</Text>
          {joined.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </View>
      )}
      {r.data && (
        <View>
          <Text style={[styles.h2, { marginBottom: 12 }]}>Open to join</Text>
          {open.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
          {open.length === 0 && (
            <View style={[styles.note, { marginTop: 10 }]}>
              <Text style={styles.h3}>
                {filtered ? "No groups match." : "No open groups right now."}
              </Text>
              <Text style={styles.muted}>
                {filtered
                  ? "Try clearing a filter."
                  : "Start a group from Start. You can suggest products inside an open group."}
              </Text>
            </View>
          )}
        </View>
      )}
      {mineOrganizing.length > 0 && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/(tabs)/organize")}
          style={styles.note}
        >
          <Text style={styles.text}>
            Your own {mineOrganizing.length} group
            {mineOrganizing.length === 1 ? " is" : "s are"} in My groups.
          </Text>
          <Text style={[styles.muted, { color: P.herbText }]}>
            Go to My groups →
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}
