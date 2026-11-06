import React from "react";
import { View, Text } from "react-native";
import {
  type Item,
  money,
  describeShare,
  shareCost,
  withMarkup,
} from "@poold/contracts";
import { palette as P, type, shadow } from "../theme";
import { styles } from "./ui";
import { ItemIcon } from "./ItemIcon";
import { QuantityStepper } from "./Sections";
import { ShareBar, Badge } from "./Market";
/** Buyers pay Costco's price + 15%; the organizer pays Costco's at the store. */
export const estimateFor = (i: Item, quantity: number, organizer = false) => {
  if (!i.available) return 0;
  const cost = shareCost(i.priceCents, quantity, i.sharesPerPack);
  return organizer ? cost : withMarkup(cost);
};
export function ReceiptLine({
  name,
  category,
  cost,
}: {
  name: string;
  category?: string;
  cost: string;
  dark?: boolean;
}) {
  return (
    <View style={[styles.row, { gap: 10 }]}>
      <ItemIcon item={{ name, category }} size={26} />
      <Text style={[type.body, { flex: 1 }]} numberOfLines={2}>
        {name}
      </Text>
      <Text style={type.label}>{cost}</Text>
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
    total = i.packCount * i.sharesPerPack,
    left = Math.max(0, total - others - quantity);
  const saving =
    i.referenceShareCents !== null &&
    i.referenceShareCents > i.shareEstimateCents
      ? i.referenceShareCents - i.shareEstimateCents
      : 0;
  return (
    <View style={[styles.card, { gap: 12, opacity: i.available ? 1 : 0.55 }]}>
      <View style={[styles.row, { alignItems: "flex-start" }]}>
        <ItemIcon item={i} size={52} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={type.item}>{i.name}</Text>
          <Text style={type.mono}>{describeShare(i).share}</Text>
          <View
            style={[styles.row, { gap: 6, flexWrap: "wrap", marginTop: 2 }]}
          >
            <Text style={[type.label, { fontSize: 16 }]}>
              {money(i.shareEstimateCents)}
              <Text style={type.mono}> /share</Text>
            </Text>
            {saving > 0 && <Badge tone="good">{`Save ${money(saving)}`}</Badge>}
          </View>
        </View>
      </View>
      <ShareBar others={others} yours={quantity} total={total} />
      <View style={styles.between}>
        <Text style={[type.mono, { flex: 1 }]}>
          {!i.available
            ? "Unavailable"
            : left === 0
              ? "All shares taken"
              : `${left} of ${total} left`}
          {i.priceCents !== i.originalPriceCents ? " · Price changed" : ""}
        </Text>
        <QuantityStepper
          label={i.name}
          value={quantity}
          max={i.available ? i.remaining + i.mine : 0}
          onChange={onChange}
        />
      </View>
    </View>
  );
}
/** Sticky cart at the bottom of the screen while choosing shares. */
export function ReceiptPanel({
  items,
  quantity,
  total,
  fee = 0,
  action,
  children,
}: {
  items: Item[];
  quantity: (id: string) => number;
  total: number;
  fee?: number;
  organizer: string;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  const shares = items.reduce((n, i) => n + quantity(i.id), 0);
  return (
    <View
      style={{
        backgroundColor: P.paper,
        borderRadius: 24,
        padding: 14,
        gap: 10,
        borderWidth: 1,
        borderColor: P.line,
        ...shadow,
        shadowOpacity: 0.14,
      }}
    >
      <View style={styles.between}>
        <View style={{ flex: 1 }}>
          <Text style={type.mono}>
            {shares
              ? `${shares} ${shares === 1 ? "share" : "shares"}${fee ? ` + ${money(fee)} fee (5%)` : ""} · charged when shopping starts`
              : "Tap + to add a share"}
          </Text>
          <Text accessibilityLiveRegion="polite" style={type.total}>
            {money(total + fee)}
          </Text>
        </View>
      </View>
      {children}
      {action}
    </View>
  );
}
