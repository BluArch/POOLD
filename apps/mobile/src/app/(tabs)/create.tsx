import React, { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  type OrderInput,
  type OrderView,
  type ItemInput,
  PICKUP_PLACES,
  money,
} from "@poold/contracts";
import { api, post } from "../../api";
import {
  Screen,
  Field,
  CurrencyField,
  Button,
  Choice,
  Check,
  styles,
  ErrorText,
  useAction,
} from "../../components/ui";
const local = (h: number) => {
  const d = new Date(Date.now() + h * 3600000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
};
const item = (): ItemInput => ({
  name: "",
  category: "Pantry",
  packLabel: "",
  shareLabel: "",
  sharesPerPack: 4,
  packCount: 1,
  priceCents: 0,
  referenceShareCents: null,
  storage: "",
  portioning: "",
});
export default function Create() {
  const { id, quick } = useLocalSearchParams<{ id?: string; quick?: string }>(),
    a = useAction();
  const [name, setName] = useState(""),
    [store, setStore] = useState("Costco"),
    [visibility, setVisibility] = useState<"public" | "private">("public"),
    [kind, setKind] = useState<"community" | "quick">(
      quick ? "quick" : "community",
    ),
    [max, setMax] = useState("6"),
    [cadence, setCadence] = useState<"once" | "weekly" | "monthly">("once"),
    [deadline, setDeadline] = useState(local(24)),
    [purchase, setPurchase] = useState(local(26)),
    [pickup, setPickup] = useState(local(28)),
    [end, setEnd] = useState(local(30)),
    [location, setLocation] = useState(PICKUP_PLACES[0].name),
    [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
      PICKUP_PLACES[0],
    ),
    [publicPickup, setPublic] = useState(true),
    [items, setItems] = useState<ItemInput[]>([item()]);
  const dateLocal = (s: string) => {
    const d = new Date(s);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
      .replace("T", " ");
  };
  useEffect(() => {
    if (id)
      void a.run(async () => {
        const v = await api<OrderView>(`/orders/${id}`),
          o = v.order;
        setName(o.name);
        setStore(o.store);
        setVisibility(o.visibility);
        setKind(o.kind);
        setMax(String(o.maxMembers));
        setCadence(o.cadence);
        setDeadline(dateLocal(o.deadline));
        setPurchase(dateLocal(o.purchaseAt));
        setPickup(dateLocal(o.pickupAt));
        setEnd(dateLocal(o.pickupEnd));
        setLocation(o.pickupLocation);
        setCoords(
          o.pickupLat !== null ? { lat: o.pickupLat, lng: o.pickupLng! } : null,
        );
        setItems(
          v.items.map((i) => ({
            name: i.name,
            category: i.category,
            packLabel: i.packLabel,
            shareLabel: i.shareLabel,
            sharesPerPack: i.sharesPerPack,
            packCount: i.packCount,
            priceCents: i.priceCents,
            referenceShareCents: i.referenceShareCents,
            storage: i.storage,
            portioning: i.portioning,
          })),
        );
      });
  }, [id]);
  const update = (n: number, change: Partial<ItemInput>) =>
    setItems(items.map((v, i) => (i === n ? { ...v, ...change } : v)));
  const save = () =>
    a.run(async () => {
      const dates = [deadline, purchase, pickup, end].map(
        (s) => new Date(s.replace(" ", "T")),
      );
      if (dates.some((d) => !Number.isFinite(d.getTime())))
        throw new Error("Enter valid local dates as YYYY-MM-DD HH:mm.");
      const b: OrderInput = {
        name,
        store,
        kind,
        visibility,
        maxMembers: Number(max),
        cadence,
        deadline: dates[0].toISOString(),
        purchaseAt: dates[1].toISOString(),
        pickupAt: dates[2].toISOString(),
        pickupEnd: dates[3].toISOString(),
        pickupLocation: location,
        pickupLat: coords?.lat ?? null,
        pickupLng: coords?.lng ?? null,
        publicPickup: publicPickup as true,
        items,
      };
      let oid = id;
      if (id)
        await api(`/orders/${id}`, { method: "PUT", body: JSON.stringify(b) });
      else oid = (await post<{ id: string }>("/orders", b)).id;
      router.replace({ pathname: "/(tabs)/order/[id]", params: { id: oid! } });
    });
  return (
    <Screen
      title={id ? "Edit your draft." : "A small shop, shared."}
      subtitle="Save a draft, review it, then publish."
      back
    >
      <Field
        label="Group name"
        value={name}
        onChangeText={setName}
        placeholder="Campus pantry run"
      />
      <Field label="Store" value={store} onChangeText={setStore} />
      <View style={[styles.row, { flexWrap: "wrap" }]}>
        <Choice
          label="Community order"
          selected={kind === "community"}
          onPress={() => setKind("community")}
        />
        <Choice
          label="One-item quick split"
          selected={kind === "quick"}
          onPress={() => {
            setKind("quick");
            setItems(items.slice(0, 1));
          }}
        />
      </View>
      <View style={styles.row}>
        <Choice
          label="Public group"
          selected={visibility === "public"}
          onPress={() => setVisibility("public")}
        />
        <Choice
          label="Private invite"
          selected={visibility === "private"}
          onPress={() => setVisibility("private")}
        />
      </View>
      <Field
        label="Maximum people (2–10, including you)"
        keyboardType="number-pad"
        value={max}
        onChangeText={setMax}
      />
      <View style={styles.section}>
        <Text style={styles.h2}>When & where</Text>
        <Text style={styles.muted}>
          Times use your device’s local timezone. Format: YYYY-MM-DD HH:mm.
        </Text>
        <Field
          label="Claim deadline"
          value={deadline}
          onChangeText={setDeadline}
        />
        <Field
          label="Purchase time"
          value={purchase}
          onChangeText={setPurchase}
        />
        <Field label="Pickup starts" value={pickup} onChangeText={setPickup} />
        <Field label="Pickup ends" value={end} onChangeText={setEnd} />
        <Text style={styles.label}>Suggested public pickup places</Text>
        {PICKUP_PLACES.map((p) => (
          <Choice
            key={p.name}
            label={p.name}
            selected={location === p.name}
            onPress={() => {
              setLocation(p.name);
              setCoords(p);
            }}
          />
        ))}
        <Field
          label="Public pickup location"
          value={location}
          onChangeText={(v) => {
            setLocation(v);
            setCoords(null);
          }}
        />
        <Check
          label="This is a safe, public pickup place"
          value={publicPickup}
          onChange={setPublic}
        />
        <Text style={styles.label}>Intended cadence</Text>
        <View style={[styles.row, { flexWrap: "wrap" }]}>
          {(["once", "weekly", "monthly"] as const).map((c) => (
            <Choice
              key={c}
              label={c}
              selected={cadence === c}
              onPress={() => setCadence(c)}
            />
          ))}
        </View>
        <Text style={styles.muted}>
          Repeating orders are created manually as new drafts.
        </Text>
      </View>
      {items.map((it, n) => (
        <View key={n} style={styles.section}>
          <Text style={styles.h2}>Item {n + 1}</Text>
          <Field
            label={`Item ${n + 1} name`}
            value={it.name}
            onChangeText={(name) => update(n, { name })}
          />
          <Field
            label={`Item ${n + 1} category`}
            value={it.category}
            onChangeText={(category) => update(n, { category })}
          />
          <Field
            label={`Item ${n + 1} pack size`}
            placeholder="30 eggs"
            value={it.packLabel}
            onChangeText={(packLabel) => update(n, { packLabel })}
          />
          <Field
            label={`Item ${n + 1} share size`}
            placeholder="6 eggs"
            value={it.shareLabel}
            onChangeText={(shareLabel) => update(n, { shareLabel })}
          />
          <Field
            label={`Item ${n + 1} shares per pack`}
            keyboardType="number-pad"
            value={String(it.sharesPerPack)}
            onChangeText={(v) => update(n, { sharesPerPack: Number(v) })}
          />
          <Field
            label={`Item ${n + 1} packs available`}
            keyboardType="number-pad"
            value={String(it.packCount)}
            onChangeText={(v) => update(n, { packCount: Number(v) })}
          />
          <CurrencyField
            label={`Item ${n + 1} pack price (CAD)`}
            valueCents={it.priceCents}
            onChangeCents={(c) => update(n, { priceCents: c ?? 0 })}
          />
          <Text style={styles.muted}>
            {it.sharesPerPack > 0
              ? `${money(Math.round(it.priceCents / it.sharesPerPack))} estimated per share`
              : ""}
          </Text>
          <Field
            label={`Item ${n + 1} storage advice`}
            value={it.storage}
            onChangeText={(storage) => update(n, { storage })}
          />
          <Field
            label={`Item ${n + 1} portioning steps`}
            value={it.portioning}
            onChangeText={(portioning) => update(n, { portioning })}
          />
          <CurrencyField
            label={`Item ${n + 1} comparable price per share (CAD, optional)`}
            valueCents={it.referenceShareCents}
            onChangeCents={(c) => update(n, { referenceShareCents: c })}
          />
          {items.length > 1 && (
            <Button
              secondary
              onPress={() => setItems(items.filter((_, i) => n !== i))}
            >
              Remove item
            </Button>
          )}
        </View>
      ))}
      {kind === "community" && items.length < 30 && (
        <Button secondary onPress={() => setItems([...items, item()])}>
          Add another item
        </Button>
      )}
      <ErrorText message={a.error} />
      <Button disabled={a.busy} onPress={() => void save()}>
        {a.busy ? "Saving…" : "Save draft & review"}
      </Button>
    </Screen>
  );
}
