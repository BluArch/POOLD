import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG, PICKUP_PLACES } from "@poold/contracts";
import { post } from "../../../api";
import {
  Screen,
  Button,
  Field,
  ErrorText,
  styles,
  useAction,
  ScreenFooter,
} from "../../../components/ui";
import { Select } from "../../../components/Pickers";
import { ItemAdder } from "../../../components/Wishlist";
import { ItemIcon } from "../../../components/ItemIcon";
import { palette as P } from "../../../theme";

/** Start a wishlist: what you want, where you'd pick it up. */
export default function NewWishlist() {
  const a = useAction();
  const [title, setTitle] = useState(""),
    [store, setStore] = useState("Costco"),
    [place, setPlace] = useState(PICKUP_PLACES[0].name),
    [note, setNote] = useState(""),
    [items, setItems] = useState<{ name: string; catalogKey: string | null }[]>(
      [],
    );
  return (
    <Screen
      title="Start a wishlist"
      subtitle="Say what you want. Others can join, and an organizer can pick it up."
      back
    >
      <View style={styles.card}>
        <Field
          label="Name"
          value={title}
          onChangeText={setTitle}
          placeholder="Snack run for finals week"
        />
        <Select
          label="Store"
          value={store}
          options={["Costco", "Walmart", "Real Canadian Superstore"]}
          onChange={setStore}
          allowOther
        />
        <Select
          label="Pickup place"
          value={place}
          options={PICKUP_PLACES.map((p) => p.name)}
          onChange={setPlace}
          allowOther
        />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Anything an organizer should know"
          multiline
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>What do you want?</Text>
        {items.map((i) => (
          <View key={i.name} style={styles.row}>
            <ItemIcon
              item={{
                name: i.name,
                category: CATALOG.find((c) => c.key === i.catalogKey)?.category,
              }}
              size={36}
            />
            <Text style={[styles.text, { flex: 1 }]}>{i.name}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${i.name}`}
              onPress={() => setItems(items.filter((x) => x.name !== i.name))}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={22} color={P.muted} />
            </Pressable>
          </View>
        ))}
        <ItemAdder
          label={items.length ? "Add another item" : "Add an item"}
          exclude={items.map((i) => i.name.toLowerCase())}
          onAdd={(item) => setItems([...items, item])}
        />
      </View>
      <ScreenFooter>
        <View style={{ gap: 6 }}>
          <ErrorText message={a.error} />
          <Button
            disabled={a.busy || !title.trim() || !items.length}
            onPress={() =>
              void a.run(async () => {
                const r = await post<{ id: string }>("/wishlists", {
                  title,
                  store,
                  pickupLocation: place,
                  note,
                  items,
                });
                router.replace({
                  pathname: "/(tabs)/wishlist/[id]",
                  params: { id: r.id },
                });
              })
            }
          >
            {a.busy
              ? "Posting…"
              : items.length
                ? `Post wishlist (${items.length} ${items.length === 1 ? "item" : "items"})`
                : "Add an item to post"}
          </Button>
        </View>
      </ScreenFooter>
    </Screen>
  );
}
