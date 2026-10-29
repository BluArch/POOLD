import React, { useState } from "react";
import { OrganizerTools, MemberPickup } from "../../../components/Fulfillment";
import * as ExpoLinking from "expo-linking";
import { Linking, Share } from "react-native";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { type OrderView, money, STATUS_LABELS } from "@poold/contracts";
import { post } from "../../../api";
import {
  Screen,
  styles,
  Button,
  Field,
  Choice,
  useResource,
  ResourceState,
  useAction,
  ErrorText,
  when,
} from "../../../components/ui";
export default function Order() {
  const { id, invite } = useLocalSearchParams<{
    id: string;
    invite?: string;
  }>();
  const r = useResource<OrderView>(
      `/orders/${id}${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`,
    ),
    a = useAction(),
    v = r.data;
  const [category, setCategory] = useState("All"),
    [email, setEmail] = useState("");
  return (
    <Screen
      title={v?.order.name ?? "Your group."}
      subtitle={
        v ? `${v.order.store} · ${STATUS_LABELS[v.order.status]}` : undefined
      }
      back
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <ResourceState resource={r} />
      {v && (
        <>
          <Text style={styles.muted}>
            Organized by {v.order.organizerName} · {v.order.memberCount} of{" "}
            {v.order.maxMembers} joined
          </Text>
          <View style={styles.note}>
            <Text style={styles.h3}>{v.order.pickupLocation}</Text>
            <Text style={styles.text}>
              {when(v.order.pickupAt)} – {when(v.order.pickupEnd)}
            </Text>
            <Text style={styles.muted}>
              Shares close {when(v.order.deadline)}
            </Text>
          </View>
          {v.order.status === "draft" && (
            <View style={styles.note}>
              <Text style={styles.h3}>Review before publishing</Text>
              <Text style={styles.muted}>
                {v.order.visibility === "private"
                  ? "Only people with your invite link can join."
                  : "This order will appear in Community."}{" "}
                Membership limit: {v.order.maxMembers}, including you.{" "}
                {v.order.cadence !== "once"
                  ? `Intended cadence: ${v.order.cadence}. Each repeat needs a new draft.`
                  : ""}
              </Text>
              <Button
                secondary
                onPress={() =>
                  router.push({ pathname: "/(tabs)/create", params: { id } })
                }
              >
                Edit draft
              </Button>
              <Button
                disabled={a.busy}
                onPress={() =>
                  void a.run(async () => {
                    await post(`/orders/${id}/publish`);
                    await r.refresh();
                  })
                }
              >
                Publish order
              </Button>
            </View>
          )}
          {v.order.status === "open" &&
            Date.parse(v.order.deadline) > Date.now() && (
              <Button
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/claim/[id]",
                    params: { id, ...(invite ? { invite } : {}) },
                  })
                }
              >
                {v.myClaims.length
                  ? "Edit or release shares"
                  : v.order.memberCount >= v.order.maxMembers && !v.order.joined
                    ? "Group full"
                    : "Choose your shares"}
              </Button>
            )}
          {v.myClaims.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h2}>Your order</Text>
              {v.myClaims.map((c) => (
                <Text style={styles.text} key={c.itemId}>
                  {c.quantity} × {c.shareLabel} {c.name} ·{" "}
                  {c.available ? money(c.estimateCents) : "Unavailable"}
                </Text>
              ))}
              <Text style={styles.h3}>
                {money(v.myEstimateCents)} estimated product cost
              </Text>
              <Text style={styles.muted}>
                Changes close {when(v.order.deadline)}.
              </Text>
            </View>
          )}
          <Text style={styles.h2}>What’s in the order</Text>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {["All", ...new Set(v.items.map((i) => i.category))].map((c) => (
              <Choice
                key={c}
                label={c}
                selected={category === c}
                onPress={() => setCategory(c)}
              />
            ))}
          </View>
          {v.items
            .filter((i) => category === "All" || i.category === category)
            .map((i) => (
              <View key={i.id} style={styles.section}>
                <Text style={styles.h3}>{i.name}</Text>
                <Text style={styles.muted}>
                  {i.packLabel} · {i.packCount} pack
                  {i.packCount !== 1 ? "s" : ""} available
                </Text>
                <Text style={styles.text}>
                  {i.shareLabel} per share · {money(i.shareEstimateCents)}{" "}
                  estimated
                </Text>
                <Text style={styles.muted}>
                  {i.claimed} claimed · {i.remaining} shares left
                  {!i.available ? " · Unavailable" : ""}
                  {i.priceCents !== i.originalPriceCents
                    ? " · Price changed"
                    : ""}
                </Text>
                {!!i.storage && <Text style={styles.muted}>{i.storage}</Text>}
                {i.referenceShareCents !== null &&
                  i.referenceShareCents > i.shareEstimateCents && (
                    <Text style={styles.muted}>
                      Estimated{" "}
                      {money(i.referenceShareCents - i.shareEstimateCents)} less
                      per share than the organizer’s comparable price.
                    </Text>
                  )}
              </View>
            ))}
          {v.isOrganizer && v.inviteToken && v.order.status !== "draft" && (
            <View style={styles.section}>
              <Text style={styles.h3}>Invite someone</Text>
              <Text selectable style={styles.muted}>
                {ExpoLinking.createURL(`/order/${id}`, {
                  queryParams: { invite: v.inviteToken },
                })}
              </Text>
              <Button
                secondary
                onPress={() =>
                  void a.run(() =>
                    Share.share({
                      message: `Join ${v.order.name}: ${ExpoLinking.createURL(`/order/${id}`, { queryParams: { invite: v.inviteToken } })}`,
                    }),
                  )
                }
              >
                Share invite link
              </Button>
              <Text style={styles.muted}>
                Share only with the people you want to invite.
              </Text>
              {v.order.status === "open" && (
                <>
                  <Field
                    label="Invite by email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <Button
                    secondary
                    disabled={a.busy || !email.trim()}
                    onPress={() =>
                      void a.run(async () => {
                        await post(`/orders/${id}/invite`, { email });
                        setEmail("");
                      })
                    }
                  >
                    Send invitation
                  </Button>
                </>
              )}
            </View>
          )}
          <Button
            secondary
            onPress={() =>
              void a.run(async () => {
                const destination =
                  v.order.pickupLat !== null
                    ? `${v.order.pickupLat},${v.order.pickupLng}`
                    : v.order.pickupLocation;
                await Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`,
                );
              })
            }
          >
            Walking directions in Google Maps
          </Button>
          <MemberPickup view={v} refresh={r.refresh} />
          {v.isOrganizer && v.order.status !== "draft" && (
            <OrganizerTools view={v} refresh={r.refresh} />
          )}
          <ErrorText message={a.error} />
        </>
      )}
    </Screen>
  );
}
