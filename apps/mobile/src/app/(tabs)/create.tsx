import React, { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  type OrderInput,
  type OrderView,
  PICKUP_PLACES,
} from "@poold/contracts";
import { api, post } from "../../api";
import {
  Screen,
  Field,
  Button,
  Choice,
  Check,
  styles,
  ErrorText,
  useAction,
} from "../../components/ui";
import { QuantityStepper } from "../../components/Sections";
import { DateTimeField, Select, roundUp } from "../../components/Pickers";
import {
  ItemEditor,
  type ItemDraft,
  emptyDraft,
  draftFromItem,
  draftProblems,
  draftToInput,
} from "../../components/ItemEditor";

const HOUR = 3600000;
const later = (h: number) => roundUp(new Date(Date.now() + h * HOUR));
const STORES = ["Costco", "Walmart", "Real Canadian Superstore"] as const;

export default function Create() {
  const { id, quick } = useLocalSearchParams<{ id?: string; quick?: string }>(),
    a = useAction();
  const [name, setName] = useState(""),
    [store, setStore] = useState("Costco"),
    [visibility, setVisibility] = useState<"public" | "private">("public"),
    [kind, setKind] = useState<"community" | "quick">(
      quick ? "quick" : "community",
    ),
    [max, setMax] = useState(6),
    [cadence, setCadence] = useState<"once" | "weekly" | "monthly">("once"),
    [deadline, setDeadline] = useState(later(24)),
    [purchase, setPurchase] = useState(later(26)),
    [pickup, setPickup] = useState(later(28)),
    [end, setEnd] = useState(later(30)),
    [location, setLocation] = useState(PICKUP_PLACES[0].name),
    [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
      PICKUP_PLACES[0],
    ),
    [publicPickup, setPublic] = useState(true),
    [items, setItems] = useState<ItemDraft[]>([emptyDraft()]);

  useEffect(() => {
    if (id)
      void a.run(async () => {
        const v = await api<OrderView>(`/orders/${id}`),
          o = v.order;
        setName(o.name);
        setStore(o.store);
        setVisibility(o.visibility);
        setKind(o.kind);
        setMax(o.maxMembers);
        setCadence(o.cadence);
        setDeadline(new Date(o.deadline));
        setPurchase(new Date(o.purchaseAt));
        setPickup(new Date(o.pickupAt));
        setEnd(new Date(o.pickupEnd));
        setLocation(o.pickupLocation);
        setCoords(
          o.pickupLat !== null ? { lat: o.pickupLat, lng: o.pickupLng! } : null,
        );
        setItems(
          v.items.map((i) =>
            draftFromItem({
              ...i,
              referenceShareCents: i.referenceShareCents,
            }),
          ),
        );
      });
  }, [id]);

  // Keep the dates in order: changing an earlier date pushes later ones along.
  const changeDeadline = (d: Date) => {
    setDeadline(d);
    if (purchase < d) {
      const p = new Date(d.getTime() + 2 * HOUR);
      setPurchase(p);
      if (pickup < p) {
        const s = new Date(p.getTime() + 2 * HOUR);
        setPickup(s);
        if (end <= s) setEnd(new Date(s.getTime() + 2 * HOUR));
      }
    }
  };
  const changePurchase = (d: Date) => {
    setPurchase(d);
    if (pickup < d) {
      const s = new Date(d.getTime() + 2 * HOUR);
      setPickup(s);
      if (end <= s) setEnd(new Date(s.getTime() + 2 * HOUR));
    }
  };
  const changePickup = (d: Date) => {
    setPickup(d);
    if (end <= d) setEnd(new Date(d.getTime() + 2 * HOUR));
  };

  const update = (n: number, d: ItemDraft) =>
    setItems(items.map((v, i) => (i === n ? d : v)));
  const problems = items.flatMap((d, n) =>
    draftProblems(d).map((p) => `Item ${n + 1}: ${p}`),
  );

  const save = () =>
    a.run(async () => {
      if (!name.trim()) throw new Error("Give the group a name.");
      if (problems.length) throw new Error(problems.join(" "));
      const b: OrderInput = {
        name,
        store,
        kind,
        visibility,
        maxMembers: max,
        cadence,
        deadline: deadline.toISOString(),
        purchaseAt: purchase.toISOString(),
        pickupAt: pickup.toISOString(),
        pickupEnd: end.toISOString(),
        pickupLocation: location,
        pickupLat: coords?.lat ?? null,
        pickupLng: coords?.lng ?? null,
        publicPickup: publicPickup as true,
        items: items.map(draftToInput),
      };
      let oid = id;
      if (id)
        await api(`/orders/${id}`, { method: "PUT", body: JSON.stringify(b) });
      else oid = (await post<{ id: string }>("/orders", b)).id;
      router.replace({
        pathname: "/(tabs)/order/[id]",
        params: { id: oid!, view: "organize" },
      });
    });

  return (
    <Screen
      title={id ? "Edit your draft." : "A small shop, shared."}
      subtitle="Save a draft, review it, then publish."
      back
    >
      <View style={styles.section}>
        <Text style={styles.h2}>The group</Text>
        <Field
          label="Group name"
          value={name}
          onChangeText={setName}
          placeholder="Campus pantry run"
        />
        <Select
          label="Store"
          value={store}
          options={STORES}
          onChange={setStore}
          allowOther
        />
        <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
          <Choice
            label="Several items"
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
        <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
          <Choice
            label="Public group"
            selected={visibility === "public"}
            onPress={() => setVisibility("public")}
          />
          <Choice
            label="Private (invite only)"
            selected={visibility === "private"}
            onPress={() => setVisibility("private")}
          />
        </View>
        <View style={styles.between}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Maximum people</Text>
            <Text style={styles.muted}>Including you, 2–10.</Text>
          </View>
          <QuantityStepper
            label="people"
            value={max}
            max={10}
            onChange={(n) => setMax(Math.max(2, n))}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>When</Text>
        <DateTimeField
          label="Shares close"
          value={deadline}
          onChange={changeDeadline}
          min={new Date()}
          hint="Members can join and change shares until then."
        />
        <DateTimeField
          label="You go shopping"
          value={purchase}
          onChange={changePurchase}
          min={deadline}
        />
        <DateTimeField
          label="Pickup starts"
          value={pickup}
          onChange={changePickup}
          min={purchase}
        />
        <DateTimeField
          label="Pickup ends"
          value={end}
          onChange={setEnd}
          min={new Date(pickup.getTime() + 30 * 60000)}
        />
        <Text style={styles.label}>Repeats</Text>
        <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
          {(
            [
              ["once", "Just once"],
              ["weekly", "Weekly"],
              ["monthly", "Monthly"],
            ] as const
          ).map(([c, label]) => (
            <Choice
              key={c}
              label={label}
              selected={cadence === c}
              onPress={() => setCadence(c)}
            />
          ))}
        </View>
        {cadence !== "once" && (
          <Text style={styles.muted}>
            You’ll create each repeat as a new draft from the finished group.
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>Where</Text>
        <Text style={styles.label}>Public pickup place</Text>
        <View style={{ gap: 8 }}>
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
        </View>
        <Field
          label="Or type another public place"
          value={PICKUP_PLACES.some((p) => p.name === location) ? "" : location}
          onChangeText={(v) => {
            setLocation(v);
            setCoords(null);
          }}
          placeholder="Clearihue Building entrance"
        />
        <Check
          label="This is a safe, public pickup place"
          value={publicPickup}
          onChange={setPublic}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>Items</Text>
        <Text style={styles.muted}>
          Pick an item and how much goes in each share. The app works out the
          number of shares and the price per share.
        </Text>
      </View>
      {items.map((d, n) => (
        <View
          key={n}
          style={{
            borderWidth: 1,
            borderColor: "#d5dce4",
            borderRadius: 12,
            padding: 16,
            gap: 12,
          }}
        >
          <ItemEditor
            title={items.length > 1 ? `Item ${n + 1}` : "Item"}
            value={d}
            onChange={(next) => update(n, next)}
          />
          {items.length > 1 && (
            <Button
              secondary
              danger
              onPress={() => setItems(items.filter((_, i) => n !== i))}
            >
              Remove this item
            </Button>
          )}
        </View>
      ))}
      {kind === "community" && items.length < 30 && (
        <Button secondary onPress={() => setItems([...items, emptyDraft()])}>
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
