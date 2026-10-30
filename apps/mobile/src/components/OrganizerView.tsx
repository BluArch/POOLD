import React, { useEffect, useState } from "react";
import { View, Text, Share } from "react-native";
import * as ExpoLinking from "expo-linking";
import { router } from "expo-router";
import {
  type OrderView,
  type Item,
  type Member,
  type Status,
  type ProductRequest,
  money,
  describeShare,
  claimText,
} from "@poold/contracts";
import { api, post } from "../api";
import {
  Button,
  Field,
  Check,
  Choice,
  styles,
  ErrorText,
  useAction,
  useResource,
  when,
  C,
} from "./ui";
import { RequestCard } from "./RequestList";
import { DirectionsButton } from "./MemberView";
import {
  ItemEditor,
  type ItemDraft,
  emptyDraft,
  draftProblems,
  draftToInput,
} from "./ItemEditor";
import { DateTimeField, roundUp } from "./Pickers";
import { Collapsible, ProgressBar, StepTracker } from "./Sections";

const STEPS = ["Shares", "Shop", "Hand out"];

const neededItems = (v: OrderView) =>
  v.items.filter((i) => i.available && i.claimed > 0);
const bagsOf = (v: OrderView) =>
  v.members.filter((m) => m.claims.some((c) => c.available && c.quantity > 0));

/** Which step the order is on. */
function currentStep(v: OrderView) {
  switch (v.order.status) {
    case "open":
      return 0;
    case "locked":
    case "shopping":
      return 1;
    case "ready":
      return 2;
    case "completed":
      return 3;
    default:
      return 0;
  }
}

/** What the organizer sees: one step at a time, with the next action at the bottom. */
export function OrganizerView({
  view: v,
  refresh,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const o = v.order;
  const current = currentStep(v);
  const [viewing, setViewing] = useState(Math.min(current, 2));
  useEffect(() => setViewing(Math.min(current, 2)), [current]);

  if (o.status === "draft") return <DraftReview view={v} refresh={refresh} />;
  if (o.status === "cancelled")
    return (
      <>
        <View style={styles.note}>
          <Text style={styles.h3}>This order was cancelled.</Text>
          <Text style={styles.muted}>
            Members were notified. You can start again from a new draft.
          </Text>
        </View>
        <MoreOptions view={v} refresh={refresh} />
      </>
    );

  const readOnly = viewing < Math.min(current, 2);
  return (
    <>
      <StepTracker
        steps={STEPS}
        current={current}
        viewing={viewing}
        onSelect={setViewing}
      />
      {o.status === "completed" && viewing === 2 ? (
        <Done view={v} />
      ) : viewing === 0 ? (
        <CollectStep view={v} refresh={refresh} readOnly={readOnly} />
      ) : viewing === 1 ? (
        <ShopStep view={v} refresh={refresh} readOnly={readOnly} />
      ) : (
        <HandOutStep view={v} refresh={refresh} readOnly={readOnly} />
      )}
      <MoreOptions view={v} refresh={refresh} />
    </>
  );
}

/** Confirm-then-run button for moving the order to its next status. */
function Advance({
  view: v,
  to,
  label,
  warning,
  refresh,
  disabled = false,
  blocker,
}: {
  view: OrderView;
  to: Status;
  label: string;
  warning: string;
  refresh: () => Promise<void>;
  disabled?: boolean;
  blocker?: string;
}) {
  const a = useAction(),
    [confirm, setConfirm] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      {!!blocker && <Text style={styles.muted}>{blocker}</Text>}
      {confirm ? (
        <View style={styles.note}>
          <Text style={styles.h3}>{label}?</Text>
          <Text style={styles.muted}>{warning}</Text>
          <ErrorText message={a.error} />
          <Button
            disabled={a.busy}
            onPress={() =>
              void a.run(async () => {
                await post(`/orders/${v.order.id}/status`, { status: to });
                setConfirm(false);
                await refresh();
              })
            }
          >
            {a.busy ? "Working…" : `Yes, ${label.toLowerCase()}`}
          </Button>
          <Button secondary onPress={() => setConfirm(false)}>
            Go back
          </Button>
        </View>
      ) : (
        <Button disabled={disabled} onPress={() => setConfirm(true)}>
          {label}
        </Button>
      )}
    </View>
  );
}

function StepHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.h2}>{title}</Text>
      <Text style={styles.muted}>{detail}</Text>
    </View>
  );
}

/* ---------- Step 1: collect shares ---------- */
function CollectStep({
  view: v,
  refresh,
  readOnly,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
  readOnly: boolean;
}) {
  const o = v.order;
  const claimedTotal = v.items.reduce((n, i) => n + i.claimed, 0);
  return (
    <>
      <StepHeader
        title="Collecting shares"
        detail={
          readOnly
            ? "Shares are closed. This is what members committed."
            : `Members can join and change shares until ${when(o.deadline)}`
        }
      />
      <View style={styles.note}>
        <View style={styles.between}>
          <Text style={styles.text}>Members joined</Text>
          <Text style={styles.h3}>
            {o.memberCount} of {o.maxMembers}
          </Text>
        </View>
        <ProgressBar value={o.memberCount} total={o.maxMembers} />
      </View>
      {v.items.map((i) => {
        const capacity = i.packCount * i.sharesPerPack;
        return (
          <View key={i.id} style={{ gap: 6 }}>
            <View style={styles.between}>
              <Text style={[styles.h3, { flex: 1 }]}>{i.name}</Text>
              <Text style={styles.text}>
                {i.claimed} / {capacity} shares
              </Text>
            </View>
            <Text style={styles.muted}>{describeShare(i).share}</Text>
            <ProgressBar value={i.claimed} total={capacity} />
            <Text style={styles.muted}>
              {i.claimed === 0
                ? "No shares yet."
                : i.shortfall > 0
                  ? `${i.shortfall} more share${i.shortfall === 1 ? "" : "s"} would fill the last pack.`
                  : "Every pack needed so far is full."}
            </Text>
          </View>
        );
      })}
      <Collapsible
        title="Who’s in"
        summary={`${v.members.length} member${v.members.length === 1 ? "" : "s"}`}
      >
        {v.members.length === 0 && (
          <Text style={styles.muted}>Nobody has joined yet.</Text>
        )}
        {v.members.map((m) => (
          <View key={m.userId} style={{ gap: 2 }}>
            <Text style={styles.text}>
              {m.name}
              {m.university ? " · Verified UVic" : ""}
            </Text>
            <Text style={styles.muted}>
              {m.claims.map((c) => `${c.quantity} × ${c.name}`).join(", ") ||
                "No shares"}{" "}
              · {m.attending ? "Pickup confirmed" : "Pickup not confirmed"}
            </Text>
          </View>
        ))}
      </Collapsible>
      {!readOnly && o.kind === "community" && (
        <AddItems view={v} refresh={refresh} />
      )}
      {!readOnly && <InviteTools view={v} />}
      {!readOnly && (
        <Advance
          view={v}
          to="locked"
          label="Close shares and make the shopping list"
          warning="Members won’t be able to change or release shares after this."
          refresh={refresh}
          disabled={claimedTotal === 0}
          blocker={
            claimedTotal === 0
              ? "You can close shares once someone has claimed one."
              : undefined
          }
        />
      )}
    </>
  );
}

/** Add items while shares are open, including ones members asked for. */
function AddItems({
  view: v,
  refresh,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const r = useResource<ProductRequest[]>(`/orders/${v.order.id}/requests`);
  const waiting = r.data?.filter((q) => q.status === "open") ?? [];
  const answered = r.data?.filter((q) => q.status !== "open") ?? [];
  const [adding, setAdding] = useState<string | null>(null);
  // Open the list by itself once requests arrive and some are waiting.
  const [requestsOpen, setRequestsOpen] = useState(false);
  useEffect(() => {
    if (waiting.length) setRequestsOpen(true);
  }, [waiting.length]);
  const done = async () => {
    setAdding(null);
    await Promise.all([refresh(), r.refresh()]);
  };
  return (
    <>
      <Collapsible
        title="Member requests"
        summary={
          waiting.length
            ? `${waiting.length} waiting for you`
            : "Nothing waiting"
        }
        open={requestsOpen}
        onToggle={setRequestsOpen}
      >
        {r.data?.length === 0 && (
          <Text style={styles.muted}>
            Members can ask you to add items while shares are open.
          </Text>
        )}
        {[...waiting, ...answered].map((q) => (
          <RequestCard
            key={q.id}
            request={q}
            refresh={r.refresh}
            showTarget={false}
            canVote={false}
          >
            {q.status === "open" &&
              (adding === q.id ? (
                <AddItemForm
                  view={v}
                  requestId={q.id}
                  initialSearch={q.name}
                  onDone={done}
                  onCancel={() => setAdding(null)}
                />
              ) : (
                <DeclineOrAdd
                  view={v}
                  requestId={q.id}
                  onAdd={() => setAdding(q.id)}
                  onDone={done}
                />
              ))}
          </RequestCard>
        ))}
      </Collapsible>
      <Collapsible
        title="Add an item"
        summary="Members can claim it right away"
        open={adding === "new"}
        onToggle={(o) => setAdding(o ? "new" : null)}
      >
        <AddItemForm view={v} onDone={done} onCancel={() => setAdding(null)} />
      </Collapsible>
    </>
  );
}

function DeclineOrAdd({
  view: v,
  requestId,
  onAdd,
  onDone,
}: {
  view: OrderView;
  requestId: string;
  onAdd: () => void;
  onDone: () => Promise<void>;
}) {
  const a = useAction();
  return (
    <>
      <View style={[styles.row, { gap: 8 }]}>
        <View style={{ flex: 1 }}>
          <Button onPress={onAdd}>Add to group</Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            disabled={a.busy}
            onPress={() =>
              void a.run(async () => {
                await post(
                  `/orders/${v.order.id}/requests/${requestId}/decline`,
                );
                await onDone();
              })
            }
          >
            Not this time
          </Button>
        </View>
      </View>
      <ErrorText message={a.error} />
    </>
  );
}

function AddItemForm({
  view: v,
  requestId,
  initialSearch,
  onDone,
  onCancel,
}: {
  view: OrderView;
  requestId?: string;
  initialSearch?: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const a = useAction(),
    [draft, setDraft] = useState<ItemDraft>(emptyDraft());
  const problems = draftProblems(draft);
  return (
    <View style={[styles.note, { backgroundColor: "#fff", padding: 0 }]}>
      <ItemEditor
        title={requestId ? "Choose the item to add" : "New item"}
        value={draft}
        onChange={setDraft}
        initialSearch={initialSearch}
      />
      <ErrorText message={a.error} />
      <Button
        disabled={a.busy || problems.length > 0}
        onPress={() =>
          void a.run(async () => {
            await post(`/orders/${v.order.id}/items`, {
              item: draftToInput(draft),
              ...(requestId ? { requestId } : {}),
            });
            setDraft(emptyDraft());
            await onDone();
          })
        }
      >
        {a.busy ? "Adding…" : "Add to group"}
      </Button>
      {draft.chosen && problems.length > 0 && (
        <Text style={styles.muted}>{problems.join(" ")}</Text>
      )}
      <Button secondary onPress={onCancel}>
        Cancel
      </Button>
    </View>
  );
}

function InviteTools({ view: v }: { view: OrderView }) {
  const a = useAction(),
    [email, setEmail] = useState("");
  if (!v.inviteToken) return null;
  const link = ExpoLinking.createURL(`/order/${v.order.id}`, {
    queryParams: { invite: v.inviteToken },
  });
  return (
    <Collapsible title="Invite people" summary="Share a link or send an email">
      <Text selectable style={styles.muted}>
        {link}
      </Text>
      <Button
        secondary
        onPress={() =>
          void a.run(() =>
            Share.share({ message: `Join ${v.order.name}: ${link}` }),
          )
        }
      >
        Share invite link
      </Button>
      <Field
        label="Invite by email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Button
        secondary
        disabled={a.busy || !email.trim()}
        onPress={() =>
          void a.run(async () => {
            await post(`/orders/${v.order.id}/invite`, { email });
            setEmail("");
          })
        }
      >
        Send invitation
      </Button>
      <Text style={styles.muted}>
        Share only with people you want in this group.
      </Text>
      <ErrorText message={a.error} />
    </Collapsible>
  );
}

/* ---------- Step 2: shop ---------- */
function ShopStep({
  view: v,
  refresh,
  readOnly,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
  readOnly: boolean;
}) {
  const o = v.order;
  const needed = neededItems(v);
  const notNeeded = v.items.filter((i) => !(i.available && i.claimed > 0));
  const bought = needed.filter((i) => i.bought).length;
  const pending = needed.filter(
    (i) => i.shortfall > 0 && i.shortfallDecision === "pending",
  ).length;
  const shopping = o.status === "shopping";
  return (
    <>
      <StepHeader
        title="Shopping list"
        detail={
          shopping
            ? "Check off each item as it goes in the cart."
            : "Review the list, then start shopping when you’re at the store."
        }
      />
      {shopping && (
        <View style={styles.note}>
          <View style={styles.between}>
            <Text style={styles.text}>In the cart</Text>
            <Text style={styles.h3}>
              {bought} of {needed.length}
            </Text>
          </View>
          <ProgressBar value={bought} total={needed.length} />
        </View>
      )}
      {needed.map((i) => (
        <ShopItem
          key={`${i.id}-${i.priceCents}-${i.available}`}
          item={i}
          view={v}
          refresh={refresh}
          readOnly={readOnly}
        />
      ))}
      {notNeeded.length > 0 && (
        <Collapsible
          title="Not on the list"
          summary={`${notNeeded.length} item${notNeeded.length === 1 ? "" : "s"} with no shares or unavailable`}
        >
          {notNeeded.map((i) => (
            <ShopItem
              key={`${i.id}-${i.priceCents}-${i.available}`}
              item={i}
              view={v}
              refresh={refresh}
              readOnly={readOnly}
            />
          ))}
        </Collapsible>
      )}
      {!readOnly && o.status === "locked" && (
        <Advance
          view={v}
          to="shopping"
          label="Start shopping"
          warning="You’ll check off items as you buy them."
          refresh={refresh}
          disabled={pending > 0 || needed.length === 0}
          blocker={
            pending > 0
              ? `Decide what to do with ${pending} unfilled pack${pending === 1 ? "" : "s"} first.`
              : needed.length === 0
                ? "Nothing needs buying. You can cancel this order under More options."
                : undefined
          }
        />
      )}
      {!readOnly && shopping && (
        <Advance
          view={v}
          to="ready"
          label="Done shopping"
          warning="Pickup opens and each member gets a collection code to show you."
          refresh={refresh}
          disabled={bought < needed.length}
          blocker={
            bought < needed.length
              ? `Check off ${needed.length - bought} more item${needed.length - bought === 1 ? "" : "s"} first.`
              : undefined
          }
        />
      )}
    </>
  );
}

function ShopItem({
  item: i,
  view: v,
  refresh,
  readOnly,
}: {
  item: Item;
  view: OrderView;
  refresh: () => Promise<void>;
  readOnly: boolean;
}) {
  const [price, setPrice] = useState(String(i.priceCents / 100)),
    a = useAction();
  const shopping = v.order.status === "shopping";
  const patch = (change: object) =>
    a.run(async () => {
      await api(`/orders/${v.order.id}/items/${i.id}`, {
        method: "PATCH",
        body: JSON.stringify(change),
      });
      await refresh();
    });
  const onList = i.available && i.claimed > 0;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: shopping && i.bought ? C.ink : C.line,
        borderRadius: 10,
        padding: 14,
        gap: 8,
      }}
    >
      {shopping && onList && !readOnly ? (
        <Check
          label={`${i.requiredPacks} × ${i.name}: pack of ${i.packLabel}`}
          value={i.bought}
          onChange={(bought) => void patch({ bought })}
          disabled={a.busy}
        />
      ) : (
        <Text style={styles.h3}>
          {onList ? `${i.requiredPacks} × ` : ""}
          {i.name}
          {onList ? `: pack of ${i.packLabel}` : ""}
        </Text>
      )}
      <Text style={styles.muted}>
        {i.claimed} share{i.claimed === 1 ? "" : "s"} committed ·{" "}
        {money(i.priceCents)} per pack
        {!i.available ? " · Unavailable" : ""}
      </Text>
      {i.shortfall > 0 && i.available && !readOnly && (
        <View style={styles.note}>
          <Text style={styles.text}>
            {i.shortfall} share{i.shortfall === 1 ? "" : "s"} in the last pack
            weren’t claimed.
          </Text>
          <Text style={styles.muted}>
            Buy the pack anyway (you keep the extra) or skip this item.
          </Text>
          <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
            <Choice
              label="Buy anyway"
              selected={i.shortfallDecision === "proceed"}
              onPress={() => void patch({ shortfallDecision: "proceed" })}
            />
            <Choice
              label="Skip item"
              selected={i.shortfallDecision === "skip"}
              onPress={() => void patch({ shortfallDecision: "skip" })}
            />
          </View>
        </View>
      )}
      {!readOnly && (
        <Collapsible
          title="Price or stock changed?"
          summary="Update the pack price or mark it unavailable"
        >
          <Check
            label={i.available ? "In stock" : "Unavailable at the store"}
            value={i.available}
            onChange={(available) =>
              void patch({ available, shortfallDecision: "pending" })
            }
            disabled={a.busy}
          />
          <Field
            label={`Pack price for ${i.name} (CAD)`}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
          <Button
            secondary
            disabled={a.busy}
            onPress={() =>
              void patch({ priceCents: Math.round(Number(price) * 100) })
            }
          >
            Update price
          </Button>
          <Text style={styles.muted}>
            Members are notified when a price or availability changes.
          </Text>
        </Collapsible>
      )}
      {!!i.storage && <Text style={styles.muted}>{i.storage}</Text>}
      <ErrorText message={a.error} />
    </View>
  );
}

/* ---------- Step 3: hand out ---------- */
function HandOutStep({
  view: v,
  refresh,
  readOnly,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
  readOnly: boolean;
}) {
  const o = v.order;
  const bags = bagsOf(v);
  const collected = bags.filter((m) => m.collectedAt).length;
  return (
    <>
      <StepHeader
        title="Hand out"
        detail={`${o.pickupLocation} · ${when(o.pickupAt)} – ${when(o.pickupEnd)}`}
      />
      <DirectionsButton order={o} />
      <View style={styles.note}>
        <View style={styles.between}>
          <Text style={styles.text}>Bags handed out</Text>
          <Text style={styles.h3}>
            {collected} of {bags.length}
          </Text>
        </View>
        <ProgressBar value={collected} total={bags.length} />
      </View>
      {bags.map((m) => (
        <HandOutBag
          key={m.userId}
          member={m}
          view={v}
          refresh={refresh}
          readOnly={readOnly}
        />
      ))}
      {!readOnly && o.status === "ready" && (
        <Advance
          view={v}
          to="completed"
          label="Complete order"
          warning="This closes the order and moves it to history."
          refresh={refresh}
          disabled={collected < bags.length}
          blocker={
            collected < bags.length
              ? `${bags.length - collected} bag${bags.length - collected === 1 ? "" : "s"} still to hand out.`
              : undefined
          }
        />
      )}
    </>
  );
}

function HandOutBag({
  member: m,
  view: v,
  refresh,
  readOnly,
}: {
  member: Member;
  view: OrderView;
  refresh: () => Promise<void>;
  readOnly: boolean;
}) {
  const a = useAction(),
    [code, setCode] = useState("");
  const status = m.collectedAt
    ? `Collected · ${when(m.collectedAt)}`
    : m.arrived
      ? "Here now · waiting for handoff"
      : m.attending
        ? "Not here yet"
        : "Not here yet · pickup not confirmed";
  return (
    <Collapsible title={m.name} summary={status} defaultOpen={!m.collectedAt}>
      {m.claims
        .filter((c) => c.available && c.quantity > 0)
        .map((c) => (
          <Text key={c.itemId} style={styles.text}>
            {c.name} ·{" "}
            {claimText(c.quantity, v.items.find((i) => i.id === c.itemId) ?? c)}
          </Text>
        ))}
      <Text style={styles.muted}>
        {money(m.estimateCents)} estimated product cost
      </Text>
      {m.collectedAt ? (
        <Text style={styles.h3}>Handed out ✓</Text>
      ) : (
        !readOnly && (
          <>
            <Field
              label={`${m.name}’s collection code`}
              autoCapitalize="characters"
              autoCorrect={false}
              value={code}
              onChangeText={setCode}
              placeholder="Ask them to show their code"
            />
            <Button
              disabled={a.busy || !code.trim()}
              onPress={() =>
                void a.run(async () => {
                  await post(`/orders/${v.order.id}/collect`, {
                    code,
                    userId: m.userId,
                  });
                  setCode("");
                  await refresh();
                })
              }
            >
              Confirm handoff
            </Button>
          </>
        )
      )}
      <ErrorText message={a.error} />
    </Collapsible>
  );
}

function Done({ view: v }: { view: OrderView }) {
  const bags = bagsOf(v);
  return (
    <View style={styles.note}>
      <Text style={styles.h2}>Order complete</Text>
      <Text style={styles.text}>
        {bags.length} bag{bags.length === 1 ? "" : "s"} handed out. Thanks for
        organizing!
      </Text>
      <Text style={styles.muted}>
        To run it again, use “Repeat as a new draft” below.
      </Text>
    </View>
  );
}

/* ---------- Draft review ---------- */
function DraftReview({
  view: v,
  refresh,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const o = v.order,
    a = useAction();
  return (
    <>
      <View style={styles.note}>
        <Text style={styles.h3}>Review before publishing</Text>
        <Text style={styles.muted}>
          {o.visibility === "private"
            ? "Only people with your invite link can join."
            : "This order will appear in Community."}{" "}
          Membership limit: {o.maxMembers}, including you.{" "}
          {o.cadence !== "once"
            ? `Intended cadence: ${o.cadence}. Each repeat needs a new draft.`
            : ""}
        </Text>
        <Text style={styles.muted}>
          Shares close {when(o.deadline)} · Pickup {when(o.pickupAt)} at{" "}
          {o.pickupLocation}
        </Text>
      </View>
      <Collapsible
        title="Items"
        summary={`${v.items.length} items`}
        defaultOpen
      >
        {v.items.map((i) => (
          <View key={i.id} style={{ gap: 2 }}>
            <Text style={styles.text}>{i.name}</Text>
            <Text style={styles.muted}>
              {describeShare(i).share} · {money(i.shareEstimateCents)} per share
            </Text>
            <Text style={styles.muted}>
              {describeShare(i).pack} · up to {i.packCount * i.sharesPerPack}{" "}
              shares ({i.packCount} pack{i.packCount === 1 ? "" : "s"})
            </Text>
          </View>
        ))}
      </Collapsible>
      <Button
        secondary
        onPress={() =>
          router.push({ pathname: "/(tabs)/create", params: { id: o.id } })
        }
      >
        Edit draft
      </Button>
      <ErrorText message={a.error} />
      <Button
        disabled={a.busy}
        onPress={() =>
          void a.run(async () => {
            await post(`/orders/${o.id}/publish`);
            await refresh();
          })
        }
      >
        Publish order
      </Button>
    </>
  );
}

/* ---------- Less common actions ---------- */
function MoreOptions({
  view: v,
  refresh,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const o = v.order,
    [repeat, setRepeat] = useState(false);
  const ended = ["completed", "cancelled"].includes(o.status);
  return (
    <Collapsible title="More options" summary="Repeat or cancel this order">
      <Button secondary onPress={() => setRepeat(!repeat)}>
        {repeat ? "Close repeat setup" : "Repeat as a new draft"}
      </Button>
      {repeat && <RepeatOrder orderId={o.id} />}
      {!ended && (
        <Advance
          view={v}
          to="cancelled"
          label="Cancel order"
          warning="This ends the order for everyone and invalidates collection codes."
          refresh={refresh}
        />
      )}
    </Collapsible>
  );
}

function RepeatOrder({ orderId }: { orderId: string }) {
  const HOUR = 3600000;
  const at = (h: number) => roundUp(new Date(Date.now() + h * HOUR));
  const [deadline, setDeadline] = useState(at(168)),
    [purchase, setPurchase] = useState(at(170)),
    [pickup, setPickup] = useState(at(172)),
    [end, setEnd] = useState(at(174)),
    a = useAction();
  // Moving an earlier date pushes the later ones along so they stay in order.
  const push = (d: Date, next: Date, set: (x: Date) => void) =>
    next < d ? (set(new Date(d.getTime() + 2 * HOUR)), true) : false;
  return (
    <View style={styles.note}>
      <Text style={styles.muted}>
        Choose the new dates. You’ll review the new draft before publishing.
      </Text>
      <DateTimeField
        label="Shares close"
        value={deadline}
        min={new Date()}
        onChange={(d) => {
          setDeadline(d);
          push(d, purchase, setPurchase);
        }}
      />
      <DateTimeField
        label="You go shopping"
        value={purchase}
        min={deadline}
        onChange={(d) => {
          setPurchase(d);
          push(d, pickup, setPickup);
        }}
      />
      <DateTimeField
        label="Pickup starts"
        value={pickup}
        min={purchase}
        onChange={(d) => {
          setPickup(d);
          if (end <= d) setEnd(new Date(d.getTime() + 2 * HOUR));
        }}
      />
      <DateTimeField
        label="Pickup ends"
        value={end}
        min={new Date(pickup.getTime() + 30 * 60000)}
        onChange={setEnd}
      />
      <ErrorText message={a.error} />
      <Button
        disabled={a.busy}
        onPress={() =>
          void a.run(async () => {
            const r = await post<{ id: string }>(`/orders/${orderId}/repeat`, {
              deadline: deadline.toISOString(),
              purchaseAt: purchase.toISOString(),
              pickupAt: pickup.toISOString(),
              pickupEnd: end.toISOString(),
            });
            router.push({
              pathname: "/(tabs)/order/[id]",
              params: { id: r.id, view: "organize" },
            });
          })
        }
      >
        Create repeat draft
      </Button>
    </View>
  );
}
