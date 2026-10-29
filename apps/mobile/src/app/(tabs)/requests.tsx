import React, { useState } from "react";
import { Text, View } from "react-native";
import type { ProductRequest } from "@poold/contracts";
import { api, post } from "../../api";
import {
  Screen,
  styles,
  Button,
  Field,
  ErrorText,
  useResource,
  ResourceState,
  useAction,
} from "../../components/ui";
export default function Requests() {
  const r = useResource<ProductRequest[]>("/requests"),
    a = useAction(),
    [name, setName] = useState(""),
    [note, setNote] = useState("");
  return (
    <Screen
      title="What should we share?"
      subtitle="Suggest a product. See who’s interested."
      back
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <View style={styles.note}>
        <Text style={styles.muted}>
          An interest target helps organizers choose items. Reaching it suggests
          a product; it does not promise a purchase.
        </Text>
      </View>
      <Field
        label="Product suggestion"
        value={name}
        onChangeText={setName}
        placeholder="Frozen blueberries"
      />
      <Field
        label="Why this share would help (optional)"
        value={note}
        onChangeText={setNote}
        multiline
      />
      <Button
        disabled={a.busy || !name.trim()}
        onPress={() =>
          void a.run(async () => {
            await post("/requests", { name, note });
            setName("");
            setNote("");
            await r.refresh();
          })
        }
      >
        Suggest product
      </Button>
      <ErrorText message={a.error} />
      <ResourceState resource={r} />
      {r.data?.length === 0 && (
        <Text style={styles.muted}>Be the first to suggest something.</Text>
      )}
      {r.data?.map((q) => (
        <View key={q.id} style={styles.section}>
          <Text style={styles.h2}>{q.name}</Text>
          {!!q.note && <Text style={styles.muted}>{q.note}</Text>}
          <Text style={styles.text}>
            {q.votes} of {q.target} interested
            {q.votes >= q.target ? " · Interest target reached" : ""}
          </Text>
          <Button
            secondary
            disabled={a.busy}
            onPress={() =>
              void a.run(async () => {
                await api(`/requests/${q.id}/vote`, {
                  method: "PUT",
                  body: JSON.stringify({ voted: !q.voted }),
                });
                await r.refresh();
              })
            }
          >
            {q.voted ? "Remove my vote" : "I’m interested"}
          </Button>
        </View>
      ))}
    </Screen>
  );
}
