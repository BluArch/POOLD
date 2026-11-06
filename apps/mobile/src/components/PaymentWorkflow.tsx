import React, { useEffect, useState } from "react";
import { View, Text, Linking } from "react-native";
import { router } from "expo-router";
import { money, type OrderView, type PaymentWorkflow } from "@poold/contracts";
import { post } from "../api";
import {
  Button,
  Check,
  ErrorText,
  styles,
  useAction,
  useResource,
  when,
} from "./ui";
import { QuantityStepper } from "./Sections";
import { ReceiptLine } from "./Receipt";
import { useSession } from "../session";
const LABELS: Record<string, string> = {
  approval_needed: "Approval needed",
  changes_need_approval: "Changes need approval",
  approved_waiting_for_close:
    "Approved — waiting for the scheduled closing time",
  charging: "Collecting approved payments",
  payment_recovery: "Buyer payment needs action",
  takeover_open: "Unpaid shares available to claim",
  funding: "Grocery funding in progress",
  funded: "Grocery funds accessible — shopping can begin",
  refund_pending: "Run canceled — refunds are being processed",
  cancelled: "Run canceled — refunds confirmed",
  needs_attention: "Payment needs support review",
};
export function PaymentWorkflowPanel({
  view: v,
  refresh,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const resource = useResource<PaymentWorkflow>(
      `/orders/${v.order.id}/payment-status`,
    ),
    action = useAction(),
    [agreed, setAgreed] = useState(false);
  const session = useSession();
  const state = resource.data,
    q = state?.quote;
  useEffect(() => {
    setAgreed(false);
    void resource.refresh();
  }, [v.order.revision, JSON.stringify(v.myClaims), v.order.status]);
  useEffect(() => {
    const timer = setInterval(() => void resource.refresh(), 15000);
    return () => clearInterval(timer);
  }, [v.order.id]);
  const perform = (run: () => Promise<unknown>) =>
    void action.run(async () => {
      await run();
      setAgreed(false);
      await Promise.all([resource.refresh(), refresh()]);
    });
  const saveCard = () =>
    router.push({ pathname: "/(tabs)/pay/[id]", params: { id: v.order.id } });
  const canApprove =
    state &&
    q &&
    state.approval !== "approved" &&
    (v.order.status === "open" ||
      (state.status === "approval_needed" && v.order.status === "locked"));
  return (
    <View style={[styles.card, { gap: 12 }]}>
      <Text style={styles.h2}>
        {v.isOrganizer ? "Group funding" : "Your payment"}
      </Text>
      <Text style={styles.muted}>
        {state?.provider === "stripe_test"
          ? "Stripe sandbox — no live money"
          : "Demo simulation — no money moves"}
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.label}>
        {LABELS[state?.status ?? ""] ?? "Loading payment status…"}
      </Text>
      {q && !v.isOrganizer && (
        <>
          <ReceiptLine
            name="Original store cost"
            cost={money(q.groceryCents)}
          />
          <ReceiptLine name="Goods markup (15%)" cost={money(q.markupCents)} />
          <ReceiptLine
            name="Service fee (5% of marked-up goods)"
            cost={money(q.serviceFeeCents)}
          />
          {!!q.feeTaxCents && (
            <ReceiptLine name="Tax" cost={money(q.feeTaxCents)} />
          )}
          <ReceiptLine name="Your total" cost={money(q.totalCents)} />
          <Text style={styles.muted}>
            Scheduled closure: {when(q.deadline)}. No grocery hold or charge
            while open. Every saved change needs fresh approval.
          </Text>
          {v.order.status === "open" && (
            <Text style={styles.label}>
              {state?.approval === "approved"
                ? "Approved for this basket and closing time"
                : "Changes need approval"}
            </Text>
          )}
        </>
      )}
      {canApprove && (
        <>
          {!state.cardReady ? (
            <Button onPress={saveCard}>Save a card first</Button>
          ) : (
            <>
              <Check
                label={`I approve ${money(q.totalCents)} for this exact basket and the displayed closing time.`}
                value={agreed}
                onChange={setAgreed}
              />
              <Button
                disabled={!agreed || action.busy}
                onPress={() =>
                  perform(() =>
                    post(`/orders/${v.order.id}/payment-approve`, {
                      fingerprint: q.fingerprint,
                      amountCents: q.totalCents,
                      agreed: true,
                    }),
                  )
                }
              >{`Approve ${money(q.totalCents)} to be charged when the group closes`}</Button>
            </>
          )}
        </>
      )}
      {state?.approval === "approved" &&
        v.order.status === "open" &&
        !v.isOrganizer && (
          <Button
            secondary
            disabled={action.busy}
            onPress={() =>
              perform(() => post(`/orders/${v.order.id}/payment-revoke`))
            }
          >
            Revoke scheduled approval
          </Button>
        )}
      {state?.retry && (
        <>
          <Text style={styles.text}>
            Your approved payment needs action. Retry by{" "}
            {when(state.retry.until)}. If it still fails, the group can
            voluntarily take over your shares.
          </Text>
          <Button secondary onPress={saveCard}>
            Update payment method
          </Button>
          <Button
            disabled={action.busy}
            onPress={() =>
              perform(() =>
                post(`/orders/${v.order.id}/payment-retry`, {
                  fingerprint: state.retry!.fingerprint,
                  amountCents: state.retry!.amountCents,
                  agreed: true,
                }),
              )
            }
          >{`Approve and retry ${money(state.retry.amountCents)}`}</Button>
          {state.retry.status === "requires_action" && (
            <Button
              disabled={action.busy}
              onPress={() =>
                perform(async () => {
                  const r = await post<{ url: string }>(
                    `/orders/${v.order.id}/payment-action`,
                  );
                  await Linking.openURL(r.url);
                })
              }
            >
              Complete bank authentication
            </Button>
          )}
        </>
      )}
      {!!state?.offers.length && (
        <>
          <Text style={styles.h3}>
            Shares available until {when(state.takeoverUntil!)}
          </Text>
          <Text style={styles.muted}>
            Your existing purchase stays unchanged. Taking extra shares is
            optional.
          </Text>
          {state.offers.map((offer) => (
            <TakeoverOffer
              key={`${offer.id}:${offer.remaining}`}
              orderId={v.order.id}
              offer={offer}
              organizer={v.isOrganizer}
              onChanged={async () => {
                await resource.refresh();
                await refresh();
              }}
            />
          ))}
        </>
      )}
      {state?.supplements.map((s) => (
        <View key={s.id} style={styles.note}>
          <Text style={styles.h3}>{s.name}: store price increased</Text>
          <Text style={styles.text}>
            Additional store cost {money(s.groceryCents)} + 15% markup{" "}
            {money(s.markupCents)} + 5% service fee {money(s.serviceFeeCents)}.
            Your original payment stays unchanged.
          </Text>
          {s.status === "approval_needed" ? (
            <Button
              disabled={action.busy}
              onPress={() =>
                perform(() =>
                  post(`/orders/${v.order.id}/supplement-approve`, {
                    supplementId: s.id,
                    fingerprint: s.fingerprint,
                    amountCents: s.amountCents,
                    agreed: true,
                  }),
                )
              }
            >{`Approve and pay an additional ${money(s.amountCents)}`}</Button>
          ) : (
            <Text style={styles.label}>{s.status.replaceAll("_", " ")}</Text>
          )}
        </View>
      ))}
      {v.isOrganizer &&
        state?.supplementProposals.map((s) => (
          <View key={s.id} style={styles.note}>
            <Text style={styles.text}>
              Additional grocery funding: {s.status.replaceAll("_", " ")}. Wait
              for all required approvals and payout before buying at the higher
              price.
            </Text>
            <Button
              secondary
              disabled={action.busy}
              onPress={() =>
                perform(() =>
                  post(`/orders/${v.order.id}/supplement-cancel`, {
                    supplementId: s.id,
                  }),
                )
              }
            >
              Cancel price adjustment and refund extra payments
            </Button>
          </View>
        ))}
      {state?.organizer && (
        <>
          {state.organizer.advanceRecovery?.status === "due" && (
            <Text style={styles.text}>
              Unused grocery advance return pending:{" "}
              {money(
                state.organizer.advanceRecovery.amount_cents -
                  state.organizer.advanceRecovery.recovered_cents,
              )}
              . Contact support; new advances stay blocked until the return is
              verified.
            </Text>
          )}
          <ReceiptLine
            name="Member-funded groceries"
            cost={money(state.organizer.groceryCents)}
          />
          <ReceiptLine
            name="Completion reward, paid after handouts"
            cost={money(state.organizer.rewardCents)}
          />
          {state.organizer.payouts.map((p) => (
            <Text key={p.purpose} style={styles.muted}>
              {p.purpose === "grocery" ? "Grocery payout" : "Reward payout"}:{" "}
              {money(p.amount_cents)} · {p.status.replaceAll("_", " ")}
            </Text>
          ))}
          {state.organizer.confirmationNeeded && (
            <Button
              disabled={action.busy}
              onPress={() =>
                perform(() =>
                  post(`/orders/${v.order.id}/funding-confirm`, {
                    ...state.organizer,
                    agreed: true,
                  }),
                )
              }
            >
              Confirm revised grocery funding and reward
            </Button>
          )}
          {state.provider === "stripe_test" && v.order.status === "open" && (
            <>
              <Button
                secondary
                disabled={action.busy}
                onPress={() =>
                  perform(async () => {
                    const r = await post<{ url: string }>(
                      "/organizer/payment-onboarding",
                    );
                    await Linking.openURL(r.url);
                  })
                }
              >
                Set up sandbox grocery payouts
              </Button>
              <Button
                secondary
                disabled={action.busy}
                onPress={() =>
                  perform(() => post("/organizer/payment-account-sync"))
                }
              >
                Refresh payout eligibility
              </Button>
            </>
          )}
        </>
      )}
      {v.isOrganizer && session.user?.demo && v.order.status === "open" && (
        <Button
          secondary
          disabled={action.busy}
          onPress={() =>
            perform(() =>
              post(`/orders/${v.order.id}/demo-payment-approvals`, {
                agreed: true,
                scheduleInOneMinute: true,
              }),
            )
          }
        >
          Demo: approve sample buyers and schedule closure in one minute
        </Button>
      )}
      {state && !state.viable && v.order.status === "open" && (
        <Text style={styles.muted}>
          The current member grocery budget does not yet cover the completion
          reward and payment costs. Add funded purchases before closure; prices
          will not be increased.
        </Text>
      )}
      {state?.instructions.map((i) => (
        <Text key={i.id} style={styles.muted}>
          {i.purpose === "takeover" ? "Additional shares" : "Approved purchase"}
          : {money(i.total_cents)} · {i.status.replaceAll("_", " ")}
          {i.refunded_cents ? ` · refunded ${money(i.refunded_cents)}` : ""}
        </Text>
      ))}
      {!!state?.issues.length && (
        <Text style={styles.muted}>{state.issues.join(" ")}</Text>
      )}
      {!!state?.warnings.length && v.order.status === "open" && (
        <Text style={styles.muted}>{state.warnings.join(" ")}</Text>
      )}
      <ErrorText message={resource.error || action.error} />
      <Button
        secondary
        disabled={resource.loading || action.busy}
        onPress={() => perform(async () => {})}
      >
        Refresh payment status
      </Button>
    </View>
  );
}
function TakeoverOffer({
  orderId,
  offer,
  organizer,
  onChanged,
}: {
  orderId: string;
  offer: PaymentWorkflow["offers"][number];
  organizer: boolean;
  onChanged: () => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(1),
    [quote, setQuote] = useState<null | {
      amountCents: number;
      fingerprint: string;
      groceryCents: number;
      markupCents: number;
      serviceFeeCents: number;
      feeTaxCents: number;
    }>(null),
    [agreed, setAgreed] = useState(false),
    a = useAction();
  return (
    <View style={[styles.note, { gap: 8 }]}>
      <Text style={styles.label}>
        {offer.name} · {offer.remaining} shares available
      </Text>
      <QuantityStepper
        label={`Shares of ${offer.name}`}
        value={quantity}
        max={offer.remaining}
        onChange={(n) => {
          setQuantity(n);
          setQuote(null);
          setAgreed(false);
        }}
      />
      <Button
        secondary
        disabled={a.busy || quantity < 1}
        onPress={() =>
          void a.run(async () =>
            setQuote(
              await post(`/orders/${orderId}/takeover-quote`, {
                offerId: offer.id,
                quantity,
              }),
            ),
          )
        }
      >
        {organizer ? "Review own-store cost" : "Review additional payment"}
      </Button>
      {quote && (
        <>
          <Text style={styles.text}>
            {organizer
              ? `You buy these groceries yourself at the store for ${money(quote.groceryCents)}. They are excluded from member funding and the reward basis.`
              : `Store cost ${money(quote.groceryCents)} + markup ${money(quote.markupCents)} + service fee ${money(quote.serviceFeeCents)}${quote.feeTaxCents ? ` + tax ${money(quote.feeTaxCents)}` : ""}. Additional payment: ${money(quote.amountCents)}.`}
          </Text>
          <Check
            label={
              organizer
                ? "I agree to buy these shares myself"
                : `I approve this additional ${money(quote.amountCents)} payment now`
            }
            value={agreed}
            onChange={setAgreed}
          />
          <Button
            disabled={!agreed || a.busy}
            onPress={() =>
              void a.run(async () => {
                await post(`/orders/${orderId}/takeover-claim`, {
                  offerId: offer.id,
                  quantity,
                  ...quote,
                  agreed: true,
                });
                setQuote(null);
                await onChanged();
              })
            }
          >
            {organizer
              ? "Cover these shares myself"
              : `Claim and pay ${money(quote.amountCents)}`}
          </Button>
        </>
      )}
      <ErrorText message={a.error} />
    </View>
  );
}
