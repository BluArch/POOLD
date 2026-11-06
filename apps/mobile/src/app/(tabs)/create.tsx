import { palette as P, type, brand } from "../../theme";
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
  ScreenFooter,
  Loading,
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
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <DraftForm key={id ?? "new"} id={id} />;
}
function DraftForm({ id }: { id?: string }) {
  const a = useAction();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState(""),
    [store, setStore] = useState("Costco"),
    [visibility, setVisibility] = useState<"public" | "private">("public"),
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

  const load = () =>
    a.run(async () => {
      if (id) {
        const v = await api<OrderView>(`/orders/${id}`),
          o = v.order;
        setName(o.name);
        setStore(o.store);
        setVisibility(o.visibility);
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
        setLoaded(true);
      }
    });
  useEffect(() => {
    if (id) void load();
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
        kind: "community",
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

  if (!loaded)
    return (
      <Screen title="Edit draft" back>
        <Loading />
        <ErrorText message={a.error} />
        {!!a.error && (
          <Button secondary disabled={a.busy} onPress={() => void load()}>
            Retry
          </Button>
        )}
      </Screen>
    );
  return (
    <Screen
      title={id ? "Edit draft" : "New group"}
      subtitle={id ? undefined : "Save a draft, then publish when ready"}
      role="organizing"
      back
    >
      {!id && (
        <View style={[styles.note, { gap: 4 }]}>
          <Text style={styles.label}>Before you start</Text>
          <Text style={styles.text}>
            Groups are for trips you’re making anyway: you’ll add at least one
            share for yourself after publishing.
          </Text>
        </View>
      )}
      <View style={styles.card}>
        <Step n={1} title="The group" />
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
            <Text style={styles.muted}>Including you</Text>
          </View>
          <QuantityStepper
            label="people"
            value={max}
            max={10}
            onChange={(n) => setMax(Math.max(2, n))}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Step n={2} title="When" />
        <DateTimeField
          label="Shares close"
          value={deadline}
          onChange={changeDeadline}
          min={new Date()}
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
      </View>

      <View style={styles.card}>
        <Step n={3} title="Pickup place" />
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

      <View style={{ gap: 2, paddingHorizontal: 4 }}>
        <Step n={4} title="Items" />
        <Text style={styles.muted}>We work out the shares and price.</Text>
      </View>
      {items.map((d, n) => (
        <View key={n} style={[styles.card, { gap: 12 }]}>
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
      {items.length < 30 && (
        <Button
          secondary
          icon="add"
          onPress={() => setItems([...items, emptyDraft()])}
        >
          Add another item
        </Button>
      )}
      <ErrorText message={a.error} />
      <ScreenFooter>
        <View style={{ gap: 6 }}>
          <ErrorText message={a.error} />
          <Button disabled={a.busy} onPress={() => void save()}>
            {a.busy ? "Saving…" : "Save draft"}
          </Button>
        </View>
      </ScreenFooter>
    </Screen>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <View style={[styles.row, { gap: 10 }]}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: brand.greenDark,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={[type.label, { color: P.white, fontSize: 13 }]}>{n}</Text>
      </View>
      <Text style={styles.h2}>{title}</Text>
    </View>
  );
}
