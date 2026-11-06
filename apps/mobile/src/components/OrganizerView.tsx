import React, { useEffect, useState } from "react";
import { View, Text, Share, Pressable, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
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
  CurrencyField,
} from "./ui";
import { ItemIcon } from "./ItemIcon";
import { ReceiptLine } from "./Receipt";
import { palette as P, type, brand } from "../theme";
import { Badge } from "./Market";
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
import { Collapsible, ProgressBar } from "./Sections";

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
  onMyShare,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
  /** Switch to the My share view so the organizer can add their own share. */
  onMyShare?: () => void;
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
          <Text style={styles.h3}>This group was cancelled.</Text>
          <Text style={styles.muted}>Members were notified.</Text>
        </View>
        <MoreOptions view={v} refresh={refresh} />
      </>
    );

  const readOnly = viewing < Math.min(current, 2);
  return (
    <>
      <StepBar current={current} viewing={viewing} onSelect={setViewing} />
      {readOnly && (
        <View style={[styles.note, styles.row, { gap: 10 }]}>
          <Ionicons name="eye-outline" size={20} color={P.ink} />
          <Text style={[styles.text, { flex: 1 }]}>
            Looking back at {STEPS[viewing].toLowerCase()}. Nothing can be
            changed here.
          </Text>
        </View>
      )}
      {o.status === "completed" && viewing === 2 ? (
        <Done view={v} />
      ) : viewing === 0 ? (
        <CollectStep
          view={v}
          refresh={refresh}
          readOnly={readOnly}
          onMyShare={onMyShare}
        />
      ) : viewing === 1 ? (
        <ShopStep view={v} refresh={refresh} readOnly={readOnly} />
      ) : (
        <HandOutStep view={v} refresh={refresh} readOnly={readOnly} />
      )}
      <MoreOptions view={v} refresh={refresh} />
    </>
  );
}

/**
 * The three organizer steps as one bar. Finished steps can be tapped to look
 * back at them; the current step is highlighted; later steps are locked.
 */
function StepBar({
  current,
  viewing,
  onSelect,
}: {
  current: number;
  viewing: number;
  onSelect: (i: number) => void;
}) {
  const active = Math.min(current, STEPS.length - 1);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {STEPS.map((label, i) => {
          const done = i < current;
          const isCurrent = i === active && current < STEPS.length;
          const selected = i === viewing;
          const locked = i > active;
          return (
            <Pressable
              key={label}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled: locked }}
              accessibilityLabel={`Step ${i + 1}, ${label}${done ? ", done" : isCurrent ? ", now" : ", later"}`}
              disabled={locked}
              onPress={() => onSelect(i)}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 8,
                gap: 4,
                alignItems: "center",
                backgroundColor: selected ? brand.greenDark : P.paper,
                borderWidth: 1.5,
                borderColor: selected ? brand.greenDark : P.line,
                opacity: locked ? 0.5 : 1,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected
                    ? P.white
                    : done
                      ? brand.greenSoft
                      : P.track,
                }}
              >
                {done ? (
                  <Ionicons
                    name="checkmark"
                    size={15}
                    color={brand.greenDeep}
                  />
                ) : locked ? (
                  <Ionicons name="lock-closed" size={12} color={P.muted} />
                ) : (
                  <Text style={[type.label, { fontSize: 12 }]}>{i + 1}</Text>
                )}
              </View>
              <Text
                style={[
                  type.label,
                  { fontSize: 13, color: selected ? P.white : P.ink },
                ]}
              >
                {label}
              </Text>
              <Text
                style={[
                  type.mono,
                  { fontSize: 11, color: selected ? brand.greenSoft : P.muted },
                ]}
              >
                {done ? "Done · view" : isCurrent ? "Now" : "Later"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
  onMyShare,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
  readOnly: boolean;
  onMyShare?: () => void;
}) {
  const o = v.order;
  const myShare = v.myClaims.some((c) => c.available && c.quantity > 0);
  const buyers = v.members.filter(
    (m) =>
      m.userId !== v.order.organizerId && m.claims.some((c) => c.quantity > 0),
  ).length;
  return (
    <>
      {!readOnly && !myShare && (
        <View
          style={[
            styles.card,
            { gap: 8, borderWidth: 2, borderColor: brand.orange },
          ]}
        >
          <Text style={styles.h3}>Add your own share</Text>
          <Text style={styles.text}>
            Organizers split runs they’re shopping for anyway, so you need at
            least one share before shares can close. You pay for it at the
            store, with no fee.
          </Text>
          {onMyShare && (
            <Button icon="add" onPress={onMyShare}>
              Add my share
            </Button>
          )}
        </View>
      )}
      <StepHeader
        title="Collecting shares"
        detail={
          readOnly ? "Shares are closed." : `Open until ${when(o.deadline)}`
        }
      />
      <View style={styles.card}>
        <View style={styles.between}>
          <Text style={styles.text}>Members joined</Text>
          <Text style={styles.h3}>
            {o.memberCount} of {o.maxMembers}
          </Text>
        </View>
        <ProgressBar value={o.memberCount} total={o.maxMembers} />
      </View>
      <MoneyCard view={v} />
      <View style={[styles.card, { gap: 16 }]}>
        <Text style={styles.label}>Shares claimed</Text>
        {v.items.map((i) => {
          const capacity = i.packCount * i.sharesPerPack;
          return (
            <View key={i.id} style={{ gap: 6 }}>
              <View style={styles.between}>
                <ItemIcon item={i} size={26} />
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
                    ? `${i.shortfall} more to fill the last pack`
                    : "Packs full"}
              </Text>
            </View>
          );
        })}
      </View>
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
            {m.userId !== v.order.organizerId && m.estimateCents > 0 && (
              <PaidBadge member={m} />
            )}
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
          label="Close shares"
          warning="Members can’t change their shares after this. Each buyer’s card gets a hold for their shares + fee; nothing is charged until you start shopping."
          refresh={refresh}
          disabled={!myShare || buyers === 0}
          blocker={
            !myShare
              ? "Add your own share first: open the My share tab. You pay for it at the store."
              : buyers === 0
                ? "Waiting for someone else to join. If nobody joins by the deadline, the group is cancelled."
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
          <Text style={styles.muted}>No requests yet.</Text>
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
    <View style={[styles.note, { backgroundColor: P.paper, padding: 0 }]}>
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
    <Collapsible title="Invite people" summary="Link or email">
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
  const declined = v.members.filter((m) => m.hold?.status === "failed");
  return (
    <>
      <StepHeader
        title="Shopping list"
        detail={
          shopping
            ? "Tick items as they go in the cart."
            : "Start when you’re at the store."
        }
      />
      <MoneyCard view={v} />
      {shopping && (
        <View style={styles.card}>
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
          warning="Every buyer’s hold is charged now and the item money is released to you. You’ll tick items off as you buy them."
          refresh={refresh}
          disabled={pending > 0 || needed.length === 0 || declined.length > 0}
          blocker={
            declined.length > 0
              ? `Waiting on ${declined.length} ${declined.length === 1 ? "buyer" : "buyers"} to fix a declined card (until ${when(declined[0].hold!.retryUntil!)}). After that their shares drop and you can start.`
              : pending > 0
                ? `Decide what to do with ${pending} unfilled pack${pending === 1 ? "" : "s"} first.`
                : needed.length === 0
                  ? "Nothing to buy. You can cancel under More options."
                  : undefined
          }
        />
      )}
      {!readOnly && shopping && (
        <>
          {bought === needed.length && (
            <ProofUpload view={v} refresh={refresh} />
          )}
          <Advance
            view={v}
            to="ready"
            label="Done shopping"
            warning="Pickup opens and members get their codes. They’ll see your receipt and photo."
            refresh={refresh}
            disabled={bought < needed.length || !v.proof}
            blocker={
              bought < needed.length
                ? `${needed.length - bought} item${needed.length - bought === 1 ? "" : "s"} left to buy`
                : !v.proof
                  ? "Upload the receipt and a photo of the items first."
                  : undefined
            }
          />
        </>
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
        borderWidth: 1.5,
        borderColor: shopping && i.bought ? brand.greenDark : P.line,
        borderRadius: 18,
        backgroundColor: shopping && i.bought ? brand.greenSoft : P.paper,
        padding: 14,
        gap: 8,
      }}
    >
      <View style={styles.row}>
        <ItemIcon item={i} size={48} />
        <View style={{ flex: 1 }}>
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
        </View>
      </View>
      <Text style={styles.muted}>
        {i.claimed} share{i.claimed === 1 ? "" : "s"} committed ·{" "}
        {money(i.priceCents)} per pack
        {!i.available ? " · Unavailable" : ""}
      </Text>
      {i.shortfall > 0 && i.available && !readOnly && (
        <View style={styles.note}>
          <Text style={styles.text}>
            {i.shortfall} share{i.shortfall === 1 ? "" : "s"} unclaimed in the
            last pack. Buy it anyway (you keep the extra) or skip?
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
          summary="Update price or availability"
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
  // A no-show counts as dealt with: the organizer keeps that bag.
  const collected = bags.filter((m) => m.collectedAt || m.noShowAt).length;
  return (
    <>
      <StepHeader
        title="Hand out"
        detail={`${o.pickupLocation} · ${when(o.pickupAt)} – ${when(o.pickupEnd)}`}
      />
      <DirectionsButton order={o} />
      <View style={styles.card}>
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
      {o.status === "ready" && bags.length > 0 && collected === bags.length && (
        <Celebrate
          title="Every bag is handed out"
          body="All pickup codes were confirmed. Finish the group to wrap up."
        />
      )}
      {!readOnly && o.status === "ready" && (
        <Advance
          view={v}
          to="completed"
          label="Finish group"
          warning="This moves the group to Done."
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
  const holdUntil = Date.parse(v.order.pickupEnd) + 24 * 3600000;
  const missed = Date.now() > Date.parse(v.order.pickupEnd);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const status = m.collectedAt
    ? `Collected · ${when(m.collectedAt)}`
    : m.noShowAt
      ? "No-show · bag and payment are yours"
      : missed
        ? "Missed pickup · holding the bag"
        : m.arrived
          ? "Here now · waiting for handoff"
          : m.attending
            ? "Not here yet"
            : "Not here yet · pickup not confirmed";
  return (
    <Collapsible
      title={m.name}
      summary={`${status}${m.userId === v.order.organizerId ? " · Your own bag" : m.dueCents > 0 ? ` · Owes ${money(m.dueCents)}` : " · Paid"}`}
      defaultOpen={!m.collectedAt}
    >
      <View style={styles.row}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: P.chalk,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[type.label, { color: P.chalkText }]}>
            {m.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </Text>
        </View>
        <Text style={[styles.h3, { flex: 1 }]}>{m.name}</Text>
        {m.userId !== v.order.organizerId && <PaidBadge member={m} />}
      </View>
      {m.claims
        .filter((c) => c.available && c.quantity > 0)
        .map((c) => (
          <ReceiptLine
            key={c.itemId}
            name={`${c.name} ×${c.quantity}`}
            category={v.items.find((i) => i.id === c.itemId)?.category}
            cost={money(c.estimateCents)}
          />
        ))}
      <Text style={styles.muted}>{money(m.estimateCents)} estimated</Text>
      {m.collectedAt ? (
        <Badge tone="good">Handed out</Badge>
      ) : m.noShowAt ? (
        <Badge tone="urgent">No-show</Badge>
      ) : (
        !readOnly && (
          <>
            <Field
              label={`${m.name}’s pickup code`}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={7}
              autoCorrect={false}
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^\d ]/g, ""))}
              placeholder="6 digits from their phone"
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
            {missed && m.userId !== v.order.organizerId && (
              <View style={[styles.note, { gap: 8 }]}>
                {Date.now() < holdUntil ? (
                  <Text style={styles.text}>
                    {m.name.split(" ")[0]} missed the pickup window. Hold their
                    bag until {when(new Date(holdUntil).toISOString())} in case
                    they come late. After that you can mark a no-show.
                  </Text>
                ) : confirmNoShow ? (
                  <>
                    <Text style={styles.text}>
                      Mark {m.name.split(" ")[0]} as a no-show? You keep the
                      items and their payment, and they get a no-show mark.
                    </Text>
                    <Button
                      danger
                      disabled={a.busy}
                      onPress={() =>
                        void a.run(async () => {
                          await post(`/orders/${v.order.id}/no-show`, {
                            userId: m.userId,
                          });
                          await refresh();
                        })
                      }
                    >
                      Yes, mark no-show
                    </Button>
                    <Button secondary onPress={() => setConfirmNoShow(false)}>
                      Not yet
                    </Button>
                  </>
                ) : (
                  <Button
                    secondary
                    danger
                    onPress={() => setConfirmNoShow(true)}
                  >
                    Mark as no-show
                  </Button>
                )}
                <Text
                  accessibilityRole="link"
                  onPress={() => router.push("/policies")}
                  style={[type.label, { color: P.carrot, fontSize: 13 }]}
                >
                  No-show policy
                </Text>
              </View>
            )}
          </>
        )
      )}
      <ErrorText message={a.error} />
    </Collapsible>
  );
}

function Done({ view: v }: { view: OrderView }) {
  const bags = bagsOf(v);
  const collected = v.members
    .filter((m) => m.userId !== v.order.organizerId)
    .reduce((n, m) => n + m.paidCents, 0);
  return (
    <Celebrate
      title="Group complete!"
      body={`${bags.length} bag${bags.length === 1 ? "" : "s"} handed out and every code confirmed. Thanks for organizing.`}
    >
      <View style={[styles.row, { gap: 8, alignSelf: "stretch" }]}>
        {[
          [String(bags.length), "Bags"],
          [String(v.members.length), "Members"],
          [money(collected), "Collected"],
        ].map(([n, label]) => (
          <View
            key={label}
            style={{
              flex: 1,
              backgroundColor: P.white,
              borderRadius: 14,
              padding: 10,
              alignItems: "center",
            }}
          >
            <Text style={[type.total, { fontSize: 20 }]}>{n}</Text>
            <Text style={type.mono}>{label}</Text>
          </View>
        ))}
      </View>
    </Celebrate>
  );
}

/** Big "you finished this step" frame. */
function Celebrate({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          alignItems: "center",
          gap: 10,
          paddingVertical: 24,
          backgroundColor: brand.greenSoft,
        },
      ]}
    >
      <View
        style={{
          width: 68,
          height: 68,
          borderRadius: 34,
          backgroundColor: brand.greenDark,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="checkmark-done" size={36} color={P.white} />
      </View>
      <Text style={[type.title, { fontSize: 26, textAlign: "center" }]}>
        {title}
      </Text>
      <Text style={[styles.text, { textAlign: "center" }]}>{body}</Text>
      {children}
    </View>
  );
}

/** Money members have paid in, so the organizer knows what they can spend. */
function MoneyCard({ view: v }: { view: OrderView }) {
  const buyers = v.members.filter(
    (m) => m.userId !== v.order.organizerId && m.estimateCents > 0,
  );
  const expected = buyers.reduce((n, m) => n + m.estimateCents + m.feeCents, 0);
  const declined = buyers.filter((m) => m.hold?.status === "failed").length;
  const p = v.payouts;
  const open = v.order.status === "open";
  const locked = v.order.status === "locked";
  return (
    <View style={[styles.card, { gap: 10 }]}>
      <View style={styles.between}>
        <View style={{ flex: 1 }}>
          <Text style={styles.text}>
            {open
              ? "Buyers’ shares"
              : locked
                ? "Held on cards"
                : "Money collected"}
          </Text>
          <Text style={type.mono}>
            {open
              ? "Nothing is charged while shares are open"
              : locked
                ? "Charged when you start shopping"
                : "Held safely by POOLD until it’s released"}
          </Text>
        </View>
        <Text style={styles.h3}>
          {open
            ? money(expected)
            : locked
              ? `${money(p?.authorizedCents ?? 0)} of ${money(expected)}`
              : money(p?.collectedCents ?? 0)}
        </Text>
      </View>
      {!open && (
        <ProgressBar
          value={locked ? (p?.authorizedCents ?? 0) : (p?.collectedCents ?? 0)}
          total={Math.max(expected, 1)}
        />
      )}
      {p && !open && !locked && (
        <View style={{ gap: 6 }}>
          <View style={styles.between}>
            <Text style={type.mono}>Released to you</Text>
            <Text style={[type.label, { color: brand.greenDeep }]}>
              {money(p.releasedCents)}
            </Text>
          </View>
          <View style={styles.between}>
            <Text style={type.mono}>Still held (5% fees, after hand-out)</Text>
            <Text style={type.label}>{money(p.heldCents)}</Text>
          </View>
        </View>
      )}
      {declined > 0 && (
        <Text style={[type.mono, { color: P.beet }]}>
          {declined} {declined === 1 ? "card was" : "cards were"} declined. They
          have 2 hours to fix it before their shares drop.
        </Text>
      )}
      <Text style={[type.mono, { fontSize: 12 }]}>
        Your own share isn’t included: you pay for it at the store.
      </Text>
    </View>
  );
}

function PaidBadge({ member: m }: { member: Member }) {
  const h = m.hold;
  if (h?.status === "failed") return <Badge tone="urgent">Card declined</Badge>;
  if (h?.status === "authorized")
    return <Badge tone="neutral">{`Held ${money(h.amountCents)}`}</Badge>;
  if (m.paidCents > 0)
    return m.dueCents > 0 ? (
      <Badge tone="urgent">{`Owes ${money(m.dueCents)}`}</Badge>
    ) : (
      <Badge tone="good">{`Paid ${money(m.paidCents)}`}</Badge>
    );
  return <Badge tone="neutral">Card saved</Badge>;
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
        <Text style={styles.h3}>Ready to publish?</Text>
        <Text style={styles.muted}>
          {o.visibility === "private"
            ? "Only people with your link can join."
            : "Everyone can find it in Browse."}{" "}
          Shares close {when(o.deadline)}.
        </Text>
      </View>
      <Collapsible
        title="Items"
        summary={`${v.items.length} items`}
        defaultOpen
      >
        {v.items.map((i) => (
          <View key={i.id} style={{ gap: 2 }}>
            <View style={styles.row}>
              <ItemIcon item={i} size={26} />
              <Text style={styles.h3}>{i.name}</Text>
            </View>
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
        Publish group
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
    <Collapsible title="More options" summary="Repeat or cancel">
      <Button secondary onPress={() => setRepeat(!repeat)}>
        {repeat ? "Close repeat setup" : "Repeat as a new draft"}
      </Button>
      {repeat && <RepeatOrder orderId={o.id} />}
      {!ended && (
        <Advance
          view={v}
          to="cancelled"
          label="Cancel group"
          warning="This ends the group for everyone."
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

/** Pick a photo and return it as a small data URL. */
async function pickPhoto(camera: boolean) {
  const options = {
    mediaTypes: ["images"] as ImagePicker.MediaType[],
    quality: 0.35,
    base64: true,
  };
  const result = camera
    ? await ImagePicker.launchCameraAsync(options).catch(() =>
        ImagePicker.launchImageLibraryAsync(options),
      )
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset.base64) throw new Error("Couldn’t read that photo. Try another.");
  const data = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
  if (data.length > 1_400_000)
    throw new Error("That photo is too large. Try a closer or smaller one.");
  return data;
}

/** Proof of purchase: the full receipt and a photo of what was bought. */
function ProofUpload({
  view: v,
  refresh,
}: {
  view: OrderView;
  refresh: () => Promise<void>;
}) {
  const a = useAction();
  const [receipt, setReceipt] = useState(v.proof?.receiptPhoto ?? ""),
    [items, setItems] = useState(v.proof?.itemsPhoto ?? ""),
    [total, setTotal] = useState<number | null>(
      v.proof?.receiptTotalCents ?? null,
    );
  const collected = v.payouts?.collectedCents ?? 0;
  const slot = (
    label: string,
    hint: string,
    value: string,
    set: (s: string) => void,
  ) => (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <Image
          source={{ uri: value }}
          accessibilityLabel={label}
          style={{
            width: "100%",
            height: 180,
            borderRadius: 12,
            backgroundColor: P.track,
          }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            height: 110,
            borderRadius: 12,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: P.lineStrong,
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Ionicons name="camera-outline" size={26} color={P.muted} />
          <Text style={type.mono}>{hint}</Text>
        </View>
      )}
      <View style={[styles.row, { gap: 8 }]}>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            icon="camera-outline"
            disabled={a.busy}
            onPress={() =>
              void a.run(async () => {
                const d = await pickPhoto(true);
                if (d) set(d);
              })
            }
          >
            Take photo
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            icon="image-outline"
            disabled={a.busy}
            onPress={() =>
              void a.run(async () => {
                const d = await pickPhoto(false);
                if (d) set(d);
              })
            }
          >
            Choose
          </Button>
        </View>
      </View>
    </View>
  );
  return (
    <View style={[styles.card, { gap: 14 }]}>
      <View style={styles.between}>
        <Text style={styles.h2}>Proof of purchase</Text>
        {v.proof ? (
          <Badge tone="good">Uploaded</Badge>
        ) : (
          <Badge tone="urgent">Required</Badge>
        )}
      </View>
      <Text style={styles.muted}>
        Members see these so everyone knows what was spent.
      </Text>
      {slot(
        "Full receipt",
        "Show the whole receipt with the total",
        receipt,
        setReceipt,
      )}
      {slot(
        "Photo of the items",
        "Everything you bought, together",
        items,
        setItems,
      )}
      <CurrencyField
        label="Receipt total (CAD)"
        valueCents={total}
        onChangeCents={setTotal}
      />
      {!!total && collected > 0 && (
        <Text style={type.mono}>
          Members paid {money(collected)} including fees.
          {total > collected
            ? " The receipt is higher than what was collected."
            : ""}
        </Text>
      )}
      <ErrorText message={a.error} />
      <Button
        disabled={a.busy || !receipt || !items || !total}
        onPress={() =>
          void a.run(async () => {
            await post(`/orders/${v.order.id}/proof`, {
              receiptPhoto: receipt,
              itemsPhoto: items,
              receiptTotalCents: total,
            });
            await refresh();
          })
        }
      >
        {a.busy ? "Uploading…" : v.proof ? "Update proof" : "Upload proof"}
      </Button>
    </View>
  );
}
