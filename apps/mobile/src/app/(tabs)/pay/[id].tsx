import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  TextInput,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { type OrderView, money } from "@poold/contracts";
import { post } from "../../../api";
import {
  Screen,
  Button,
  ErrorText,
  styles,
  useResource,
  ResourceState,
  when,
} from "../../../components/ui";
import { ReceiptLine } from "../../../components/Receipt";
import { palette as P, type, brand, fonts } from "../../../theme";
import { useSession } from "../../../session";

/*
 * Test-mode checkout. It walks through the same steps as a real card payment
 * (review → card details → processing → receipt), but no money moves.
 * Card details never leave the phone: only published test cards are accepted,
 * and the server is told nothing except "this share was paid (test)".
 * When the server has a Stripe test key, the group page sends people to
 * Stripe's own hosted test checkout instead of this screen.
 */

type Step = "review" | "card" | "processing" | "done";

const TEST_CARDS: Record<string, "ok" | "declined" | "funds"> = {
  "4242424242424242": "ok",
  "5555555555554444": "ok",
  "4000056655665556": "ok",
  "4000000000000002": "declined",
  "4000000000009995": "funds",
};

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
const brandOf = (n: string) =>
  n.startsWith("4") ? "Visa" : /^5[1-5]/.test(n) ? "Mastercard" : "";

export default function Pay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession();
  const r = useResource<OrderView>(`/orders/${id}`),
    v = r.data;
  const [step, setStep] = useState<Step>("review"),
    [email, setEmail] = useState(s.user?.email ?? ""),
    [card, setCard] = useState(""),
    [expiry, setExpiry] = useState(""),
    [cvc, setCvc] = useState(""),
    [name, setName] = useState(s.user?.name ?? ""),
    [postal, setPostal] = useState(""),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<{ ref: string; at: string } | null>(null);

  useEffect(() => {
    if (v?.mine?.paidCents != null && step !== "done") {
      setReceipt({ ref: v.mine.paymentRef ?? "", at: v.mine.paidAt ?? "" });
      setStep("done");
    }
  }, [v?.mine?.paidCents]);

  const total = v?.myEstimateCents ?? 0;
  const number = digits(card);

  const pay = async () => {
    setError("");
    const [mm, yy] = [
      Number(digits(expiry).slice(0, 2)),
      Number(digits(expiry).slice(2)),
    ];
    const now = new Date(),
      expiresEnd = new Date(2000 + yy, mm, 1);
    if (!email.includes("@"))
      return setError("Enter your email for the receipt.");
    if (number.length < 16) return setError("Your card number is incomplete.");
    const kind = TEST_CARDS[number];
    if (!kind)
      return setError(
        "Test mode only: use the test card 4242 4242 4242 4242. Never enter a real card.",
      );
    if (
      !(mm >= 1 && mm <= 12) ||
      digits(expiry).length < 4 ||
      expiresEnd <= now
    )
      return setError("Your card’s expiry date is in the past or incomplete.");
    if (digits(cvc).length < 3)
      return setError("Your card’s security code is incomplete.");
    if (!name.trim()) return setError("Enter the name on the card.");
    if (postal.trim().length < 3) return setError("Enter your postal code.");
    setStep("processing");
    await new Promise((done) => setTimeout(done, 1600));
    if (kind === "declined") {
      setStep("card");
      return setError("Your card was declined. Try a different card.");
    }
    if (kind === "funds") {
      setStep("card");
      return setError(
        "Your card has insufficient funds. Try a different card.",
      );
    }
    try {
      const result = await post<{ ref: string }>(`/orders/${id}/pay/demo`);
      setReceipt({ ref: result.ref, at: new Date().toISOString() });
      setCard("");
      setCvc("");
      setStep("done");
      void r.refresh();
    } catch (e) {
      setStep("card");
      setError((e as Error).message);
    }
  };

  return (
    <Screen
      title={step === "done" ? "Payment received" : "Checkout"}
      subtitle={v?.order.name}
      back
      header={<TestBanner />}
    >
      <ResourceState resource={r} />
      {v && (
        <>
          <Progress step={step} />
          {step === "review" && (
            <>
              <View style={styles.card}>
                <Text style={styles.h2}>Your order</Text>
                {v.myClaims
                  .filter((c) => c.available)
                  .map((c) => (
                    <ReceiptLine
                      key={c.itemId}
                      name={`${c.name} ×${c.quantity}`}
                      category={
                        v.items.find((i) => i.id === c.itemId)?.category
                      }
                      cost={money(c.estimateCents)}
                    />
                  ))}
                <Line label="Subtotal" value={money(total)} />
                <Line label="POOLD fee" value={money(0)} />
                <View
                  style={[
                    styles.between,
                    { borderTopWidth: 1, borderColor: P.line, paddingTop: 10 },
                  ]}
                >
                  <Text style={styles.h3}>Total (CAD)</Text>
                  <Text style={type.total}>{money(total)}</Text>
                </View>
              </View>
              <View style={[styles.card, styles.row]}>
                <Ionicons
                  name="person-circle-outline"
                  size={28}
                  color={P.ink}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    Paying {v.order.organizerName}
                  </Text>
                  <Text style={type.mono}>
                    For shopping on {when(v.order.purchaseAt)} · pickup at{" "}
                    {v.order.pickupLocation}
                  </Text>
                </View>
              </View>
              <Button icon="card-outline" onPress={() => setStep("card")}>
                Continue to payment
              </Button>
            </>
          )}
          {(step === "card" || step === "processing") && (
            <>
              <View style={[styles.card, { gap: 14 }]}>
                <View style={styles.between}>
                  <Text style={styles.h2}>Pay with card</Text>
                  <Text style={type.label}>{money(total)}</Text>
                </View>
                <Input
                  label="Email for receipt"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                />
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Card information</Text>
                  <View
                    style={{
                      borderWidth: 1.5,
                      borderColor: P.line,
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={[
                        styles.row,
                        {
                          borderBottomWidth: 1,
                          borderColor: P.line,
                          paddingRight: 12,
                        },
                      ]}
                    >
                      <CardInput
                        value={card}
                        onChangeText={(t) => setCard(formatCard(t))}
                        placeholder="1234 1234 1234 1234"
                        label="Card number"
                        flex
                      />
                      <Text style={[type.label, { color: P.muted }]}>
                        {brandOf(number) || " "}
                      </Text>
                      <Ionicons name="card-outline" size={20} color={P.muted} />
                    </View>
                    <View style={{ flexDirection: "row" }}>
                      <CardInput
                        value={expiry}
                        onChangeText={(t) => setExpiry(formatExpiry(t))}
                        placeholder="MM / YY"
                        label="Expiry date"
                        flex
                      />
                      <View style={{ width: 1, backgroundColor: P.line }} />
                      <CardInput
                        value={cvc}
                        onChangeText={(t) => setCvc(digits(t).slice(0, 4))}
                        placeholder="CVC"
                        label="Security code"
                        flex
                      />
                    </View>
                  </View>
                </View>
                <Input
                  label="Name on card"
                  value={name}
                  onChangeText={setName}
                />
                <Input
                  label="Postal code"
                  value={postal}
                  onChangeText={(t) => setPostal(t.toUpperCase().slice(0, 7))}
                  placeholder="V8P 5C2"
                />
                <ErrorText message={error} />
                <Button
                  icon="lock-closed"
                  disabled={step === "processing"}
                  onPress={() => void pay()}
                >
                  {step === "processing"
                    ? "Processing…"
                    : `Pay ${money(total)}`}
                </Button>
                {step === "processing" && (
                  <View style={[styles.row, { justifyContent: "center" }]}>
                    <ActivityIndicator color={brand.orange} />
                    <Text style={type.mono}>
                      Contacting the card network (test)…
                    </Text>
                  </View>
                )}
              </View>
              <View style={[styles.note, { gap: 8 }]}>
                <Text style={styles.label}>Test cards</Text>
                <Text style={type.mono}>
                  4242 4242 4242 4242 works · 4000 0000 0000 0002 is declined.
                  Use any future date, any CVC and any postal code.
                </Text>
                <Button
                  secondary
                  onPress={() => {
                    setCard("4242 4242 4242 4242");
                    setExpiry("12 / 30");
                    setCvc("123");
                    if (!postal) setPostal("V8P 5C2");
                    setError("");
                  }}
                >
                  Fill in the test card
                </Button>
              </View>
              <Pressable
                onPress={() => setStep("review")}
                style={{
                  alignSelf: "center",
                  minHeight: 44,
                  justifyContent: "center",
                }}
              >
                <Text style={[styles.label, { color: P.muted }]}>
                  Back to order
                </Text>
              </Pressable>
            </>
          )}
          {step === "done" && receipt && (
            <>
              <View
                style={[
                  styles.card,
                  { alignItems: "center", gap: 8, paddingVertical: 24 },
                ]}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: brand.greenSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="checkmark"
                    size={36}
                    color={brand.greenDeep}
                  />
                </View>
                <Text style={type.total}>
                  {money(v.mine?.paidCents ?? total)}
                </Text>
                <Text style={styles.muted}>
                  Paid to {v.order.organizerName}
                </Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.h2}>Receipt</Text>
                <Line label="Group" value={v.order.name} />
                <Line label="Date" value={receipt.at ? when(receipt.at) : ""} />
                <Line label="Method" value="Test card" />
                <Line
                  label="Receipt no."
                  value={receipt.ref
                    .replace(/^pi_test_/, "")
                    .slice(0, 12)
                    .toUpperCase()}
                />
                <Text style={type.mono}>
                  A copy would be emailed to {email || "you"} in a real payment.
                  This was a test, so no money moved.
                </Text>
              </View>
              <Button
                onPress={() =>
                  router.replace({
                    pathname: "/(tabs)/order/[id]",
                    params: { id },
                  })
                }
              >
                Back to the group
              </Button>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function TestBanner() {
  return (
    <View
      style={[
        styles.row,
        {
          gap: 8,
          backgroundColor: "#FFE7D6",
          borderRadius: 12,
          paddingVertical: 8,
          paddingHorizontal: 12,
        },
      ]}
    >
      <View
        style={{
          backgroundColor: brand.orange,
          borderRadius: 6,
          paddingHorizontal: 6,
          paddingVertical: 2,
        }}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: P.white }}>
          TEST MODE
        </Text>
      </View>
      <Text style={[type.mono, { color: P.ink, flex: 1 }]}>
        Practice payment. No real money moves.
      </Text>
    </View>
  );
}

function Progress({ step }: { step: Step }) {
  const steps = ["Review", "Pay", "Done"];
  const index = step === "review" ? 0 : step === "done" ? 2 : 1;
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {steps.map((label, i) => (
        <View key={label} style={{ flex: 1, gap: 6 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= index ? brand.orange : P.line,
            }}
          />
          <Text
            style={[
              type.mono,
              {
                fontSize: 12,
                color: i === index ? P.ink : P.muted,
                fontFamily: i === index ? fonts.label : fonts.mono,
              },
            ]}
          >
            {i + 1}. {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.between}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.text}>{value}</Text>
    </View>
  );
}

function Input({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        autoCorrect={false}
        style={[styles.input, { borderColor: P.line }]}
        placeholderTextColor={P.muted}
      />
    </View>
  );
}

/** Card fields never autofill, so a saved real card can't slip in. */
function CardInput({
  label,
  flex,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; flex?: boolean }) {
  return (
    <TextInput
      {...props}
      accessibilityLabel={label}
      autoComplete="off"
      autoCorrect={false}
      importantForAutofill="no"
      textContentType="none"
      keyboardType="number-pad"
      placeholderTextColor={P.muted}
      style={[
        type.body,
        { padding: 13, minHeight: 48, ...(flex ? { flex: 1 } : {}) },
      ]}
    />
  );
}
