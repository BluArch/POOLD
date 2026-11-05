import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG, money, type Wishlist } from "@poold/contracts";
import { api, post } from "../../../api";
import {
  Screen,
  Button,
  ErrorText,
  styles,
  useAction,
  useResource,
  ResourceState,
} from "../../../components/ui";
import { Badge } from "../../../components/Market";
import { ItemAdder, wishlistValue } from "../../../components/Wishlist";
import { ItemIcon } from "../../../components/ItemIcon";
import { palette as P, type, brand } from "../../../theme";
import { useRole } from "../../../role";

export default function WishlistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useResource<Wishlist>(`/wishlists/${id}`),
    w = r.data,
    a = useAction(),
    role = useRole();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const open = w?.status === "open";
  const organizing = role.role === "organizing";
  const run = (work: () => Promise<unknown>) =>
    a.run(async () => {
      await work();
      await r.refresh();
    });
  return (
    <Screen
      title={w?.title ?? "Wishlist"}
      subtitle={w ? `${w.store} · ${w.pickupLocation}` : undefined}
      role={organizing ? "organizing" : "buying"}
      stamp={
        w ? (
          <Badge tone={open ? "urgent" : "good"}>
            {open ? "Needs an organizer" : "Being organized"}
          </Badge>
        ) : undefined
      }
      back
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <ResourceState resource={r} />
      {w && (
        <>
          <View style={[styles.card, { gap: 8 }]}>
            <View style={styles.row}>
              <Ionicons
                name="person-circle-outline"
                size={22}
                color={P.muted}
              />
              <Text style={[styles.text, { flex: 1 }]}>
                {w.mine ? "You started this" : `Started by ${w.creatorName}`}
              </Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="people-outline" size={20} color={P.muted} />
              <Text style={[styles.text, { flex: 1 }]}>
                {w.memberCount === 1
                  ? "1 person wants"
                  : `${w.memberCount} people want`}{" "}
                this
                {w.joined ? ", including you" : ""}
              </Text>
            </View>
            {wishlistValue(w) > 0 && (
              <View style={styles.row}>
                <Ionicons name="pricetag-outline" size={20} color={P.muted} />
                <Text style={[styles.text, { flex: 1 }]}>
                  About {money(wishlistValue(w))} in Costco packs
                </Text>
              </View>
            )}
            {!!w.note && (
              <Text style={[styles.muted, { fontStyle: "italic" }]}>
                “{w.note}”
              </Text>
            )}
          </View>

          {!open && (
            <View style={[styles.card, { backgroundColor: brand.greenSoft }]}>
              <Text style={styles.h3}>
                {w.organizerName ?? "Someone"} is organizing this
              </Text>
              <Text style={styles.text}>
                You’ll get an update when it opens, then you can pick your
                shares.
              </Text>
              {!!w.orderId && (
                <Button
                  secondary
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/order/[id]",
                      params: { id: w.orderId! },
                    })
                  }
                >
                  View the group
                </Button>
              )}
            </View>
          )}

          {open && organizing && (
            <View style={[styles.card, { gap: 10 }]}>
              <Text style={styles.h3}>Want to organize this?</Text>
              <Text style={styles.muted}>
                We’ll start a group with these items filled in. You set the
                prices, dates and share sizes, then publish.
              </Text>
              <Button
                icon="clipboard-outline"
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/create",
                    params: { wishlist: w.id },
                  })
                }
              >
                Organize this
              </Button>
            </View>
          )}

          <View style={[styles.card, { gap: 12 }]}>
            <Text style={styles.h2}>Items</Text>
            {w.items.map((i) => {
              const c = CATALOG.find((x) => x.key === i.catalogKey);
              return (
                <View key={i.id} style={[styles.row, { gap: 10 }]}>
                  <ItemIcon
                    item={{ name: i.name, category: c?.category }}
                    size={44}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={type.label}>{i.name}</Text>
                    <Text style={type.mono}>
                      {i.wants === 1
                        ? "1 person wants"
                        : `${i.wants} people want`}{" "}
                      this
                      {c ? ` · pack of ${c.packUnits}` : ""}
                    </Text>
                  </View>
                  {open && !organizing && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: i.wanted }}
                      disabled={a.busy}
                      onPress={() =>
                        void run(() =>
                          api(`/wishlists/${w.id}/items/${i.id}/want`, {
                            method: "PUT",
                            body: JSON.stringify({ wanted: !i.wanted }),
                          }),
                        )
                      }
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        backgroundColor: i.wanted ? P.ink : P.paper,
                        borderWidth: 1,
                        borderColor: i.wanted ? P.ink : P.line,
                      }}
                    >
                      <Text
                        style={[
                          type.label,
                          { fontSize: 13, color: i.wanted ? P.white : P.ink },
                        ]}
                      >
                        {i.wanted ? "Wanted ✓" : "I want this"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            {open && !organizing && (
              <ItemAdder
                label="Add something else"
                exclude={w.items.map((i) => i.name.toLowerCase())}
                onAdd={(item) =>
                  void run(() => post(`/wishlists/${w.id}/items`, item))
                }
              />
            )}
          </View>

          <ErrorText message={a.error} />
          {open && !organizing && !w.joined && (
            <Button
              icon="hand-right-outline"
              disabled={a.busy}
              onPress={() =>
                void run(() =>
                  api(`/wishlists/${w.id}/join`, {
                    method: "PUT",
                    body: JSON.stringify({ joined: true }),
                  }),
                )
              }
            >
              Join this wishlist
            </Button>
          )}
          {open && !organizing && w.joined && !w.mine && (
            <Button
              secondary
              disabled={a.busy}
              onPress={() =>
                void run(() =>
                  api(`/wishlists/${w.id}/join`, {
                    method: "PUT",
                    body: JSON.stringify({ joined: false }),
                  }),
                )
              }
            >
              Leave this wishlist
            </Button>
          )}
          {open &&
            w.mine &&
            (confirmDelete ? (
              <View style={styles.note}>
                <Text style={styles.text}>
                  Delete this wishlist for everyone?
                </Text>
                <Button
                  danger
                  disabled={a.busy}
                  onPress={() =>
                    void a.run(async () => {
                      await api(`/wishlists/${w.id}`, { method: "DELETE" });
                      router.back();
                    })
                  }
                >
                  Delete wishlist
                </Button>
                <Button secondary onPress={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </View>
            ) : (
              <Button secondary danger onPress={() => setConfirmDelete(true)}>
                Delete wishlist
              </Button>
            ))}
        </>
      )}
    </Screen>
  );
}
