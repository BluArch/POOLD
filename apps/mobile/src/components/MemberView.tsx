import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Linking } from "react-native";
import {
  type OrderView,
  type Item,
  type ProductRequest,
  money,
  describeShare,
  claimText,
} from "@poold/contracts";
import { api, post } from "../api";
import {
  Button,
  Check,
  Choice,
  styles,
  ErrorText,
  useAction,
  useResource,
  when,
} from "./ui";
import { Collapsible, QuantityStepper } from "./Sections";
import { RequestCard, RequestForm } from "./RequestList";

const estimateFor = (i: Item, q: number) =>
  i.available
    ? Math.floor(
        (i.priceCents * q + Math.floor(i.sharesPerPack / 2)) / i.sharesPerPack,
      )
    : 0;

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

  const [chooseOpen, setChooseOpen] = useState(!hasShares && canChange);
  const [sharesOpen, setSharesOpen] = useState(hasShares);
  const [pickupOpen, setPickupOpen] = useState(o.status === "ready");

  return (
    <>
      {hasShares && (
        <Collapsible
          title="Your shares"
          summary={`${v.myClaims.reduce((n, c) => n + c.quantity, 0)} shares · ${money(v.myEstimateCents)} estimated`}
          open={sharesOpen}
          onToggle={setSharesOpen}
        >
          {v.myClaims.map((c) => (
            <View key={c.itemId} style={styles.between}>
              <Text style={[styles.text, { flex: 1 }]}>
                {c.name} ·{" "}
                {claimText(
                  c.quantity,
                  v.items.find((i) => i.id === c.itemId) ?? c,
                )}
              </Text>
              <Text style={c.available ? styles.text : styles.error}>
                {c.available ? money(c.estimateCents) : "Unavailable"}
              </Text>
            </View>
          ))}
          <View style={[styles.between, { paddingTop: 4 }]}>
            <Text style={styles.h3}>Estimated total</Text>
            <Text style={styles.h3}>{money(v.myEstimateCents)}</Text>
          </View>
          <Text style={styles.muted}>
            {canChange
              ? `You can change or release shares until ${when(o.deadline)}`
              : "Shares are locked. Contact the organizer for changes."}
          </Text>
          {canChange && (
            <Button
              secondary
              onPress={() => {
                setChooseOpen(true);
                setSharesOpen(false);
              }}
            >
              Edit shares
            </Button>
          )}
        </Collapsible>
      )}

      {canChange && (
        <Collapsible
          title={hasShares ? "Change your shares" : "Choose your shares"}
          summary={
            full
              ? "This group is full"
              : (() => {
                  const n = v.items.filter(
                    (i) => i.available && i.remaining > 0,
                  ).length;
                  return `${n} item${n === 1 ? "" : "s"} with shares left · closes ${when(o.deadline)}`;
                })()
          }
          open={chooseOpen}
          onToggle={setChooseOpen}
        >
          {full ? (
            <Text style={styles.muted}>
              Every spot in this group is taken. Check Community for another
              group.
            </Text>
          ) : (
            <ShareChooser
              view={v}
              invite={invite}
              onSaved={async () => {
                await refresh();
                setChooseOpen(false);
                setSharesOpen(true);
              }}
            />
          )}
        </Collapsible>
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
        <Collapsible
          title="Pickup"
          summary={`${o.pickupLocation} · ${when(o.pickupAt)}`}
          open={pickupOpen}
          onToggle={setPickupOpen}
        >
          <PickupDetails view={v} refresh={refresh} />
        </Collapsible>
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
      title="Want something else?"
      summary={
        open
          ? `${open} request${open === 1 ? "" : "s"} waiting for the organizer`
          : "Ask the organizer to add an item"
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
        <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
          {categories.map((c) => (
            <Choice
              key={c}
              label={c}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>
      )}
      {v.items
        .filter((i) => category === "All" || i.category === category)
        .map((i, index) => {
          const max = i.available ? i.remaining + i.mine : 0;
          const q = qty[i.id] ?? 0;
          return (
            <View
              key={i.id}
              style={{
                gap: 6,
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: "#eef1f4",
              }}
            >
              <View style={styles.between}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.h3}>{i.name}</Text>
                  <Text style={styles.text}>{describeShare(i).share}</Text>
                  <Text style={styles.text}>
                    {money(i.shareEstimateCents)} per share
                  </Text>
                  <Text style={styles.muted}>{describeShare(i).pack}</Text>
                  <Text style={styles.muted}>
                    {!i.available
                      ? "Unavailable"
                      : i.remaining > 0
                        ? `${i.remaining} share${i.remaining === 1 ? "" : "s"} left`
                        : "No shares left"}
                    {i.priceCents !== i.originalPriceCents
                      ? " · Price changed"
                      : ""}
                  </Text>
                </View>
                <QuantityStepper
                  label={i.name}
                  value={q}
                  max={max}
                  onChange={(n) => setQty({ ...qty, [i.id]: n })}
                />
              </View>
              {!!i.storage && <Text style={styles.muted}>{i.storage}</Text>}
              {i.referenceShareCents !== null &&
                i.referenceShareCents > i.shareEstimateCents && (
                  <Text style={styles.muted}>
                    About {money(i.referenceShareCents - i.shareEstimateCents)}{" "}
                    less per share than buying the same at Walmart.
                  </Text>
                )}
            </View>
          );
        })}

      <View style={[styles.note, { marginTop: 4 }]}>
        <View style={styles.between}>
          <Text style={styles.h3}>
            {releasing
              ? "No shares selected"
              : `${selected.length} item${selected.length === 1 ? "" : "s"} selected`}
          </Text>
          <Text style={styles.h3}>{money(total)}</Text>
        </View>
        {!releasing && (
          <>
            <Text style={styles.muted}>
              Pickup at {v.order.pickupLocation}, {when(v.order.pickupAt)}
            </Text>
            <Check
              label="I can attend this pickup time"
              value={attending}
              onChange={setAttending}
            />
          </>
        )}
        <ErrorText message={a.error} />
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
        {!!a.error && (
          <Button secondary onPress={() => void onSaved()}>
            Refresh availability & prices
          </Button>
        )}
      </View>
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
  return (
    <>
      <Text style={styles.text}>{o.pickupLocation}</Text>
      <Text style={styles.muted}>
        {when(o.pickupAt)} – {when(o.pickupEnd)}
      </Text>
      {m &&
        (!needsPickup ? (
          <Text style={styles.muted}>You have nothing to collect.</Text>
        ) : m.collectedAt ? (
          <Text style={styles.h3}>Collected · {when(m.collectedAt)}</Text>
        ) : (
          <>
            <Text style={styles.text}>
              {o.status === "ready"
                ? "Your share is ready to collect."
                : o.status === "shopping"
                  ? "The organizer is shopping."
                  : "Your share will be ready after shopping."}
            </Text>
            {v.collectionCode && (
              <View style={styles.note}>
                <Text style={styles.label}>Your collection code</Text>
                <Text
                  selectable
                  style={{ fontSize: 24, letterSpacing: 1, fontWeight: "700" }}
                >
                  {v.collectionCode.match(/.{1,4}/g)?.join(" ")}
                </Text>
                <Text style={styles.muted}>
                  Show this to your organizer when you collect your bag.
                </Text>
              </View>
            )}
            {o.status === "ready" && (
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
          </>
        ))}
      <DirectionsButton order={o} />
      <ErrorText message={a.error} />
    </>
  );
}
