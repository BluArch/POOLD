import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, Linking } from "react-native";
import {
  type OrderView,
  type Item,
  type ProductRequest,
  money,
  describeShare,
} from "@poold/contracts";
import { api, post } from "../api";
import {
  Button,
  Check,
  styles,
  ErrorText,
  useAction,
  useResource,
  when,
  ScreenFooter,
} from "./ui";
import { Collapsible } from "./Sections";
import { RequestCard, RequestForm } from "./RequestList";

import {
  estimateFor,
  ShareItemCard,
  ReceiptPanel,
  ReceiptLine,
} from "./Receipt";
import { Zigzag, Chip, ChipRow } from "./Market";
import { palette as P, type } from "../theme";

/** What a buyer sees: available items first, then their own shares, then pickup. */
export function MemberView({
  view: v,
  refresh,
  invite,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
  invite?: string;
}) {
  const o = v.order;
  const canChange = o.status === "open" && Date.parse(o.deadline) > Date.now();
  const hasShares = v.myClaims.some((c) => c.quantity > 0);
  const full = o.memberCount >= o.maxMembers && !o.joined;

  return (
    <>
      {canChange && (
        <>
          <Text style={styles.h2}>Pick from the stall</Text>
          {full ? (
            <View style={styles.note}>
              <Text style={styles.text}>
                Every spot in this group is taken. Check Discover for another
                group.
              </Text>
            </View>
          ) : (
            <ShareChooser view={v} invite={invite} onSaved={refresh} />
          )}
        </>
      )}
      {!canChange && hasShares && (
        <View>
          <View style={styles.section}>
            <Text style={styles.h2}>Your shares</Text>
            {v.myClaims.map((c) => (
              <ReceiptLine
                key={c.itemId}
                name={`${c.name} ×${c.quantity}`}
                category={v.items.find((i) => i.id === c.itemId)?.category}
                cost={c.available ? money(c.estimateCents) : "Unavailable"}
              />
            ))}
            <View style={styles.between}>
              <Text style={type.mono}>EST. TOTAL</Text>
              <Text style={type.total}>{money(v.myEstimateCents)}</Text>
            </View>
            <Text style={styles.muted}>
              Shares are locked. Contact the organizer for changes.
            </Text>
          </View>
          <Zigzag />
        </View>
      )}

      {!canChange && o.status === "open" && (
        <View style={styles.note}>
          <Text style={styles.text}>
            Shares closed {when(o.deadline)}, and the organizer is preparing the
            shopping list.
          </Text>
        </View>
      )}

      {canChange && !v.isOrganizer && (
        <GroupRequests view={v} invite={invite} />
      )}

      {!canChange && !hasShares && <ItemsReadOnly items={v.items} />}

      {(hasShares || !canChange) && (
        <PickupDetails view={v} refresh={refresh} />
      )}

      <Collapsible
        title="About this group"
        summary={`Organized by ${o.organizerName} · ${o.memberCount} of ${o.maxMembers} joined`}
      >
        <Text style={styles.text}>
          {o.store} run organized by {o.organizerName}
        </Text>
        <Text style={styles.muted}>
          Shares close {when(o.deadline)} · Pickup {when(o.pickupAt)} –{" "}
          {when(o.pickupEnd)} at {o.pickupLocation}.
        </Text>
        <Text style={styles.muted}>
          Prices are product estimates in CAD. No payment is handled in the app.
        </Text>
        <DirectionsButton order={o} />
      </Collapsible>
    </>
  );
}

/** Ask the organizer to add something to this group while it's collecting shares. */
function GroupRequests({
  view: v,
  invite,
}: {
  view: OrderView;
  invite?: string;
}) {
  const suffix = invite ? `?invite=${encodeURIComponent(invite)}` : "";
  const r = useResource<ProductRequest[]>(
    `/orders/${v.order.id}/requests${suffix}`,
  );
  const open = r.data?.filter((q) => q.status === "open").length ?? 0;
  return (
    <Collapsible
      title="Suggest a product"
      summary={
        open
          ? `${open} request${open === 1 ? "" : "s"} waiting for the organizer`
          : "Ask the organizer to add an item to this group"
      }
    >
      <Text style={styles.muted}>
        The organizer decides whether to add it. You’ll get an update either
        way.
      </Text>
      <RequestForm
        path={`/orders/${v.order.id}/requests${suffix}`}
        onDone={r.refresh}
        submitLabel="Send request"
        placeholder="Canned chickpeas"
      />
      {r.data?.map((q) => (
        <RequestCard
          key={q.id}
          request={q}
          refresh={r.refresh}
          showTarget={false}
        />
      ))}
    </Collapsible>
  );
}

function ItemsReadOnly({ items }: { items: Item[] }) {
  return (
    <Collapsible title="What’s in the order" summary={`${items.length} items`}>
      {items.map((i) => (
        <View key={i.id} style={{ gap: 2 }}>
          <Text style={styles.text}>{i.name}</Text>
          <Text style={styles.muted}>
            {describeShare(i).share} · {money(i.shareEstimateCents)} ·{" "}
            {i.claimed} claimed
          </Text>
        </View>
      ))}
    </Collapsible>
  );
}

/** Inline share selection with − / + controls, then a short confirm step. */
function ShareChooser({
  view: v,
  invite,
  onSaved,
}: {
  view: OrderView;
  invite?: string;
  onSaved: () => Promise<void>;
}) {
  const a = useAction();
  const initial = useMemo(
    () => Object.fromEntries(v.items.map((i) => [i.id, i.mine])),
    [v.items],
  );
  const [qty, setQty] = useState<Record<string, number>>(initial);
  const [category, setCategory] = useState("All");
  const [attending, setAttending] = useState(v.mine?.attending ?? false);
  useEffect(() => setQty(initial), [initial]);

  const categories = ["All", ...new Set(v.items.map((i) => i.category))];
  const selected = v.items.filter((i) => (qty[i.id] ?? 0) > 0);
  const total = selected.reduce((n, i) => n + estimateFor(i, qty[i.id]), 0);
  const changed = v.items.some((i) => (qty[i.id] ?? 0) !== i.mine);
  const releasing = selected.length === 0;
  const suffix = invite ? `?invite=${encodeURIComponent(invite)}` : "";

  const save = () =>
    a.run(async () => {
      await api(`/orders/${v.order.id}/claims${suffix}`, {
        method: "PUT",
        body: JSON.stringify({
          revision: v.order.revision,
          attending,
          claims: v.items.map((i) => ({
            itemId: i.id,
            quantity: qty[i.id] ?? 0,
          })),
        }),
      });
      await onSaved();
    });

  return (
    <>
      {categories.length > 2 && (
        <ChipRow>
          {categories.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </ChipRow>
      )}
      {v.items
        .filter((i) => category === "All" || i.category === category)
        .map((i) => (
          <ShareItemCard
            key={i.id}
            item={i}
            quantity={qty[i.id] ?? 0}
            onChange={(n) => setQty({ ...qty, [i.id]: n })}
          />
        ))}
      <ScreenFooter>
        <ReceiptPanel
          items={selected}
          quantity={(id) => qty[id] ?? 0}
          total={total}
          organizer={v.order.organizerName}
          action={
            <Button
              disabled={
                a.busy ||
                !changed ||
                (!releasing && !attending) ||
                (releasing && v.myClaims.length === 0)
              }
              danger={releasing && v.myClaims.length > 0}
              onPress={() => void save()}
            >
              {a.busy
                ? "Saving…"
                : releasing
                  ? v.myClaims.length
                    ? "Release all my shares"
                    : "Choose at least one share"
                  : v.myClaims.length
                    ? "Save changes"
                    : "Confirm shares"}
            </Button>
          }
        >
          {!releasing && (
            <View
              style={{
                backgroundColor: P.paper,
                borderRadius: 8,
                paddingHorizontal: 10,
              }}
            >
              <Check
                label="I can attend this pickup time"
                value={attending}
                onChange={setAttending}
              />
            </View>
          )}
          {!!a.error && (
            <View style={styles.note}>
              <ErrorText message={a.error} />
              <Button secondary onPress={() => void onSaved()}>
                Refresh availability & prices
              </Button>
            </View>
          )}
        </ReceiptPanel>
      </ScreenFooter>
    </>
  );
}

/** Opens walking directions to the pickup place in Google Maps. */
export function DirectionsButton({ order: o }: { order: OrderView["order"] }) {
  const a = useAction();
  return (
    <>
      <Button
        secondary
        onPress={() =>
          void a.run(async () => {
            const destination =
              o.pickupLat !== null
                ? `${o.pickupLat},${o.pickupLng}`
                : o.pickupLocation;
            await Linking.openURL(
              `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`,
            );
          })
        }
      >
        {`Walking directions to ${o.pickupLocation}`}
      </Button>
      <ErrorText message={a.error} />
    </>
  );
}

export function PickupDetails({
  view: v,
  refresh,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const a = useAction(),
    m = v.mine,
    o = v.order;
  const needsPickup = !!m?.claims.some((c) => c.available);
  const days = Math.ceil((Date.parse(o.pickupAt) - Date.now()) / 86400000);
  return (
    <>
      <View>
        <Zigzag top />
        <View style={[styles.section, { borderRadius: 0, gap: 16 }]}>
          {m && !needsPickup ? (
            <Text style={styles.h3}>You have nothing to collect.</Text>
          ) : m?.collectedAt ? (
            <Text style={styles.h3}>Collected · {when(m.collectedAt)}</Text>
          ) : (
            <>
              <Text style={type.mono}>
                SHOW THIS CODE TO {o.organizerName.toUpperCase()}
              </Text>
              {v.collectionCode ? (
                <Text
                  selectable
                  style={{
                    ...type.total,
                    fontFamily: "DMMono_500Medium",
                    fontSize: 36,
                    lineHeight: 46,
                    letterSpacing: 1,
                  }}
                >
                  {v.collectionCode.match(/.{1,4}/g)?.join(" ")}
                </Text>
              ) : (
                <Text style={styles.muted}>
                  {o.status === "shopping"
                    ? "The organizer is shopping."
                    : "Your share will be ready after shopping."}
                </Text>
              )}
              {v.collectionCode && (
                <Text style={styles.muted}>
                  Show this to your organizer when you collect your bag.
                </Text>
              )}
            </>
          )}
          <View
            style={{
              borderTopWidth: 1,
              borderStyle: "dashed",
              borderColor: P.line,
              paddingTop: 16,
              gap: 16,
            }}
          >
            <View style={styles.row}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 11,
                  backgroundColor: P.track,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="location-outline" size={24} color={P.chalk} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={type.mono}>PICKUP PLACE</Text>
                <Text style={styles.text}>{o.pickupLocation}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 11,
                  backgroundColor: P.track,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="time-outline" size={24} color={P.chalk} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.text}>
                  {when(o.pickupAt)} – {when(o.pickupEnd)}
                </Text>
                <Text style={type.mono}>
                  {days > 0
                    ? `IN ${days} ${days === 1 ? "DAY" : "DAYS"}`
                    : days === 0
                      ? "PICKUP DAY"
                      : "PICKUP TIME PASSED"}
                </Text>
              </View>
            </View>
          </View>
          {!!v.myClaims.length && (
            <View
              style={{
                borderTopWidth: 1,
                borderStyle: "dashed",
                borderColor: P.line,
                paddingTop: 16,
                gap: 12,
              }}
            >
              <Text style={styles.h2}>In your bag</Text>
              {v.myClaims.map((c) => (
                <ReceiptLine
                  key={c.itemId}
                  name={`${c.name} ×${c.quantity}`}
                  category={v.items.find((i) => i.id === c.itemId)?.category}
                  cost={c.available ? money(c.estimateCents) : "Unavailable"}
                />
              ))}
              <View style={styles.between}>
                <Text style={type.mono}>EST. TOTAL</Text>
                <Text style={type.total}>{money(v.myEstimateCents)}</Text>
              </View>
            </View>
          )}
        </View>
        <Zigzag />
      </View>
      {m && needsPickup && !m.collectedAt && o.status === "ready" && (
        <Button
          disabled={a.busy || m.arrived}
          onPress={() =>
            void a.run(async () => {
              await post(`/orders/${o.id}/arrive`);
              await refresh();
            })
          }
        >
          {m.arrived
            ? "Organizer notified you arrived"
            : "I’m at the pickup place"}
        </Button>
      )}
      <DirectionsButton order={o} />
      <ErrorText message={a.error} />
    </>
  );
}
