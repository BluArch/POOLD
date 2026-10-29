import React, { useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import {
  type OrderView,
  type Item,
  type Status,
  money,
} from "@poold/contracts";
import { api, post } from "../api";
import {
  Button,
  Field,
  Check,
  Choice,
  styles,
  ErrorText,
  useAction,
  when,
} from "./ui";
function ItemTools({
  item: i,
  view: v,
  refresh,
}: {
  item: Item;
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const [price, setPrice] = useState(String(i.priceCents / 100)),
    a = useAction();
  const patch = (change: object) =>
    a.run(async () => {
      await api(`/orders/${v.order.id}/items/${i.id}`, {
        method: "PATCH",
        body: JSON.stringify(change),
      });
      await refresh();
    });
  return (
    <View style={styles.section}>
      <Text style={styles.h3}>{i.name}</Text>
      <Text style={styles.text}>
        {i.claimed} × {i.shareLabel} committed
      </Text>
      <Text style={styles.muted}>
        {i.requiredPacks} pack{i.requiredPacks === 1 ? "" : "s"} to buy ·{" "}
        {i.packLabel} · {money(i.priceCents)} each
      </Text>
      {i.shortfall > 0 && i.available && (
        <View style={styles.note}>
          <Text style={styles.text}>
            {i.shortfall} shares unfilled in the required packs.
          </Text>
          <Text style={styles.muted}>
            Decide whether to buy the incomplete pack or skip this item.
            Members’ estimates cover their chosen shares.
          </Text>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            <Choice
              label="Proceed with pack"
              selected={i.shortfallDecision === "proceed"}
              onPress={() => void patch({ shortfallDecision: "proceed" })}
            />
            <Choice
              label="Skip item"
              selected={i.shortfallDecision === "skip"}
              onPress={() => void patch({ shortfallDecision: "skip" })}
            />
          </View>
        </View>
      )}
      <Check
        label={i.available ? "Item available" : "Item unavailable"}
        value={i.available}
        onChange={(available) =>
          void patch({ available, shortfallDecision: "pending" })
        }
        disabled={a.busy}
      />
      <Field
        label={`Pack price for ${i.name} (CAD)`}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
      />
      <Button
        secondary
        disabled={a.busy}
        onPress={() =>
          void patch({ priceCents: Math.round(Number(price) * 100) })
        }
      >
        Update estimated price
      </Button>
      {v.order.status === "shopping" && i.available && i.claimed > 0 && (
        <Check
          label={`Bought ${i.name}`}
          value={i.bought}
          onChange={(bought) => void patch({ bought })}
          disabled={a.busy}
        />
      )}
      <Text style={styles.muted}>{i.storage}</Text>
      <ErrorText message={a.error} />
    </View>
  );
}
export function OrganizerTools({
  view: v,
  refresh,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const a = useAction(),
    [confirm, setConfirm] = useState<Status | null>(null),
    [code, setCode] = useState(""),
    [repeat, setRepeat] = useState(false);
  const o = v.order;
  const next: Partial<Record<Status, Status>> = {
    open: "locked",
    locked: "shopping",
    shopping: "ready",
    ready: "completed",
  };
  const labels: Partial<Record<Status, string>> = {
    locked: "Lock shares",
    shopping: "Start shopping",
    ready: "Open pickup",
    completed: "Complete order",
    cancelled: "Cancel order",
  };
  const transition = (status: Status) =>
    a.run(async () => {
      await post(`/orders/${o.id}/status`, { status });
      setConfirm(null);
      await refresh();
    });
  const bags = v.members.filter((m) =>
    m.claims.some((c) => c.available && c.quantity > 0),
  );
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>Organizer dashboard</Text>
      <Text style={styles.muted}>1. Shop · 2. Pack · 3. Hand out</Text>
      <Text style={styles.text}>
        {bags.length} bag{bags.length === 1 ? "" : "s"} ·{" "}
        {bags.filter((m) => m.packed).length} packed ·{" "}
        {bags.filter((m) => m.collectedAt).length} collected
      </Text>
      {["open", "locked", "shopping"].includes(o.status) && (
        <>
          <Text style={styles.h3}>Shopping list</Text>
          {v.items.map((i) => (
            <ItemTools
              key={`${i.id}-${i.priceCents}`}
              item={i}
              view={v}
              refresh={refresh}
            />
          ))}
        </>
      )}
      <Text style={styles.h3}>Member packing lists</Text>
      {v.members.map((m) => (
        <View key={m.userId} style={styles.section}>
          <Text style={styles.h3}>
            {m.name}
            {m.university ? " · Verified UVic" : ""}
          </Text>
          <Text style={styles.muted}>
            {m.completed} completed orders ·{" "}
            {m.attending ? "Pickup confirmed" : "Pickup not confirmed"}
          </Text>
          {m.claims.length ? (
            m.claims.map((c) => (
              <View key={c.itemId}>
                <Text style={styles.text}>
                  {c.quantity} × {c.shareLabel} {c.name}
                  {c.available ? "" : " · Unavailable"}
                </Text>
                {c.available && !!c.portioning && (
                  <Text style={styles.muted}>{c.portioning}</Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No shares claimed.</Text>
          )}
          <Text style={styles.muted}>
            {money(m.estimateCents)} estimated product cost
          </Text>
          {m.claims.some((c) => c.available) && o.status === "shopping" && (
            <Check
              label={`Bag packed for ${m.name}`}
              value={m.packed}
              onChange={(packed) =>
                void a.run(async () => {
                  await post(`/orders/${o.id}/pack`, {
                    userId: m.userId,
                    packed,
                  });
                  await refresh();
                })
              }
              disabled={a.busy}
            />
          )}
          <Text style={styles.muted}>
            {m.collectedAt
              ? "Collected"
              : m.arrived
                ? "Arrived · Ready for handoff"
                : m.packed
                  ? "Packed"
                  : "Not packed"}
          </Text>
        </View>
      ))}
      {o.status === "ready" && (
        <View style={styles.note}>
          <Text style={styles.h3}>Confirm collection</Text>
          <Text style={styles.muted}>
            Ask the member for the code shown in their pickup screen, then enter
            it here.
          </Text>
          <Field
            label="Member collection code"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
          />
          <Button
            disabled={a.busy || !code.trim()}
            onPress={() =>
              void a.run(async () => {
                await post(`/orders/${o.id}/collect`, { code });
                setCode("");
                await refresh();
              })
            }
          >
            Confirm handoff
          </Button>
        </View>
      )}
      <ErrorText message={a.error} />
      {confirm ? (
        <View style={styles.note}>
          <Text style={styles.h3}>{labels[confirm]}?</Text>
          <Text style={styles.muted}>
            {confirm === "locked"
              ? "Members will no longer be able to change or release shares."
              : confirm === "cancelled"
                ? "This ends the order and invalidates collection codes."
                : confirm === "ready"
                  ? "All required items and bags must be ready. Members will receive collection codes."
                  : confirm === "completed"
                    ? "Every required bag must be collected before this order can finish."
                    : "Resolve any unfilled packs before shopping begins."}
          </Text>
          <Button
            disabled={a.busy}
            danger={confirm === "cancelled"}
            onPress={() => void transition(confirm)}
          >{`Confirm ${(labels[confirm] ?? confirm).toLowerCase()}`}</Button>
          <Button secondary onPress={() => setConfirm(null)}>
            Go back
          </Button>
        </View>
      ) : (
        <>
          {next[o.status] && (
            <Button onPress={() => setConfirm(next[o.status]!)}>
              {labels[next[o.status]!]!}
            </Button>
          )}
          {!["completed", "cancelled"].includes(o.status) && (
            <Button secondary danger onPress={() => setConfirm("cancelled")}>
              Cancel order
            </Button>
          )}
        </>
      )}
      <Button secondary onPress={() => setRepeat(!repeat)}>
        {repeat ? "Close repeat setup" : "Repeat as a new draft"}
      </Button>
      {repeat && <RepeatOrder orderId={o.id} />}
    </View>
  );
}
function RepeatOrder({ orderId }: { orderId: string }) {
  const at = (h: number) => {
    const d = new Date(Date.now() + h * 3600000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
      .replace("T", " ");
  };
  const [dates, setDates] = useState({
      deadline: at(168),
      purchaseAt: at(170),
      pickupAt: at(172),
      pickupEnd: at(174),
    }),
    a = useAction();
  return (
    <View style={styles.note}>
      <Text style={styles.muted}>
        Choose new local dates. Review the new draft before publishing.
      </Text>
      {Object.entries(dates).map(([key, val]) => (
        <Field
          key={key}
          label={`New ${key}`}
          value={val}
          onChangeText={(value) => setDates({ ...dates, [key]: value })}
        />
      ))}
      <ErrorText message={a.error} />
      <Button
        disabled={a.busy}
        onPress={() =>
          void a.run(async () => {
            const r = await post<{ id: string }>(
              `/orders/${orderId}/repeat`,
              Object.fromEntries(
                Object.entries(dates).map(([k, v]) => [
                  k,
                  new Date(v.replace(" ", "T")).toISOString(),
                ]),
              ),
            );
            router.push({
              pathname: "/(tabs)/order/[id]",
              params: { id: r.id },
            });
          })
        }
      >
        Create repeat draft
      </Button>
    </View>
  );
}
export function MemberPickup({
  view: v,
  refresh,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const a = useAction(),
    m = v.mine;
  if (!m) return null;
  const needsPickup = m.claims.some((c) => c.available);
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>Your pickup</Text>
      <Text style={styles.text}>{v.order.pickupLocation}</Text>
      <Text style={styles.muted}>
        {when(v.order.pickupAt)} – {when(v.order.pickupEnd)}
      </Text>
      {!needsPickup ? (
        <Text style={styles.muted}>
          You have no available items to collect.
        </Text>
      ) : m.collectedAt ? (
        <Text style={styles.h3}>Collected · {when(m.collectedAt)}</Text>
      ) : (
        <>
          <Text style={styles.text}>
            {m.packed ? "Your bag is packed." : "Your bag is not packed yet."}
          </Text>
          {v.collectionCode && (
            <View style={styles.note}>
              <Text style={styles.label}>Your single-use collection code</Text>
              <Text
                selectable
                style={{ fontSize: 22, letterSpacing: 1, fontWeight: "700" }}
              >
                {v.collectionCode.match(/.{1,4}/g)?.join(" ")}
              </Text>
              <Text style={styles.muted}>
                Show this only to your organizer at handoff.
              </Text>
            </View>
          )}
          {v.order.status === "ready" && (
            <Button
              secondary
              disabled={a.busy || m.arrived}
              onPress={() =>
                void a.run(async () => {
                  await post(`/orders/${v.order.id}/arrive`);
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
      )}
      <ErrorText message={a.error} />
    </View>
  );
}
