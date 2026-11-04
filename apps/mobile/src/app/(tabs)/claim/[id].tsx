import React, { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { type OrderView, money } from "@poold/contracts";
import { api } from "../../../api";
import {
  Screen,
  Button,
  Check,
  styles,
  useResource,
  ResourceState,
  useAction,
  ErrorText,
  when,
  ScreenFooter,
} from "../../../components/ui";
import {
  ShareItemCard,
  ReceiptPanel,
  ReceiptLine,
  estimateFor,
} from "../../../components/Receipt";
import { Zigzag } from "../../../components/Market";
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
    (n, i) => n + estimateFor(i, Number(quantities[i.id] || 0)),
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
      title={review ? "Check your receipt" : "Choose your shares"}
      subtitle={v?.order.name}
      back
    >
      <ResourceState resource={r} />
      {v && (
        <>
          {!review ? (
            v.items.map((i) => (
              <ShareItemCard
                key={i.id}
                item={i}
                quantity={Number(quantities[i.id] || 0)}
                onChange={(q) =>
                  setQuantities({ ...quantities, [i.id]: String(q) })
                }
              />
            ))
          ) : (
            <View>
              <View style={styles.section}>
                {selections.map((i) => (
                  <ReceiptLine
                    key={i.id}
                    name={`${i.name} ×${quantities[i.id]}`}
                    category={i.category}
                    cost={
                      i.available
                        ? money(estimateFor(i, Number(quantities[i.id])))
                        : "Unavailable"
                    }
                  />
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
                  Product-price estimate in CAD. Review any changed prices
                  before confirming.
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
              <Zigzag />
            </View>
          )}
          <ErrorText message={a.error} />
          {!!a.error && (
            <Button secondary onPress={() => void r.refresh()}>
              Refresh availability & prices
            </Button>
          )}
          <ScreenFooter>
            <ReceiptPanel
              items={selections}
              quantity={(id) => Number(quantities[id] || 0)}
              total={estimate}
              organizer={v.order.organizerName}
              action={
                <View style={{ gap: 8 }}>
                  {review ? (
                    <>
                      <Button
                        disabled={
                          a.busy || (selections.length > 0 && !attending)
                        }
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
                </View>
              }
            />
          </ScreenFooter>
        </>
      )}
    </Screen>
  );
}
