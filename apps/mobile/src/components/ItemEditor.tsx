import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CATALOG,
  CATEGORIES,
  type CatalogItem,
  type ItemInput,
  itemFromUnits,
  plural,
  shareSizes,
  money,
} from "@poold/contracts";
import { Field, CurrencyField, Choice, styles, C } from "./ui";
import { Collapsible, QuantityStepper } from "./Sections";
import { Select } from "./Pickers";

/** What the organizer edits. Everything else is worked out from this. */
export interface ItemDraft {
  catalogKey: string | null;
  name: string;
  category: string;
  /** Singular name of one sealed unit, e.g. "can". */
  unit: string;
  unitDetail: string;
  packUnits: number | null;
  shareUnits: number | null;
  priceCents: number;
  walmartUnitCents: number | null;
  packCount: number;
  storage: string;
  /** True once an item has been picked or "something else" was chosen. */
  chosen: boolean;
}

export const emptyDraft = (): ItemDraft => ({
  catalogKey: null,
  name: "",
  category: "",
  unit: "",
  unitDetail: "",
  packUnits: null,
  shareUnits: null,
  priceCents: 0,
  walmartUnitCents: null,
  packCount: 1,
  storage: "",
  chosen: false,
});

export const draftFromCatalog = (c: CatalogItem): ItemDraft => ({
  catalogKey: c.key,
  name: c.name,
  category: c.category,
  unit: c.unit,
  unitDetail: c.unitDetail,
  packUnits: c.packUnits,
  shareUnits: c.suggestedShare,
  priceCents: c.priceCents,
  walmartUnitCents: c.walmartUnitCents,
  packCount: 1,
  storage: c.storage,
  chosen: true,
});

/** Turns a saved item back into an editable draft (older items are parsed from their labels). */
export const draftFromItem = (i: ItemInput): ItemDraft => {
  const c = CATALOG.find((x) => x.key === i.catalogKey);
  if (i.unit && i.packUnits && i.shareUnits)
    return {
      catalogKey: i.catalogKey ?? null,
      name: i.name,
      category: i.category,
      unit: i.unit,
      unitDetail: c?.unitDetail ?? i.packLabel.match(/\((.*)\)/)?.[1] ?? "",
      packUnits: i.packUnits,
      shareUnits: i.shareUnits,
      priceCents: i.priceCents,
      walmartUnitCents:
        c?.walmartUnitCents ??
        (i.referenceShareCents
          ? Math.round(i.referenceShareCents / i.shareUnits)
          : null),
      packCount: i.packCount,
      storage: i.storage,
      chosen: true,
    };
  const num = (s: string) => s.match(/^(\d+)\s+(.+)$/);
  const p = num(i.packLabel),
    s = num(i.shareLabel);
  const sameUnit =
    p &&
    s &&
    p[2].replace(/s$/, "") === s[2].replace(/s$/, "") &&
    Number(p[1]) / Number(s[1]) === i.sharesPerPack;
  return {
    catalogKey: null,
    name: i.name,
    category: i.category,
    unit: sameUnit ? p![2].replace(/s$/, "") : "share",
    unitDetail: "",
    packUnits: sameUnit ? Number(p![1]) : i.sharesPerPack,
    shareUnits: sameUnit ? Number(s![1]) : 1,
    priceCents: i.priceCents,
    walmartUnitCents: null,
    packCount: i.packCount,
    storage: i.storage,
    chosen: true,
  };
};

/** Problems that stop the item from being saved, in plain words. */
export function draftProblems(d: ItemDraft): string[] {
  const out: string[] = [];
  if (!d.chosen) return ["Choose an item."];
  if (!d.name.trim()) out.push("Give the item a name.");
  if (!d.category.trim()) out.push("Choose a category.");
  if (!d.unit.trim()) out.push("Say what one unit is called, like “can”.");
  if (!d.packUnits || d.packUnits < 1)
    out.push("Say how many units come in one pack.");
  else if (!d.shareUnits) out.push("Choose how much goes in each share.");
  else if (d.packUnits % d.shareUnits !== 0)
    out.push(
      `${d.packUnits} can’t be split evenly into shares of ${d.shareUnits}.`,
    );
  if (!d.priceCents || d.priceCents < 1) out.push("Enter the pack price.");
  return out;
}

export const draftToInput = (d: ItemDraft): ItemInput =>
  itemFromUnits({
    name: d.name.trim(),
    category: d.category.trim(),
    unit: d.unit.trim(),
    unitDetail: d.unitDetail.trim(),
    packUnits: d.packUnits!,
    shareUnits: d.shareUnits!,
    priceCents: d.priceCents,
    walmartUnitCents: d.walmartUnitCents,
    packCount: d.packCount,
    storage: d.storage.trim(),
    catalogKey: d.catalogKey,
  });

/** One-line description of a share, e.g. "1 share = 4 boxes (200 g each)". */
export const shareSummary = (d: ItemDraft) =>
  d.packUnits && d.shareUnits && d.unit
    ? `1 share = ${plural(d.shareUnits, d.unit)}${d.unitDetail ? ` (${d.unitDetail})` : ""}`
    : "";

/** Pick an item from the catalog (prices and notes fill in), or enter one by hand. */
export function ItemEditor({
  value: d,
  onChange,
  title,
  initialSearch = "",
}: {
  value: ItemDraft;
  onChange: (d: ItemDraft) => void;
  title: string;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const set = (change: Partial<ItemDraft>) => onChange({ ...d, ...change });

  if (!d.chosen) {
    const q = search.trim().toLowerCase();
    const matches = CATALOG.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
    return (
      <View style={{ gap: 10 }}>
        <Text style={styles.h3}>{title}</Text>
        <Field
          label="Search items"
          value={search}
          onChangeText={setSearch}
          placeholder="Kraft Dinner, toothpaste, cans…"
        />
        <Text style={styles.muted}>
          These come in sealed packs, so shares never need opening. Prices fill
          in automatically.
        </Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: C.line,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {matches.slice(0, 12).map((c, i) => (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${c.name}`}
              onPress={() => onChange(draftFromCatalog(c))}
              style={({ pressed }) => ({
                padding: 14,
                gap: 2,
                backgroundColor: pressed ? C.soft : "#fff",
                borderTopWidth: i ? 1 : 0,
                borderTopColor: "#eef1f4",
              })}
            >
              <Text style={styles.text}>{c.name}</Text>
              <Text style={styles.muted}>
                {plural(c.packUnits, c.unit)} ({c.unitDetail}) ·{" "}
                {money(c.priceCents)} · {c.category}
              </Text>
            </Pressable>
          ))}
          {matches.length === 0 && (
            <Text style={[styles.muted, { padding: 14 }]}>
              No match in the list.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onChange({
                ...emptyDraft(),
                name: search.trim(),
                chosen: true,
              })
            }
            style={({ pressed }) => ({
              padding: 14,
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              backgroundColor: pressed ? C.soft : "#fff",
              borderTopWidth: 1,
              borderTopColor: C.line,
            })}
          >
            <Ionicons name="create-outline" size={20} color={C.blue} />
            <Text style={[styles.text, { color: C.blue }]}>
              Something else — enter it myself
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const fromCatalog = !!d.catalogKey;
  const sizes = d.packUnits && d.packUnits > 0 ? shareSizes(d.packUnits) : [];
  const sharesPerPack =
    d.packUnits && d.shareUnits && d.packUnits % d.shareUnits === 0
      ? d.packUnits / d.shareUnits
      : null;
  const perShare = sharesPerPack
    ? Math.round(d.priceCents / sharesPerPack)
    : null;
  const walmart =
    d.walmartUnitCents && d.shareUnits
      ? d.walmartUnitCents * d.shareUnits
      : null;

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.between}>
        <Text style={[styles.h3, { flex: 1 }]}>{title}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(emptyDraft())}
          style={{ padding: 8 }}
        >
          <Text style={{ color: C.blue, fontWeight: "600" }}>Change item</Text>
        </Pressable>
      </View>

      {fromCatalog ? (
        <View style={styles.note}>
          <Text style={styles.h3}>{d.name}</Text>
          <Text style={styles.text}>
            One pack: {plural(d.packUnits!, d.unit)} ({d.unitDetail}) ·{" "}
            {money(d.priceCents)}
          </Text>
          <Text style={styles.muted}>{d.category} · Costco price</Text>
        </View>
      ) : (
        <>
          <Field
            label="Item name"
            value={d.name}
            onChangeText={(name) => set({ name })}
            placeholder="Canned chickpeas"
          />
          <Select
            label="Category"
            value={d.category}
            options={CATEGORIES}
            onChange={(category) => set({ category })}
            allowOther
          />
          <Text style={styles.label}>What’s in one pack?</Text>
          <View style={[styles.row, { alignItems: "flex-end" }]}>
            <View style={{ width: 110 }}>
              <Field
                label="How many"
                keyboardType="number-pad"
                value={d.packUnits ? String(d.packUnits) : ""}
                onChangeText={(v) => {
                  const n = Number(v.replace(/\D/g, "")) || null;
                  set({
                    packUnits: n,
                    shareUnits:
                      n && d.shareUnits && n % d.shareUnits === 0
                        ? d.shareUnits
                        : null,
                  });
                }}
                placeholder="8"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Of what (one unit)"
                value={d.unit}
                onChangeText={(unit) => set({ unit })}
                placeholder="can"
                autoCapitalize="none"
              />
            </View>
          </View>
          <Field
            label="Size of each unit (optional)"
            value={d.unitDetail}
            onChangeText={(unitDetail) => set({ unitDetail })}
            placeholder="540 mL each"
          />
          <CurrencyField
            label="Price for one pack (CAD)"
            valueCents={d.priceCents || null}
            onChangeCents={(c) => set({ priceCents: c ?? 0 })}
          />
        </>
      )}

      <Text style={styles.label}>Each share gets</Text>
      {sizes.length === 0 ? (
        <Text style={styles.muted}>
          Enter how many units come in a pack first.
        </Text>
      ) : (
        <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
          {sizes.map((n) => (
            <Choice
              key={n}
              label={plural(n, d.unit || "unit")}
              selected={d.shareUnits === n}
              onPress={() => set({ shareUnits: n })}
            />
          ))}
        </View>
      )}
      {sharesPerPack !== null && (
        <View style={styles.note}>
          <Text style={styles.text}>
            {shareSummary(d)} · {money(perShare!)} each
          </Text>
          <Text style={styles.muted}>
            One pack of {plural(d.packUnits!, d.unit)} makes {sharesPerPack}{" "}
            share{sharesPerPack === 1 ? "" : "s"}.
            {walmart
              ? ` The same at Walmart costs about ${money(walmart)}.`
              : ""}
          </Text>
        </View>
      )}

      <View style={styles.between}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.label}>Packs to buy, at most</Text>
          <Text style={styles.muted}>
            {sharesPerPack
              ? `Up to ${d.packCount * sharesPerPack} shares in total.`
              : "Members can claim shares from this many packs."}
          </Text>
        </View>
        <QuantityStepper
          label={`packs of ${d.name || "this item"}`}
          value={d.packCount}
          max={10}
          onChange={(packCount) => set({ packCount: Math.max(1, packCount) })}
        />
      </View>

      {fromCatalog ? (
        <Collapsible
          title="Price or notes changed?"
          summary="Only if the store price is different"
        >
          <CurrencyField
            label="Price for one pack (CAD)"
            valueCents={d.priceCents || null}
            onChangeCents={(c) => set({ priceCents: c ?? 0 })}
          />
          <Field
            label="Storage advice for members"
            value={d.storage}
            onChangeText={(storage) => set({ storage })}
          />
        </Collapsible>
      ) : (
        <Field
          label="Storage advice for members (optional)"
          value={d.storage}
          onChangeText={(storage) => set({ storage })}
          placeholder="Store at room temperature."
        />
      )}
    </View>
  );
}
