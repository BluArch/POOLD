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
  C,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
import { Collapsible, Segmented } from "../../components/Sections";
import { Select, DateTimeField } from "../../components/Pickers";
import { useSession } from "../../session";

type Frame = "community" | "quick";
type Day = "any" | "today" | "tomorrow" | "pick";
const ANY_STORE = "Any store",
  ANY_PLACE = "Anywhere";
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Community() {
  const s = useSession();
  const [frame, setFrame] = useState<Frame>("community"),
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
  const filtered = store !== ANY_STORE || place !== ANY_PLACE || day !== "any";

  const all = r.data ?? [];
  const mineOrganizing = all.filter((o) => o.organizerId === s.user?.id);
  const others = all.filter((o) => o.organizerId !== s.user?.id);
  const inFrame = others.filter((o) => o.kind === frame);
  const joined = inFrame.filter((o) => o.joined);
  const open = inFrame
    .filter((o) => !o.joined)
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  const count = (k: Frame) => others.filter((o) => o.kind === k).length;

  return (
    <Screen
      title="Find your group."
      subtitle="Join a group and take only the share you need."
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <Segmented<Frame>
        options={[
          { value: "community", label: `Groups ${count("community")}` },
          { value: "quick", label: `Quick splits ${count("quick")}` },
        ]}
        value={frame}
        onChange={setFrame}
      />
      <Text style={styles.muted}>
        {frame === "community"
          ? "Shopping runs with several items. Claim shares of what you want."
          : "One item split between a few people."}
      </Text>

      <Collapsible
        title="Filter"
        summary={
          filtered
            ? [
                store !== ANY_STORE && store,
                place !== ANY_PLACE && place,
                day === "today"
                  ? "Pickup today"
                  : day === "tomorrow"
                    ? "Pickup tomorrow"
                    : day === "pick"
                      ? `Pickup ${picked.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`
                      : false,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Store, pickup place or day"
        }
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
            }}
          >
            Clear filters
          </Button>
        )}
      </Collapsible>

      <ResourceState resource={r} />
      {joined.length > 0 && (
        <View>
          <Text style={styles.pill}>You’re in</Text>
          {joined.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </View>
      )}
      {r.data && (
        <View>
          <Text style={styles.pill}>Open to join</Text>
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
                  : frame === "quick"
                    ? "Start a quick split for one item you need."
                    : "Organize a group, or suggest a product below."}
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
            {mineOrganizing.length === 1 ? " is" : "s are"} in Organize.
          </Text>
          <Text style={[styles.muted, { color: C.blue }]}>
            Go to Organize →
          </Text>
        </Pressable>
      )}

      <View style={[styles.section, { gap: 10 }]}>
        <Text style={styles.pill}>More</Text>
        <Button secondary onPress={() => router.push("/(tabs)/requests")}>
          Suggest a product
        </Button>
        <Button
          secondary
          onPress={() =>
            router.push({
              pathname: "/(tabs)/create",
              params: { quick: "true" },
            })
          }
        >
          Start a one-item quick split
        </Button>
        <Button secondary onPress={() => router.push("/(tabs)/invite")}>
          Open a private invite
        </Button>
      </View>
    </Screen>
  );
}
