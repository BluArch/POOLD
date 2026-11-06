import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen, styles } from "../components/ui";
import { palette as P, type, brand } from "../theme";

type Section = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  points: string[];
};

/** Plain-language rules for money, proof, no-shows and accounts. */
const SECTIONS: Section[] = [
  {
    icon: "school-outline",
    title: "Who can use POOLD",
    points: ["POOLD is for UVic students. You need a verified @uvic.ca email."],
  },
  {
    icon: "storefront-outline",
    title: "Who organizes",
    points: [
      "Organizers split a trip they’re making anyway. They must take at least one share themselves.",
      "Organizers pay for their own share at the store, so they don’t pay anything in the app.",
      "If nobody else joins by the deadline, the group is cancelled automatically. Nothing is charged.",
    ],
  },
  {
    icon: "card-outline",
    title: "Paying for your shares",
    points: [
      "You save a card when you join. Nothing is charged while the group is open, so you can change or drop your shares for free.",
      "When shares close, a hold is placed on your card for your shares plus a 5% service fee for the organizer.",
      "If your card is declined, you have 2 hours to update it. Shopping can’t start until every card is sorted; after 2 hours, unpaid shares are released.",
      "When the organizer starts shopping, the hold is charged. POOLD releases the item money to the organizer then, and the service fees after every bag is handed out.",
    ],
  },
  {
    icon: "arrow-undo-outline",
    title: "If prices change",
    points: [
      "Before shopping, a price change just updates your hold.",
      "If an item is cheaper or unavailable at the store, you’re refunded the difference.",
      "If a price is higher, the small difference is charged to your saved card.",
      "If a group is cancelled, holds are released and anything charged is refunded in full.",
    ],
  },
  {
    icon: "receipt-outline",
    title: "Proof of purchase",
    points: [
      "When shopping is done, the organizer uploads the full receipt and a photo of all the items.",
      "Everyone in the group can see them. Pickup doesn’t open until they’re uploaded.",
    ],
  },
  {
    icon: "time-outline",
    title: "If a buyer misses pickup",
    points: [
      "Can’t make it? Message the organizer and tap “I’m here” when you arrive.",
      "If you miss the pickup window, the organizer holds your bag for 24 hours.",
      "After 24 hours the bag is forfeited: the organizer keeps the items and your payment, and you get a no-show mark.",
      "3 no-show marks in 90 days means you can’t join new groups for 30 days.",
    ],
  },
  {
    icon: "storefront-outline",
    title: "If an organizer doesn’t follow through",
    points: [
      "If a group isn’t ready for pickup by 24 hours after the pickup window ends, it’s cancelled automatically.",
      "Every buyer gets a full refund, and the organizer gets a no-show mark.",
      "Organizers can also cancel a group any time before pickup; everyone is refunded.",
    ],
  },
  {
    icon: "star-outline",
    title: "Ratings",
    points: [
      "After you pick up your bag, you can rate the organizer from 1 to 5 stars.",
      "The average shows on their groups and their profile, so buyers can choose with confidence.",
    ],
  },
];

export default function Policies() {
  return (
    <Screen title="How POOLD works" subtitle="Money, pickups and no-shows" back>
      <View style={[styles.card, { backgroundColor: brand.yellowSoft }]}>
        <Text style={styles.text}>
          This is a class demo. All payments are in test mode and no real money
          moves.
        </Text>
      </View>
      {SECTIONS.map((s) => (
        <View key={s.title} style={[styles.card, { gap: 10 }]}>
          <View style={[styles.row, { gap: 10 }]}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: P.track,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={s.icon} size={18} color={P.ink} />
            </View>
            <Text style={[styles.h2, { flex: 1 }]}>{s.title}</Text>
          </View>
          {s.points.map((point) => (
            <View
              key={point}
              style={[styles.row, { alignItems: "flex-start", gap: 8 }]}
            >
              <Text style={[type.body, { color: P.muted }]}>•</Text>
              <Text style={[type.body, { flex: 1 }]}>{point}</Text>
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
}
