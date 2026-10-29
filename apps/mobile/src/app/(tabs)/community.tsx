import React, { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { OrderSummary } from "@poold/contracts";
import {
  Screen,
  Button,
  Field,
  Choice,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { OrderRow } from "../../components/OrderRow";
export default function Community() {
  const [filters, setFilters] = useState(false),
    [store, setStore] = useState(""),
    [pickup, setPickup] = useState(""),
    [date, setDate] = useState(""),
    [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const r = useResource<OrderSummary[]>(`/orders?scope=discover${query}`);
  return (
    <Screen
      title="Find your group."
      subtitle={`UVic · ${r.data?.length ?? 0} open groups`}
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <View style={styles.between}>
        <Button secondary onPress={() => setFilters(!filters)}>
          {filters ? "Hide filters" : "Filter groups"}
        </Button>
        <Button secondary onPress={() => router.push("/(tabs)/requests")}>
          Product requests
        </Button>
      </View>
      {filters && (
        <View style={{ gap: 12 }}>
          <Field
            label="Store"
            value={store}
            onChangeText={setStore}
            placeholder="All stores"
          />
          <Field
            label="Pickup place"
            value={pickup}
            onChangeText={setPickup}
            placeholder="Near campus"
          />
          <Field
            label="Pickup date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="Any date"
          />
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {[
              ["", "All"],
              ["community", "Groups"],
              ["quick", "Quick splits"],
            ].map(([v, label]) => (
              <Choice
                key={v}
                label={label}
                selected={kind === v}
                onPress={() => setKind(v)}
              />
            ))}
          </View>
          <Button
            onPress={() =>
              setQuery(
                `${store ? `&store=${encodeURIComponent(store)}` : ""}${pickup ? `&pickup=${encodeURIComponent(pickup)}` : ""}${date ? `&date=${encodeURIComponent(date)}` : ""}${kind ? `&kind=${kind}` : ""}`,
              )
            }
          >
            Apply filters
          </Button>
          <Button
            secondary
            onPress={() => {
              setStore("");
              setPickup("");
              setDate("");
              setKind("");
              setQuery("");
            }}
          >
            Clear filters
          </Button>
        </View>
      )}
      <ResourceState resource={r} />
      <View>
        {r.data?.map((o) => (
          <OrderRow key={o.id} order={o} />
        ))}
      </View>
      {r.data?.length === 0 && !r.loading && (
        <View style={styles.note}>
          <Text style={styles.h3}>No open groups here yet.</Text>
          <Text style={styles.muted}>
            Try different filters or organize a small order.
          </Text>
        </View>
      )}
      <Button
        secondary
        onPress={() =>
          router.push({ pathname: "/(tabs)/create", params: { quick: "true" } })
        }
      >
        Start a one-item quick split
      </Button>
      <Button secondary onPress={() => router.push("/(tabs)/invite")}>
        Open a private invite
      </Button>
    </Screen>
  );
}
