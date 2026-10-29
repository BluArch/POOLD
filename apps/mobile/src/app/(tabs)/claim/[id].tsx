import React, { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { type OrderView, money } from "@poold/contracts";
import { api } from "../../../api";
import {
  Screen,
  Button,
  Check,
  Field,
  styles,
  useResource,
  ResourceState,
  useAction,
  ErrorText,
  when,
} from "../../../components/ui";
export default function Claim() {
  const { id, invite } = useLocalSearchParams<{
      id: string;
      invite?: string;
    }>(),
    suffix = invite ? `?invite=${encodeURIComponent(invite)}` : "",
    r = useResource<OrderView>(`/orders/${id}${suffix}`),
    a = useAction();
  const [quantities, setQuantities] = useState<Record<string, string>>({}),
    [attending, setAttending] = useState(false),
    [review, setReview] = useState(false);
  useEffect(() => {
    if (r.data) {
      setQuantities(
        Object.fromEntries(r.data.items.map((i) => [i.id, String(i.mine)])),
      );
      setReview(false);
    }
  }, [r.data]);
  const v = r.data;
  const selections = v?.items.filter((i) => Number(quantities[i.id]) > 0) ?? [];
  const estimate = selections.reduce(
    (n, i) =>
      n +
      (i.available
        ? Math.floor(
            (i.priceCents * Number(quantities[i.id]) +
              Math.floor(i.sharesPerPack / 2)) /
              i.sharesPerPack,
          )
        : 0),
    0,
  );
  const save = () =>
    a.run(async () => {
      await api(`/orders/${id}/claims${suffix}`, {
        method: "PUT",
        body: JSON.stringify({
          revision: v!.order.revision,
          attending,
          claims: v!.items.map((i) => ({
            itemId: i.id,
            quantity: Number(quantities[i.id] || 0),
          })),
        }),
      });
      router.replace({ pathname: "/(tabs)/order/[id]", params: { id } });
    });
  return (
    <Screen
      title={review ? "Confirm your shares." : "Choose what fits."}
      subtitle={v?.order.name}
      back
    >
      <ResourceState resource={r} />
      {v && (
        <>
          {!review ? (
            v.items.map((i) => (
              <View key={i.id} style={styles.section}>
                <Text style={styles.h2}>{i.name}</Text>
                <Text style={styles.text}>
                  {i.shareLabel} · {money(i.shareEstimateCents)} estimated per
                  share
                </Text>
                <Text style={styles.muted}>
                  {i.remaining} shares remaining · You currently have {i.mine}
                </Text>
                {!i.available && (
                  <Text style={styles.error}>
                    Unavailable. Set to 0 to release this item.
                  </Text>
                )}
                <Text style={styles.muted}>{i.storage}</Text>
                <Field
                  label={`Shares of ${i.name}`}
                  keyboardType="number-pad"
                  value={quantities[i.id] ?? "0"}
                  onChangeText={(q) =>
                    setQuantities({ ...quantities, [i.id]: q })
                  }
                />
                <Text style={styles.muted}>
                  Maximum for you: {i.available ? i.remaining + i.mine : 0}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.section}>
              {selections.map((i) => (
                <Text key={i.id} style={styles.text}>
                  {quantities[i.id]} × {i.shareLabel} {i.name}
                </Text>
              ))}
              {selections.length === 0 && (
                <Text style={styles.text}>
                  Release all your shares
                  {!v.isOrganizer ? " and leave this group" : ""}.
                </Text>
              )}
              <Text style={styles.h2}>
                {money(estimate)} estimated product cost
              </Text>
              <Text style={styles.muted}>
                Product-price estimate in CAD. Review any changed prices before
                confirming.
              </Text>
              <Text style={styles.text}>
                {v.order.pickupLocation} · {when(v.order.pickupAt)}
              </Text>
              {selections.length > 0 && (
                <Check
                  label="I can attend this pickup time"
                  value={attending}
                  onChange={setAttending}
                />
              )}
            </View>
          )}
          <ErrorText message={a.error} />
          {!!a.error && (
            <Button secondary onPress={() => void r.refresh()}>
              Refresh availability & prices
            </Button>
          )}
          {review ? (
            <>
              <Button
                disabled={a.busy || (selections.length > 0 && !attending)}
                onPress={() => void save()}
              >
                {a.busy
                  ? "Confirming…"
                  : selections.length
                    ? "Confirm shares"
                    : "Confirm release"}
              </Button>
              <Button secondary onPress={() => setReview(false)}>
                Change selection
              </Button>
            </>
          ) : (
            <Button
              disabled={
                v.order.status !== "open" ||
                Date.parse(v.order.deadline) <= Date.now()
              }
              onPress={() =>
                void a.run(async () => {
                  for (const i of v.items) {
                    const q = Number(quantities[i.id] || 0);
                    if (
                      !Number.isSafeInteger(q) ||
                      q < 0 ||
                      q > (i.available ? i.remaining + i.mine : 0)
                    )
                      throw new Error(
                        `Choose a whole number of available shares for ${i.name}.`,
                      );
                  }
                  setReview(true);
                })
              }
            >
              Review selection
            </Button>
          )}
        </>
      )}
    </Screen>
  );
}
