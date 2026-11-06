import React, { useState } from "react";
import { View, Text, Linking } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { type PaymentWorkflow } from "@poold/contracts";
import { api, post } from "../../../api";
import {
  Screen,
  Button,
  Choice,
  Check,
  ErrorText,
  Loading,
  styles,
  useAction,
  useResource,
} from "../../../components/ui";
/** Setup is independent of basket approval and never collects a grocery payment. */
export default function SavePaymentMethod() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    r = useResource<PaymentWorkflow>(`/orders/${id}/payment-status`),
    a = useAction();
  const [outcome, setOutcome] = useState<"ok" | "declined" | "funds">("ok"),
    [consent, setConsent] = useState(false),
    [saved, setSaved] = useState(false);
  if (!r.data)
    return (
      <Screen title="Save a payment method">
        <Loading />
        <ErrorText message={r.error} />
      </Screen>
    );
  const stripe = r.data.provider === "stripe_test";
  return (
    <Screen title="Save a payment method">
      <Text style={styles.h2}>
        {stripe ? "Stripe sandbox card setup" : "Demo payment method"}
      </Text>
      <Text style={styles.text}>
        Saving a card does not hold or charge grocery funds. Return to the group
        afterward to approve the exact basket total and closing time. Saving or
        changing a card requires fresh basket approval.
      </Text>
      {stripe ? (
        <>
          <Text style={styles.muted}>
            Card details are collected by Stripe on its hosted test setup page.
            Use Stripe test cards only.
          </Text>
          <Check
            label="Save this payment method for my explicitly approved future payments"
            value={consent}
            onChange={setConsent}
          />
          <Button
            disabled={!consent || a.busy}
            onPress={() =>
              void a.run(async () => {
                const session = await post<{ url: string }>(
                  `/orders/${id}/payment-checkout`,
                  { agreed: true },
                );
                await Linking.openURL(session.url);
              })
            }
          >
            Open Stripe test setup
          </Button>
          <Button
            secondary
            disabled={a.busy}
            onPress={() =>
              void a.run(async () => {
                await post(`/orders/${id}/payment-setup-sync`);
                await r.refresh();
                setSaved(true);
              })
            }
          >
            Check completed card setup
          </Button>
        </>
      ) : (
        <>
          <Text style={styles.muted}>
            This selects a simulated Visa ending 4242. No real card information
            is requested or sent.
          </Text>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            <Choice
              label="Succeeds"
              selected={outcome === "ok"}
              onPress={() => setOutcome("ok")}
            />
            <Choice
              label="Declined"
              selected={outcome === "declined"}
              onPress={() => setOutcome("declined")}
            />
            <Choice
              label="Insufficient funds"
              selected={outcome === "funds"}
              onPress={() => setOutcome("funds")}
            />
          </View>
          <Check
            label="Save this simulated card for my explicitly approved payments"
            value={consent}
            onChange={setConsent}
          />
          <Button
            disabled={!consent || a.busy}
            onPress={() =>
              void a.run(async () => {
                await api("/payment-method", {
                  method: "PUT",
                  body: JSON.stringify({
                    brand: "Visa",
                    last4: "4242",
                    outcome,
                  }),
                });
                setSaved(true);
              })
            }
          >
            Save demo card
          </Button>
        </>
      )}
      {saved && (
        <Text accessibilityLiveRegion="polite" style={styles.label}>
          {stripe && !r.data.cardReady
            ? "Setup is still pending. Finish Stripe setup and check again."
            : "Card saved. Return to the group to review and approve your basket."}
        </Text>
      )}
      <ErrorText message={a.error} />
      <Button
        secondary
        onPress={() =>
          router.canGoBack()
            ? router.back()
            : router.replace({ pathname: "/(tabs)/order/[id]", params: { id } })
        }
      >
        Return to group
      </Button>
    </Screen>
  );
}
