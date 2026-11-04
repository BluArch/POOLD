import React from "react";
import { View, Text, ScrollView } from "react-native";
import { type Item, money, describeShare } from "@poold/contracts";
import { palette as P, type } from "../theme";
import { styles } from "./ui";
import { ItemIcon } from "./ItemIcon";
import { QuantityStepper } from "./Sections";
import { ShareBar, PriceTag, DottedLeader, Zigzag } from "./Market";
export const estimateFor = (i: Item, quantity: number) =>
  i.available
    ? Math.floor(
        (i.priceCents * quantity + Math.floor(i.sharesPerPack / 2)) /
          i.sharesPerPack,
      )
    : 0;
export function ReceiptLine({
  name,
  category,
  cost,
  dark = false,
}: {
  name: string;
  category?: string;
  cost: string;
  dark?: boolean;
}) {
  return (
    <View style={[styles.row, { gap: 8 }]}>
      <ItemIcon item={{ name, category }} size={22} receipt={dark} />
      <Text
        style={[
          type.mono,
          { flexShrink: 1, color: dark ? P.chalkText : P.ink },
        ]}
      >
        {name}
      </Text>
      <DottedLeader dark={dark} />
      <Text style={[type.mono, { color: dark ? P.chalkText : P.ink }]}>
        {cost}
      </Text>
    </View>
  );
}
export function ShareItemCard({
  item: i,
  quantity,
  onChange,
}: {
  item: Item;
  quantity: number;
  onChange: (q: number) => void;
}) {
  const others = Math.max(0, i.claimed - i.mine),
    total = i.packCount * i.sharesPerPack;
  return (
    <View style={[styles.section, { gap: 12 }]}>
      <View style={[styles.row, { alignItems: "flex-start" }]}>
        <ItemIcon item={i} size={48} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.item}>{i.name}</Text>
          <Text style={styles.muted}>{describeShare(i).share}</Text>
          <PriceTag>{`${money(i.shareEstimateCents)}/share est.`}</PriceTag>
        </View>
      </View>
      <View style={styles.between}>
        <Text style={[type.mono, { flex: 1 }]}>
          {!i.available
            ? "UNAVAILABLE"
            : `${Math.max(0, total - others - quantity)} SHARES LEFT`}
          {i.priceCents !== i.originalPriceCents ? " · PRICE CHANGED" : ""}
        </Text>
        <QuantityStepper
          label={i.name}
          value={quantity}
          max={i.available ? i.remaining + i.mine : 0}
          onChange={onChange}
        />
      </View>
      <ShareBar others={others} yours={quantity} total={total} />
      <Text style={type.mono}>{describeShare(i).pack.toUpperCase()}</Text>
      {!!i.storage && <Text style={styles.muted}>{i.storage}</Text>}
      {i.referenceShareCents !== null &&
        i.referenceShareCents > i.shareEstimateCents && (
          <Text style={styles.muted}>
            About {money(i.referenceShareCents - i.shareEstimateCents)} less per
            share than buying the same at Walmart.
          </Text>
        )}
    </View>
  );
}
export function ReceiptPanel({
  items,
  quantity,
  total,
  organizer,
  action,
  children,
}: {
  items: Item[];
  quantity: (id: string) => number;
  total: number;
  organizer: string;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View>
      <Zigzag color={P.chalk} top />
      <View
        style={{
          backgroundColor: P.chalk,
          padding: 14,
          gap: 10,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
        }}
      >
        <Text style={[type.mono, { color: P.chalkMuted }]}>
          YOUR RECEIPT · {items.length} {items.length === 1 ? "ITEM" : "ITEMS"}
        </Text>
        <ScrollView
          style={{ maxHeight: 96 }}
          contentContainerStyle={{ gap: 8 }}
          nestedScrollEnabled
        >
          {items.length ? (
            items.map((i) => (
              <ReceiptLine
                key={i.id}
                dark
                name={`${i.name} ×${quantity(i.id)}`}
                category={i.category}
                cost={
                  i.available
                    ? money(estimateFor(i, quantity(i.id)))
                    : "Unavailable"
                }
              />
            ))
          ) : (
            <Text style={[type.mono, { color: P.chalkText }]}>
              Tap + on an item to add it.
            </Text>
          )}
        </ScrollView>
        {children}
        <View
          style={{
            borderTopWidth: 1,
            borderStyle: "dashed",
            borderColor: P.chalkLeader,
            paddingTop: 10,
            gap: 6,
          }}
        >
          <Text style={[type.mono, { color: P.chalkMuted }]}>
            EST. TOTAL · PAY {organizer.split(" ")[0].toUpperCase()}
          </Text>
          <View
            style={[
              styles.row,
              { flexWrap: "wrap", justifyContent: "space-between" },
            ]}
          >
            <Text
              accessibilityLiveRegion="polite"
              style={[type.total, { color: P.chalkText }]}
            >
              {money(total)}
            </Text>
            <View style={{ flexGrow: 1 }}>{action}</View>
          </View>
        </View>
      </View>
    </View>
  );
}
