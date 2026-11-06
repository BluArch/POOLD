import { palette as P } from "../theme";
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CATALOG,
  CATEGORIES,
  type CatalogItem,
  type ItemInput,
  type CatalogueResult,
  type CataloguePage,
  itemFromUnits,
  plural,
  shareSizes,
  money,
} from "@poold/contracts";
import { Field, CurrencyField, Choice, styles } from "./ui";
import { Collapsible, QuantityStepper } from "./Sections";
import { ItemIcon } from "./ItemIcon";
import { Select } from "./Pickers";
import { api } from "../api";

/** What the organizer edits. Everything else is worked out from this. */
export interface ItemDraft {
  catalogKey: string | null;
  offerId: string | null;
  offerRevision: number | null;
  observedAt: string | null;
  priceSource: "manual" | "legacy" | "demo" | "retailer";
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
  offerId: null,
  offerRevision: null,
  observedAt: null,
  priceSource: "manual",
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
  offerId: null,
  offerRevision: null,
  observedAt: null,
  priceSource: "legacy",
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
export const draftFromItem = (
  i: ItemInput & { priceSource?: ItemDraft["priceSource"] },
): ItemDraft => {
  const c = CATALOG.find((x) => x.key === i.catalogKey);
  if (i.unit && i.packUnits && i.shareUnits)
    return {
      catalogKey: i.catalogKey ?? null,
      offerId: i.offerId ?? null,
      offerRevision: i.offerRevision ?? null,
      observedAt: null,
      priceSource: i.priceSource ?? (i.catalogKey ? "legacy" : "manual"),
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
    offerId: null,
    offerRevision: null,
    observedAt: null,
    priceSource: i.priceSource ?? "manual",
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
    offerId: d.offerId,
    offerRevision: d.offerRevision,
  });

export const draftFromOffer = (o: CatalogueResult): ItemDraft => ({
  ...emptyDraft(),
  offerId: o.offerId,
  offerRevision: o.revision,
  observedAt: o.observedAt,
  priceSource: o.priceSource,
  name: o.name,
  category: o.category,
  unit: o.unit ?? "each",
  unitDetail: o.unitDetail ?? "",
  packUnits: o.packUnits ?? 1,
  shareUnits:
    o.unit === "g" || o.unit === "mL" ? Math.min(100, o.packUnits ?? 100) : 1,
  priceCents: o.priceCents,
  chosen: true,
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
  retailerId = null,
  locationId = null,
}: {
  value: ItemDraft;
  onChange: (d: ItemDraft) => void;
  title: string;
  initialSearch?: string;
  retailerId?: string | null;
  locationId?: string | null;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [results, setResults] = useState<CatalogueResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchVersion = useRef(0);
  useEffect(() => {
    searchVersion.current += 1;
    setResults([]);
    setCursor(null);
    setSearchError("");
    if (!locationId || !retailerId || d.chosen) {
      setBusy(false);
      return;
    }
    let current = true;
    setBusy(true);
    setResults([]);
    setCursor(null);
    const timer = setTimeout(() => {
      void api<CataloguePage>(
        `/catalogue/products?retailerId=${encodeURIComponent(retailerId)}&locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(search.trim())}`,
      )
        .then((page) => {
          if (current) {
            setResults(page.items);
            setCursor(page.nextCursor);
            setSearchError("");
          }
        })
        .catch((e) => {
          if (current)
            setSearchError(e instanceof Error ? e.message : "Search failed.");
        })
        .finally(() => {
          if (current) setBusy(false);
        });
    }, 250);
    return () => {
      current = false;
      searchVersion.current += 1;
      clearTimeout(timer);
    };
  }, [retailerId, locationId, search, d.chosen]);
  const loadMore = async () => {
    if (!cursor || busy || !retailerId || !locationId) return;
    const version = searchVersion.current;
    setBusy(true);
    try {
      const page = await api<CataloguePage>(
        `/catalogue/products?retailerId=${encodeURIComponent(retailerId)}&locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(search.trim())}&cursor=${cursor}`,
      );
      if (version !== searchVersion.current) return;
      setResults((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      if (version === searchVersion.current)
        setSearchError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      if (version === searchVersion.current) setBusy(false);
    }
  };
  const set = (change: Partial<ItemDraft>) => onChange({ ...d, ...change });

  if (!d.chosen) {
    const query = search.trim().toLowerCase();
    const legacyMatches = !retailerId
      ? CATALOG.filter(
          (item) =>
            !query ||
            item.name.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query),
        )
      : [];
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
          Branch catalogue prices are estimates until checked at purchase. Add
          an item manually if it is missing.
        </Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: P.line,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {legacyMatches.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${item.name}`}
              onPress={() => onChange(draftFromCatalog(item))}
              style={{ padding: 14, gap: 2 }}
            >
              <Text style={styles.h3}>{item.name}</Text>
              <Text style={styles.muted}>
                {plural(item.packUnits, item.unit)} · {money(item.priceCents)} ·{" "}
                Older catalogue estimate
              </Text>
            </Pressable>
          ))}
          {results.map((c, i) => (
            <Pressable
              key={c.offerId}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${c.name}`}
              onPress={() => onChange(draftFromOffer(c))}
              style={({ pressed }) => ({
                padding: 14,
                gap: 2,
                backgroundColor: pressed ? P.paper : P.paper,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: P.line,
              })}
            >
              <Text style={styles.h3}>
                {c.brand ? `${c.brand} · ` : ""}
                {c.name}
              </Text>
              <Text style={styles.muted}>
                {c.packLabel} · {money(c.priceCents)} · {c.category} ·{" "}
                {c.availability === "unknown"
                  ? "Stock unconfirmed"
                  : "Listed available"}
              </Text>
              <Text style={styles.muted}>
                {c.priceSource === "demo"
                  ? "Class-project demo estimate · stock unverified"
                  : c.observedAt
                    ? `Price checked ${new Date(c.observedAt).toLocaleDateString("en-CA")}`
                    : "Price check unavailable"}
              </Text>
            </Pressable>
          ))}
          {busy && (
            <Text style={[styles.muted, { padding: 14 }]}>Searching…</Text>
          )}
          {!!searchError && (
            <Text style={[styles.muted, { padding: 14 }]}>{searchError}</Text>
          )}
          {!busy &&
            !searchError &&
            results.length === 0 &&
            legacyMatches.length === 0 && (
              <Text style={[styles.muted, { padding: 14 }]}>
                {!retailerId
                  ? "No match in the list."
                  : locationId
                    ? "No eligible products loaded for this branch."
                    : "Choose a branch to search its catalogue."}
              </Text>
            )}
          {!!cursor && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadMore()}
              style={{ padding: 14 }}
            >
              <Text style={styles.text}>Load more</Text>
            </Pressable>
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
              backgroundColor: pressed ? P.paper : P.paper,
              borderTopWidth: 1,
              borderTopColor: P.line,
            })}
          >
            <Ionicons name="create-outline" size={20} color={P.herbText} />
            <Text style={[styles.text, { color: P.herbText }]}>
              Something else — enter it myself
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const fromCatalog = !!d.catalogKey || !!d.offerId;
  const sizes =
    d.packUnits && d.packUnits > 0
      ? shareSizes(d.packUnits).filter((n) =>
          d.unit === "g" || d.unit === "mL" ? n >= 25 : true,
        )
      : [];
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
        <ItemIcon item={d} size={48} />
        <Text style={[styles.h3, { flex: 1 }]}>{d.name || title}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(emptyDraft())}
          style={{ padding: 8, minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: P.herbText, fontWeight: "600" }}>
            Change item
          </Text>
        </Pressable>
      </View>

      {fromCatalog ? (
        <View style={styles.note}>
          <Text style={styles.h3}>{d.name}</Text>
          <Text style={styles.text}>
            One pack: {plural(d.packUnits!, d.unit)}
            {d.unitDetail ? ` (${d.unitDetail})` : ""} · {money(d.priceCents)}
          </Text>
          <Text style={styles.muted}>
            {d.category} ·{" "}
            {d.priceSource === "demo"
              ? "class-project demo estimate"
              : d.offerId
                ? "branch price estimate"
                : "older catalogue estimate"}{" "}
            · savings not verified
          </Text>
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
            onChangeCents={(c) =>
              set({
                priceCents: c ?? 0,
                ...(d.offerId
                  ? {
                      offerId: null,
                      offerRevision: null,
                      observedAt: null,
                      priceSource: "manual",
                    }
                  : {}),
              })
            }
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
