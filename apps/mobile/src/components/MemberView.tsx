import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { Badge, Chip, ChipRow } from "./Market";
import { palette as P, type, brand } from "../theme";

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
          <Text style={styles.h2}>Choose your shares</Text>
          {full ? (
            <View style={styles.note}>
              <Text style={styles.text}>This group is full.</Text>
            </View>
          ) : (
            <ShareChooser view={v} invite={invite} onSaved={refresh} />
          )}
        </>
      )}
      {!canChange && o.status === "open" && (
        <View style={styles.note}>
          <Text style={styles.text}>Shares closed {when(o.deadline)}.</Text>
        </View>
      )}

      {canChange && !v.isOrganizer && (
        <GroupRequests view={v} invite={invite} />
      )}

      {!canChange && !hasShares && <ItemsReadOnly items={v.items} />}

      {hasShares && <PayShare view={v} />}

      {v.mine?.collectedAt ? (
        <PickedUp view={v} />
      ) : (
        (hasShares || !canChange) && (
          <PickupDetails view={v} refresh={refresh} />
        )
      )}
    </>
  );
}

/** Shown once the organizer confirms the buyer's pickup code. */
function PickedUp({ view: v }: { view: OrderView }) {
  const o = v.order,
    m = v.mine!;
  return (
    <View
      style={[
        styles.card,
        {
          alignItems: "center",
          gap: 10,
          paddingVertical: 26,
          backgroundColor: brand.greenSoft,
        },
      ]}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: brand.greenDark,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="checkmark" size={42} color={P.white} />
      </View>
      <Text style={[type.title, { textAlign: "center" }]}>
        {o.status === "completed" ? "All done!" : "Picked up!"}
      </Text>
      <Text style={[styles.text, { textAlign: "center" }]}>
        {o.organizerName.split(" ")[0]} confirmed your pickup code (
        {when(m.collectedAt!)}). Enjoy your groceries!
      </Text>
      <View style={{ alignSelf: "stretch", gap: 8, marginTop: 6 }}>
        {v.myClaims
          .filter((c) => c.available)
          .map((c) => (
            <ReceiptLine
              key={c.itemId}
              name={`${c.name} ×${c.quantity}`}
              category={v.items.find((i) => i.id === c.itemId)?.category}
              cost={money(c.estimateCents)}
            />
          ))}
        {!v.isOrganizer && (
          <View style={styles.between}>
            <Text style={type.mono}>Paid</Text>
            <Text style={type.label}>{money(m.paidCents)}</Text>
          </View>
        )}
      </View>
      {o.status === "completed" && <Badge tone="good">Group complete</Badge>}
    </View>
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
      title="Want something else?"
      summary={
        open
          ? `${open} request${open === 1 ? "" : "s"} sent`
          : "Ask the organizer to add an item"
      }
    >
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
  const paid = v.mine?.paidCents ?? 0;
  const toPay = v.isOrganizer ? 0 : Math.max(0, total - paid);
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
      // Pay right away so the organizer has the money before shopping.
      if (!v.isOrganizer && total > paid)
        router.push({
          pathname: "/(tabs)/pay/[id]",
          params: { id: v.order.id },
        });
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
                  : toPay > 0
                    ? `Confirm & pay ${money(toPay)}`
                    : v.myClaims.length
                      ? "Save changes"
                      : "Confirm shares"}
            </Button>
          }
        >
          {!releasing && (
            <View>
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
        icon="navigate-outline"
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
        Directions
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
  return (
    <>
      <View style={[styles.card, { gap: 14 }]}>
        <Text style={styles.h2}>Pickup</Text>
        {m && !needsPickup ? (
          <Text style={styles.muted}>Nothing to collect.</Text>
        ) : m?.collectedAt ? (
          <Badge tone="good">{`Collected ${when(m.collectedAt)}`}</Badge>
        ) : v.collectionCode ? (
          <View
            style={{
              backgroundColor: brand.yellow,
              borderRadius: 16,
              padding: 16,
              gap: 4,
              alignItems: "center",
            }}
          >
            <Text style={[type.mono, { color: P.ink }]}>
              Show this code to {o.organizerName.split(" ")[0]}
            </Text>
            <Text
              selectable
              style={{
                ...type.total,
                fontSize: 30,
                lineHeight: 38,
                letterSpacing: 2,
                textAlign: "center",
              }}
            >
              {v.collectionCode.match(/.{1,4}/g)?.join(" ")}
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>
            {o.status === "shopping"
              ? "The organizer is shopping now."
              : "Your pickup code appears after shopping."}
          </Text>
        )}
        {!!v.myClaims.length && (
          <View
            style={{
              borderTopWidth: 1,
              borderColor: P.line,
              paddingTop: 14,
              gap: 10,
            }}
          >
            <Text style={styles.label}>In your bag</Text>
            {v.myClaims.map((c) => (
              <ReceiptLine
                key={c.itemId}
                name={`${c.name} ×${c.quantity}`}
                category={v.items.find((i) => i.id === c.itemId)?.category}
                cost={c.available ? money(c.estimateCents) : "Unavailable"}
              />
            ))}
            <View style={styles.between}>
              <Text style={type.mono}>Estimated total</Text>
              <Text style={type.total}>{money(v.myEstimateCents)}</Text>
            </View>
          </View>
        )}
      </View>
      {m && needsPickup && !m.collectedAt && o.status === "ready" && (
        <Button
          icon="hand-left-outline"
          disabled={a.busy || m.arrived}
          onPress={() =>
            void a.run(async () => {
              await post(`/orders/${o.id}/arrive`);
              await refresh();
            })
          }
        >
          {m.arrived ? "Organizer knows you’re here" : "I’m here"}
        </Button>
      )}
      <DirectionsButton order={o} />
      <ErrorText message={a.error} />
    </>
  );
}

/**
 * Payment status for your shares. Buyers pay when they confirm shares, so the
 * organizer has the money before shopping. Always test mode.
 */
function PayShare({ view: v }: { view: OrderView }) {
  const a = useAction();
  const m = v.mine,
    o = v.order;
  if (!m) return null;
  if (v.isOrganizer)
    return (
      <View style={[styles.note, styles.row, { alignItems: "flex-start" }]}>
        <Ionicons name="information-circle-outline" size={22} color={P.ink} />
        <Text style={[styles.text, { flex: 1 }]}>
          You’re the organizer, so there’s nothing to pay. Your own shares come
          out of the shopping you do with everyone’s payments.
        </Text>
      </View>
    );
  const refunds = m.payments.filter((p) => p.kind === "refund");
  const lastCard = m.payments.find((p) => p.kind === "payment" && p.cardLast4);
  // Stripe test key on the server → Stripe's hosted test checkout.
  // Otherwise → POOLD's own test checkout.
  const start = () =>
    a.run(async () => {
      if (v.payments !== "stripe_test") {
        router.push({ pathname: "/(tabs)/pay/[id]", params: { id: o.id } });
        return;
      }
      const r = await post<{ url?: string }>(`/orders/${o.id}/pay`);
      if (!r.url)
        throw new Error("Stripe test checkout didn’t open. Try again.");
      if (Platform.OS === "web") window.location.assign(r.url);
      else await Linking.openURL(r.url);
    });
  if (m.dueCents > 0 && !["cancelled"].includes(o.status))
    return (
      <View
        style={[
          styles.card,
          { gap: 10, borderWidth: 2, borderColor: brand.orange },
        ]}
      >
        <View style={styles.between}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h2}>
              {m.paidCents > 0 ? "Balance to pay" : "Payment needed"}
            </Text>
            <Text style={type.mono}>
              {m.paidCents > 0
                ? "A price went up or you added shares."
                : `Pay now so ${o.organizerName.split(" ")[0]} can shop for you.`}
            </Text>
          </View>
          <Text style={type.total}>{money(m.dueCents)}</Text>
        </View>
        <Button
          icon="card-outline"
          disabled={a.busy}
          onPress={() => void start()}
        >
          {`Pay ${money(m.dueCents)}`}
        </Button>
        <Text style={[type.mono, { textAlign: "center" }]}>
          Test mode: no real money is charged.
        </Text>
        <ErrorText message={a.error} />
      </View>
    );
  if (m.paidCents <= 0 && !refunds.length) return null;
  return (
    <View style={[styles.card, { gap: 8 }]}>
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={24} color={brand.greenDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>
            {m.paidCents > 0 ? `Paid ${money(m.paidCents)}` : "Fully refunded"}
          </Text>
          <Text style={type.mono}>
            {lastCard
              ? `${lastCard.cardBrand ?? "Card"} •••• ${lastCard.cardLast4}`
              : "Card"}{" "}
            · test payment
          </Text>
        </View>
        <Badge tone="good">Paid</Badge>
      </View>
      {refunds.map((r) => (
        <View key={r.id} style={styles.between}>
          <Text style={[type.mono, { flex: 1 }]}>
            Refunded {when(r.createdAt)}
            {r.note ? ` · ${r.note}` : ""}
          </Text>
          <Text style={[type.label, { color: brand.greenDeep }]}>
            +{money(r.amountCents)}
          </Text>
        </View>
      ))}
    </View>
  );
}
