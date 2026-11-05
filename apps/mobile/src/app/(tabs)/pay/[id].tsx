import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { type OrderView, money } from "@poold/contracts";
import { post } from "../../../api";
import {
  ErrorText,
  Loading,
  styles,
  useResource,
  when,
} from "../../../components/ui";
import { ItemIcon } from "../../../components/ItemIcon";
import { palette as P, type, brand, fonts, shadow } from "../../../theme";
import { useSession } from "../../../session";

/*
 * Test-mode checkout, laid out like a hosted card checkout: order summary,
 * contact, card details, billing, pay, bank authentication (for the 3D Secure
 * test card), then a receipt. No money moves. Card details never leave the
 * phone: only published test card numbers are accepted, and the server gets
 * just the brand and last four digits for the receipt.
 * When the server has a Stripe test key, the group page opens Stripe's own
 * hosted test checkout instead of this screen.
 */

type Step = "form" | "processing" | "auth" | "done";
type Outcome = "ok" | "declined" | "funds" | "auth";

const TEST_CARDS: { number: string; label: string; outcome: Outcome }[] = [
  { number: "4242 4242 4242 4242", label: "Payment succeeds", outcome: "ok" },
  {
    number: "4000 0025 0000 3155",
    label: "Asks the bank to confirm it’s you",
    outcome: "auth",
  },
  {
    number: "4000 0000 0000 0002",
    label: "Card is declined",
    outcome: "declined",
  },
  {
    number: "4000 0000 0000 9995",
    label: "Insufficient funds",
    outcome: "funds",
  },
  {
    number: "5555 5555 5555 4444",
    label: "Mastercard, succeeds",
    outcome: "ok",
  },
];
const outcomeOf = (digitsOnly: string) =>
  TEST_CARDS.find((c) => c.number.replace(/ /g, "") === digitsOnly)?.outcome;

const digits = (s: string) => s.replace(/\D/g, "");
const formatCard = (s: string) =>
  digits(s)
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
const formatExpiry = (s: string) => {
  const d = digits(s).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
};
const brandOf = (n: string): "Visa" | "Mastercard" | "Amex" | null =>
  n.startsWith("4")
    ? "Visa"
    : /^5[1-5]/.test(n)
      ? "Mastercard"
      : /^3[47]/.test(n)
        ? "Amex"
        : null;

const NAVY = "#1A1F36";
const FIELD_BORDER = "#E3E1DC";

export default function Pay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const r = useResource<OrderView>(`/orders/${id}`),
    v = r.data;
  const [step, setStep] = useState<Step>("form"),
    [email, setEmail] = useState(s.user?.email ?? ""),
    [card, setCard] = useState(""),
    [expiry, setExpiry] = useState(""),
    [cvc, setCvc] = useState(""),
    [name, setName] = useState(s.user?.name ?? ""),
    [postal, setPostal] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [details, setDetails] = useState(false),
    [cards, setCards] = useState(false),
    [receipt, setReceipt] = useState<{
      ref: string;
      at: string;
      cents: number;
      brand: string;
      last4: string;
    } | null>(null);
  // Amount is fixed when the page opens, so it can't change mid-payment.
  const [amount, setAmount] = useState<number | null>(null);
  useEffect(() => {
    if (v && amount === null) setAmount(v.mine?.dueCents ?? 0);
  }, [v]);

  if (!v || amount === null)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: P.white }}>
        <Loading />
        <ErrorText message={r.error} />
      </SafeAreaView>
    );

  const number = digits(card);
  const cardBrand = brandOf(number);
  const back = () =>
    router.replace({ pathname: "/(tabs)/order/[id]", params: { id } });

  const finish = async () => {
    try {
      const result = await post<{ ref: string }>(`/orders/${id}/pay/demo`, {
        brand: cardBrand,
        last4: number.slice(-4),
      });
      setReceipt({
        ref: result.ref,
        at: new Date().toISOString(),
        cents: amount,
        brand: cardBrand ?? "Card",
        last4: number.slice(-4),
      });
      setCard("");
      setCvc("");
      setStep("done");
    } catch (e) {
      setStep("form");
      setError((e as Error).message);
    }
  };

  const pay = async () => {
    setError("");
    const next: Record<string, string> = {};
    const [mm, yy] = [
      Number(digits(expiry).slice(0, 2)),
      Number(digits(expiry).slice(2)),
    ];
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Your email is incomplete.";
    if (number.length < 16) next.card = "Your card number is incomplete.";
    else if (!outcomeOf(number))
      next.card =
        "Test mode: use one of the test cards below. Never enter a real card.";
    if (digits(expiry).length < 4 || mm < 1 || mm > 12)
      next.expiry = "Your card’s expiration date is incomplete.";
    else if (new Date(2000 + yy, mm, 1) <= new Date())
      next.expiry = "Your card’s expiration year is in the past.";
    if (digits(cvc).length < 3)
      next.cvc = "Your card’s security code is incomplete.";
    if (!name.trim()) next.name = "Enter the name on your card.";
    if (postal.replace(/\s/g, "").length < 6)
      next.postal = "Your postal code is incomplete.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setStep("processing");
    await new Promise((done) => setTimeout(done, 1400));
    const outcome = outcomeOf(number)!;
    if (outcome === "auth") return setStep("auth");
    if (outcome === "declined") {
      setStep("form");
      return setErrors({ card: "Your card was declined." });
    }
    if (outcome === "funds") {
      setStep("form");
      return setErrors({ card: "Your card has insufficient funds." });
    }
    await finish();
  };

  if (step === "done" && receipt)
    return <Success receipt={receipt} view={v} email={email} onDone={back} />;

  const busy = step === "processing" || step === "auth";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: P.white }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
          padding: 20,
          paddingBottom: 40,
          gap: 22,
        }}
      >
        {/* Merchant bar */}
        <View style={[styles.row, { gap: 10 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to the group"
            onPress={back}
            hitSlop={10}
          >
            <Ionicons name="arrow-back" size={20} color={P.muted} />
          </Pressable>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: "#FBEFC5",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: fonts.title, fontSize: 14 }}>p</Text>
          </View>
          <Text style={[type.label, { fontSize: 15 }]}>POOLD</Text>
          <View
            style={{
              backgroundColor: "#FFDFC9",
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{ fontFamily: fonts.bold, fontSize: 11, color: "#A0390E" }}
            >
              TEST MODE
            </Text>
          </View>
        </View>

        {amount <= 0 ? (
          <PaidUp view={v} onDone={back} />
        ) : (
          <>
            {/* Summary */}
            <View style={{ gap: 4 }}>
              <Text style={[type.body, { color: P.muted }]}>
                Pay {v.order.organizerName} via POOLD
              </Text>
              <Text
                style={{
                  fontFamily: fonts.title,
                  fontSize: 36,
                  letterSpacing: -0.5,
                  color: NAVY,
                }}
              >
                CA{money(amount)}
              </Text>
              <Text style={type.mono}>Your shares in {v.order.name}</Text>
              <Pressable
                onPress={() => setDetails(!details)}
                style={[styles.row, { gap: 4, minHeight: 32 }]}
              >
                <Text style={[type.label, { fontSize: 13 }]}>
                  {details ? "Hide details" : "View details"}
                </Text>
                <Ionicons
                  name={details ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={P.ink}
                />
              </Pressable>
              {details && (
                <View style={{ gap: 12, paddingTop: 6 }}>
                  {v.myClaims
                    .filter((c) => c.available)
                    .map((c) => (
                      <View key={c.itemId} style={[styles.row, { gap: 12 }]}>
                        <ItemIcon
                          item={{
                            name: c.name,
                            category: v.items.find((i) => i.id === c.itemId)
                              ?.category,
                          }}
                          size={36}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={type.label}>{c.name}</Text>
                          <Text style={type.mono}>Qty {c.quantity}</Text>
                        </View>
                        <Text style={type.label}>{money(c.estimateCents)}</Text>
                      </View>
                    ))}
                  <Divider />
                  <Row label="Your shares" value={money(v.myEstimateCents)} />
                  <Row
                    label={
                      v.isOrganizer
                        ? "Service fee (none for organizers)"
                        : "Service fee (5%, held until hand-out)"
                    }
                    value={money(v.myFeeCents)}
                  />
                  {(v.mine?.paidCents ?? 0) > 0 && (
                    <Row
                      label="Already paid"
                      value={`−${money(v.mine!.paidCents)}`}
                    />
                  )}
                  <Divider />
                  <Row label="Total due" value={money(amount)} bold />
                </View>
              )}
            </View>

            {/* Contact */}
            <View style={{ gap: 8 }}>
              <Text style={[type.label, { color: NAVY, fontSize: 16 }]}>
                Contact information
              </Text>
              <Group>
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </Group>
              <FieldError text={errors.email} />
            </View>

            {/* Card */}
            <View style={{ gap: 8 }}>
              <Text style={[type.label, { color: NAVY, fontSize: 16 }]}>
                Payment method
              </Text>
              <View
                style={[
                  styles.row,
                  {
                    borderWidth: 1.5,
                    borderColor: NAVY,
                    borderRadius: 8,
                    padding: 12,
                    gap: 10,
                  },
                ]}
              >
                <Ionicons name="card" size={18} color={NAVY} />
                <Text style={[type.label, { flex: 1, color: NAVY }]}>Card</Text>
                <Ionicons name="radio-button-on" size={18} color={NAVY} />
              </View>
              <Text style={[styles.label, { marginTop: 6 }]}>
                Card information
              </Text>
              <Group invalid={!!(errors.card || errors.expiry || errors.cvc)}>
                <View style={[styles.row, { paddingRight: 10, gap: 4 }]}>
                  <Input
                    label="Card number"
                    card
                    value={card}
                    onChangeText={(t) => setCard(formatCard(t))}
                    placeholder="1234 1234 1234 1234"
                  />
                  {(["Visa", "Mastercard", "Amex"] as const)
                    .filter((b) => !cardBrand || b === cardBrand)
                    .map((b) => (
                      <BrandMark key={b} brand={b} />
                    ))}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    borderTopWidth: 1,
                    borderColor: FIELD_BORDER,
                  }}
                >
                  <Input
                    label="Expiration date"
                    card
                    value={expiry}
                    onChangeText={(t) => setExpiry(formatExpiry(t))}
                    placeholder="MM / YY"
                  />
                  <View style={{ width: 1, backgroundColor: FIELD_BORDER }} />
                  <View style={[styles.row, { flex: 1, paddingRight: 10 }]}>
                    <Input
                      label="CVC"
                      card
                      value={cvc}
                      onChangeText={(t) => setCvc(digits(t).slice(0, 4))}
                      placeholder="CVC"
                    />
                    <Ionicons name="card-outline" size={18} color={P.muted} />
                  </View>
                </View>
              </Group>
              <FieldError text={errors.card || errors.expiry || errors.cvc} />
              <Text style={[styles.label, { marginTop: 6 }]}>
                Cardholder name
              </Text>
              <Group invalid={!!errors.name}>
                <Input
                  label="Cardholder name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Full name on card"
                />
              </Group>
              <FieldError text={errors.name} />
              <Text style={[styles.label, { marginTop: 6 }]}>
                Country or region
              </Text>
              <Group invalid={!!errors.postal}>
                <View style={[styles.row, { padding: 13, minHeight: 46 }]}>
                  <Text style={[type.body, { flex: 1 }]}>Canada</Text>
                  <Ionicons name="chevron-down" size={16} color={P.muted} />
                </View>
                <View style={{ borderTopWidth: 1, borderColor: FIELD_BORDER }}>
                  <Input
                    label="Postal code"
                    value={postal}
                    onChangeText={(t) => setPostal(t.toUpperCase().slice(0, 7))}
                    placeholder="Postal code"
                    autoCapitalize="characters"
                  />
                </View>
              </Group>
              <FieldError text={errors.postal} />
            </View>

            <ErrorText message={error} />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void pay()}
              style={({ pressed }) => ({
                minHeight: 50,
                borderRadius: 8,
                backgroundColor: NAVY,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                opacity: pressed ? 0.85 : 1,
                ...shadow,
              })}
            >
              {busy ? (
                <ActivityIndicator color={P.white} />
              ) : (
                <>
                  <Text
                    style={{
                      fontFamily: fonts.bold,
                      fontSize: 16,
                      color: P.white,
                    }}
                  >
                    Pay CA{money(amount)}
                  </Text>
                  <Ionicons name="lock-closed" size={14} color="#C9CCE0" />
                </>
              )}
            </Pressable>

            {/* Test cards */}
            <View
              style={{
                backgroundColor: "#FFF4EC",
                borderRadius: 10,
                padding: 14,
                gap: 8,
              }}
            >
              <Pressable
                onPress={() => setCards(!cards)}
                style={[styles.row, { minHeight: 28 }]}
              >
                <Ionicons name="flask-outline" size={18} color="#A0390E" />
                <Text style={[type.label, { flex: 1, color: "#A0390E" }]}>
                  Test cards (tap one to fill it in)
                </Text>
                <Ionicons
                  name={cards ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#A0390E"
                />
              </Pressable>
              {cards &&
                TEST_CARDS.map((c) => (
                  <Pressable
                    key={c.number}
                    accessibilityRole="button"
                    onPress={() => {
                      setCard(c.number);
                      setExpiry("12 / 30");
                      setCvc("123");
                      if (!postal) setPostal("V8P 5C2");
                      setErrors({});
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: pressed ? "#FFE6D4" : P.white,
                        borderRadius: 8,
                        padding: 10,
                      },
                    ]}
                  >
                    <BrandMark brand={brandOf(digits(c.number)) ?? "Visa"} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.label, { fontSize: 13 }]}>
                        {c.number}
                      </Text>
                      <Text style={[type.mono, { fontSize: 12 }]}>
                        {c.label}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              <Text style={[type.mono, { fontSize: 12 }]}>
                Any future date, any CVC and any postal code work.
              </Text>
            </View>

            <View style={{ alignItems: "center", gap: 4 }}>
              <View style={[styles.row, { gap: 6 }]}>
                <Ionicons name="lock-closed" size={12} color={P.muted} />
                <Text style={[type.mono, { fontSize: 12 }]}>
                  Secure test checkout. No real money moves.
                </Text>
              </View>
              <Text style={[type.mono, { fontSize: 12 }]}>
                Your card number never leaves this device.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Bank authentication, as with the 3D Secure test card */}
      <Modal visible={step === "auth"} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(26,31,54,0.55)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 380,
              backgroundColor: P.white,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <View
              style={[
                styles.row,
                { backgroundColor: "#F6F8FA", padding: 14, gap: 8 },
              ]}
            >
              <Ionicons name="shield-checkmark" size={18} color={NAVY} />
              <Text style={[type.label, { flex: 1, color: NAVY }]}>
                Test bank · Verify it’s you
              </Text>
            </View>
            <View style={{ padding: 18, gap: 12 }}>
              <Text style={styles.text}>
                Your bank wants to confirm this CA{money(amount)} payment to
                POOLD. In a real payment you’d approve it in your banking app.
              </Text>
              <Text style={type.mono}>Card ending in {number.slice(-4)}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStep("processing");
                  setTimeout(() => void finish(), 900);
                }}
                style={{
                  backgroundColor: NAVY,
                  borderRadius: 8,
                  minHeight: 46,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={[type.label, { color: P.white }]}>
                  Complete authentication
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStep("form");
                  setErrors({
                    card: "We couldn’t verify it was you. Try again or use another card.",
                  });
                }}
                style={{
                  borderWidth: 1,
                  borderColor: FIELD_BORDER,
                  borderRadius: 8,
                  minHeight: 46,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={type.label}>Fail authentication</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Success({
  receipt,
  view: v,
  email,
  onDone,
}: {
  receipt: {
    ref: string;
    at: string;
    cents: number;
    brand: string;
    last4: string;
  };
  view: OrderView;
  email: string;
  onDone: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: P.white }}>
      <ScrollView
        contentContainerStyle={{
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
          padding: 24,
          gap: 20,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: brand.greenSoft,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 30,
          }}
        >
          <Ionicons name="checkmark" size={44} color={brand.greenDeep} />
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={[type.title, { textAlign: "center" }]}>
            Payment successful
          </Text>
          <Text style={[styles.muted, { textAlign: "center" }]}>
            {v.isOrganizer
              ? "Your own share is paid in, so the receipt covers everything."
              : `${v.order.organizerName.split(" ")[0]} has your money for the shopping trip.`}
          </Text>
        </View>
        <View
          style={{
            alignSelf: "stretch",
            borderWidth: 1,
            borderColor: FIELD_BORDER,
            borderRadius: 12,
            padding: 16,
            gap: 12,
          }}
        >
          <Row label="Amount paid" value={`CA${money(receipt.cents)}`} bold />
          <Divider />
          <Row label="Paid to" value={`${v.order.organizerName} via POOLD`} />
          <Row label="For" value={v.order.name} />
          <Row label="Date" value={when(receipt.at)} />
          <Row label="Card" value={`${receipt.brand} •••• ${receipt.last4}`} />
          <Row
            label="Receipt no."
            value={receipt.ref
              .replace(/^pi_test_/, "")
              .slice(0, 12)
              .toUpperCase()}
          />
        </View>
        <View style={[styles.row, { gap: 8, alignSelf: "stretch" }]}>
          <Ionicons name="mail-outline" size={18} color={P.muted} />
          <Text style={[type.mono, { flex: 1 }]}>
            A receipt was sent to {email}. Test mode, so no real money moved.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          style={{
            alignSelf: "stretch",
            minHeight: 50,
            borderRadius: 8,
            backgroundColor: NAVY,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[type.label, { color: P.white, fontSize: 16 }]}>
            Back to the group
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function PaidUp({ view: v, onDone }: { view: OrderView; onDone: () => void }) {
  return (
    <View style={{ gap: 16 }}>
      <Text style={type.title}>You’re all paid up</Text>
      {v.mine?.payments.map((p) => (
        <Row
          key={p.id}
          label={`${p.kind === "refund" ? "Refund" : "Payment"} · ${when(p.createdAt)}`}
          value={`${p.kind === "refund" ? "+" : ""}${money(p.amountCents)}`}
        />
      ))}
      <Pressable
        onPress={onDone}
        style={{
          minHeight: 50,
          borderRadius: 8,
          backgroundColor: NAVY,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={[type.label, { color: P.white }]}>Back to the group</Text>
      </Pressable>
    </View>
  );
}

function BrandMark({ brand: b }: { brand: "Visa" | "Mastercard" | "Amex" }) {
  const look = {
    Visa: { bg: "#1A1F71", fg: "#FFFFFF", text: "VISA" },
    Mastercard: { bg: "#FFFFFF", fg: "#EB001B", text: "MC" },
    Amex: { bg: "#2E77BC", fg: "#FFFFFF", text: "AMEX" },
  }[b];
  return (
    <View
      accessibilityLabel={b}
      style={{
        minWidth: 34,
        height: 22,
        borderRadius: 4,
        paddingHorizontal: 4,
        backgroundColor: look.bg,
        borderWidth: look.bg === "#FFFFFF" ? 1 : 0,
        borderColor: FIELD_BORDER,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: 10,
          fontStyle: b === "Visa" ? "italic" : "normal",
          color: look.fg,
        }}
      >
        {look.text}
      </Text>
    </View>
  );
}

function Group({
  children,
  invalid = false,
}: {
  children: React.ReactNode;
  invalid?: boolean;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: invalid ? "#DF1B41" : FIELD_BORDER,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: P.white,
        ...shadow,
        shadowOpacity: 0.04,
      }}
    >
      {children}
    </View>
  );
}

function FieldError({ text }: { text?: string }) {
  return text ? (
    <Text accessibilityRole="alert" style={[type.mono, { color: "#DF1B41" }]}>
      {text}
    </Text>
  ) : null;
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: FIELD_BORDER }} />;
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={[styles.between, { alignItems: "flex-start" }]}>
      <Text
        style={[
          bold ? type.label : type.body,
          { color: bold ? P.ink : P.muted },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          bold ? type.label : type.body,
          { flexShrink: 1, textAlign: "right", marginLeft: 12 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/** Card fields never autofill, so a saved real card can't slip in. */
function Input({
  label,
  card = false,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; card?: boolean }) {
  return (
    <TextInput
      {...props}
      accessibilityLabel={label}
      autoCorrect={false}
      {...(card
        ? {
            autoComplete: "off" as const,
            importantForAutofill: "no" as const,
            textContentType: "none" as const,
            keyboardType: "number-pad" as const,
          }
        : {})}
      placeholderTextColor="#A3ACB9"
      style={[type.body, { padding: 13, minHeight: 46, flex: 1, color: NAVY }]}
    />
  );
}
