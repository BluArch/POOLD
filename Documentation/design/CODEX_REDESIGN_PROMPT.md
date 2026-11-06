# Codex task: redesign the POOLD mobile app ("Market Receipt" design)

> **How to run this:** start Codex in the repo root in **Plan mode** (`/plan` or Shift+Tab) and say:
> "Read `Documentation/design/CODEX_REDESIGN_PROMPT.md` and follow it. Plan first, then build it phase by phase."
> Or paste everything below the line into Codex.

---

## 1. Goal

Restyle and simplify the whole POOLD app (`apps/mobile`, Expo / React Native) to match the **Market Receipt** design described in this file. Today's UI is a neutral navy-and-white design that is mostly text. The new one is colourful and warm, and it should be quicker to understand: fewer tabs, real titles, filter chips, item icons, steppers on items, a running receipt, a status track and a pickup ticket.

This is a **front-end redesign**. Every current feature must keep working exactly as it does now: sign-up and OTP, discovering groups, private invites, claiming shares, product requests, the organizer flow (draft → collect → shop → hand out), pickup codes, updates, the account and push deep links.

**Before you write any code, plan.** Read the files listed in section 2. Write a short plan that maps each current screen and component to its new version, list any open questions, and then build in the phases in section 8.

## 2. Context: the app today

- Monorepo with npm workspaces. Node ≥ 24.12 (see `.nvmrc`).
  - `apps/mobile`: Expo SDK 58, React Native 0.88, expo-router. **All of this task happens here.**
  - `apps/api`: Express + MySQL. Leave it alone, apart from the one optional additive change in section 6.2.
  - `packages/contracts`: shared zod schemas and types (`OrderSummary`, `OrderView`, `Item`, `Claim`, `STATUS_LABELS`, `CATEGORIES`, `PICKUP_PLACES`, `money`, `claimText`, and so on).
- Run it locally by following `Documentation/implementation/SETUP.md` (`npm run db:local`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`). Then open the web preview at http://localhost:8081 and sign in with the demo account **Maya**.
- Checks: `npm run typecheck`, `npm run lint`, `npm test`.
- Files to read first:
  - `apps/mobile/src/components/ui.tsx`: colour tokens `C`, `styles`, `Screen`, `Button`, `Field`, `Choice`, `Check`, `IconButton`, `Loading`, `ResourceState` and the data hooks. **The new design system replaces the visual parts of this file.**
  - `apps/mobile/src/components/Sections.tsx`: `Collapsible`, `QuantityStepper`, `ProgressBar`, `Segmented`, `StepTracker`.
  - `apps/mobile/src/components/OrderRow.tsx`: the group card used in every list.
  - `apps/mobile/src/components/MemberView.tsx`: the buyer view (shares, requests, `PickupDetails`, `DirectionsButton`).
  - `apps/mobile/src/components/OrganizerView.tsx`: the organizer steps (collect, shop, hand out, more options).
  - `apps/mobile/src/components/ItemEditor.tsx`, `Pickers.tsx`, `RequestList.tsx`, `EmailVerification.tsx`.
  - `apps/mobile/src/app/index.tsx`: welcome screen and sign-in / sign-up.
  - `apps/mobile/src/app/(tabs)/_layout.tsx`: tabs today are Community / My Orders / Organize. Hidden routes: invite, order/[id], create, account, updates, requests, claim/[id].
  - `apps/mobile/src/app/(tabs)/*.tsx`, `order/[id].tsx`, `claim/[id].tsx`.
  - `packages/contracts/src/index.ts`: types, `CATEGORIES`, `CATALOG`, `STATUS_LABELS`.

## 3. Constraints

- **Leave behaviour, API calls, validation and data flow as they are.** Change presentation, layout, navigation and copy only. Keep using `useResource`, `useAction`, `api`/`post` and the session.
- **Don't add payment features.** Prices are estimates in CAD. The UI may say "Pay {organizer} directly", but nothing in the app may handle money.
- **Keep route paths working**, because push notifications and invite links open `/(tabs)/order/[id]` and `/?order=…&invite=…`. You may rename tab *titles*. If you merge or retire a route (for example `organize`), keep the file as a `<Redirect>` to its replacement, so old links still work.
- **Use real data everywhere.** The names in this file (Mara, Paper towels, $10.60, code 4827) are examples only. Never hard-code sample data.
- **Accessibility must not get worse.** Every touch target is at least 44×44, every icon-only button has an `accessibilityLabel`, and text contrast is at least 4.5:1 (the colours in section 4 were picked to pass). Keep the existing labels and roles. Display-only elements must not use `button` or `tab` roles.
- **It must work on iOS, Android and web** (react-native-web export). Content keeps its max width (about 640) on wide screens.
- **Dependencies:** add only these, using `npx expo install` inside `apps/mobile`:
  - `expo-font`
  - `@expo-google-fonts/fraunces`
  - `@expo-google-fonts/work-sans`
  - `@expo-google-fonts/dm-mono`
  - `react-native-svg`, for the zigzag receipt edges and dotted leader lines.

  Use the icon sets in the existing `@expo/vector-icons`; don't add another icon library.
- Follow the existing code style (TypeScript, function components, `StyleSheet`, Prettier). Don't add `useMemo` or `useCallback` by default.
- Don't commit secrets. Don't touch `.env`, `render.yaml` or the database.

## 4. Design system: "Market Receipt"

The feel: a Saturday farmers' market stall crossed with a till receipt. Chalkboard green headers, kraft-paper pages, cream paper cards with torn zigzag edges, rubber-stamp deadlines, hanging price tags, and receipt lines with dotted leaders in a typewriter font. It's warm and handmade, but the layout stays calm and readable.

Put all tokens in one new module, `apps/mobile/src/theme.ts`, and import them everywhere. Don't scatter hex values through the screens.

### 4.1 Colours

| Token | Hex | Use |
|---|---|---|
| `chalk` | `#24382E` | Headers, receipt panel, the round "+" button, secondary buttons, the + stepper |
| `chalkText` | `#F4EEDC` | Text and icons on `chalk` |
| `chalkMuted` | `#C9D3C4` | Secondary text on `chalk` |
| `chalkLine` | `#4E6456` | Chip outlines and dividers on `chalk` |
| `chalkLeader` | `#6F8577` | Dotted and dashed lines inside the receipt panel |
| `chalkTile` | `#34503F` | Icon tiles inside the receipt panel |
| `chalkTileIcon` | `#F4B47A` | Icons inside receipt tiles |
| `kraft` | `#EFE5D2` | Page background |
| `paper` | `#FBF7EE` | Cards, tab bar, inputs |
| `line` | `#DCCFB4` | Card borders, dividers, empty track segments |
| `lineStrong` | `#B7A985` | Outline buttons, − stepper border, dotted leaders on paper |
| `ink` | `#213328` | Main text |
| `muted` | `#5E5A48` | Secondary text (5.4:1 on kraft) |
| `beet` | `#8E2A45` | Deadline stamps, active tab, unread dot, destructive actions |
| `carrot` | `#E07A2E` | Primary call to action (ink text on it, never white) and the "bag ready" banner |
| `herb` | `#4F7F34` | Progress fills, spots tag, filled status track (white text OK) |
| `herbText` | `#3E6629` | Green *text* on kraft or paper |
| `herbSoft` | `#A9BF8F` | Other members' share in share bars |
| `track` | `#E6DAC1` | Empty part of share and progress bars |
| `tag` | `#F4D9B8` | Price-tag background |

**Item category tiles** (background / icon colour), keyed by `CATEGORIES` in contracts:

| Category | Tile | Icon |
|---|---|---|
| Pantry | `#E3E6CF` | `#4A5530` |
| Canned goods | `#E9D6D0` | `#7A3328` |
| Noodles & pasta | `#F4D9B8` | `#7A4A12` |
| Snacks | `#EAD3C0` | `#6E3B1E` |
| Drinks & coffee | `#E2D8E6` | `#5B3A66` |
| Breakfast | `#F3E3B3` | `#725A0E` |
| Household | `#DCE6E8` | `#2E4D57` |
| Personal care | `#DDE9DF` | `#2F5E44` |
| (unknown) | `#E6DAC1` | `#5E5A48` |

### 4.2 Type

Load the fonts with `useFonts` in `apps/mobile/src/app/_layout.tsx`, and render the existing `Loading` until they're ready.

- **Fraunces** (600, 700, 600 italic) for display: screen titles 34/40 (700), detail-screen titles 30/34, card titles 22/26, item names 16–17, totals 26–28. Section headings are 600 *italic* 20.
- **Work Sans** (400, 500, 600, 700) for reading: body 15/22, labels 600 13–14, buttons 700 15, tab labels 11.
- **DM Mono** (400, 500) for anything that is "printed": meta lines in UPPERCASE (`COSTCO · MARA H.`), prices per unit, countdowns, dates (`TUE NOV 03 · 3 GROUPS OPEN NEAR UVIC`), receipt lines, totals labels and the pickup code. Use 11–13 px with 0.6 letter-spacing on uppercase lines.

Expose these as named text styles in `theme.ts` (for example `type.title`, `type.cardTitle`, `type.body`, `type.mono`).

### 4.3 Shape and spacing

- Page side padding 20, gap between sections 16, card padding 14–16.
- Radii: cards 10–12, inputs 10, chips 8, icon tiles about 25% of their size, pills fully round.
- **Tag shape** for price tags, the spots tag, primary buttons and the bag-ready banner: corner radii `6 / size/2 / size/2 / 6` (square left, round right), plus a small `paper` dot (6–8 px) near the left edge, like the hole in a hanging tag.
- **Zigzag edge:** an SVG strip 8 px tall with 12 px teeth, filled with the colour of the surface it belongs to. Put it at the *bottom* of paper receipt cards (teeth pointing down) and at the *top* of the receipt panel (teeth pointing up).
- **Dotted leader:** a 1 px dotted line that fills the space between a receipt label and its price. Single-sided dotted borders render badly on Android, so draw it with `react-native-svg` or a row of 2 px dots.
- **No stripes, awnings, gradients or drop shadows.** Use a 1 px `line` border for separation.

### 4.4 Icons

- UI icons: Ionicons outline (already used). The tab bar uses `compass-outline`, `bag-handle-outline`, `add`, `notifications-outline` and `person-outline`.
- **Item icons:** write `apps/mobile/src/components/ItemIcon.tsx` (`<ItemIcon item={{ name, category }} size={22 | 26 | 48 | 52} />`). It draws a rounded tile in the category colours from 4.1 with a `MaterialCommunityIcons` glyph:
  - Pick the glyph by **keyword in the item name first**, then by category. Keywords: towel/toilet/tissue → `paper-roll`, rice → `rice`, pasta/noodle/penne/macaroni/dinner → `pasta`, coffee → `coffee`, tea → `tea`, granola/bar/cookie → `cookie`, chip/crisp → `food-variant`, can/soup/beans/tomato → `food-variant`, cereal/oat → `bowl-mix`, milk → `cup`, soap/detergent/cleaner → `spray-bottle`, toothpaste/toothbrush → `toothbrush-paste`, shampoo/lotion → `lotion`.
  - Category fallbacks: Pantry → `basket-outline`, Canned goods → `food-variant`, Noodles & pasta → `pasta`, Snacks → `cookie`, Drinks & coffee → `coffee`, Breakfast → `bowl-mix`, Household → `spray-bottle`, Personal care → `lotion`.
  - **Check every glyph name** against `MaterialCommunityIcons.glyphMap` at build time. If one isn't there, fall back to `basket-outline`, and drop the missing name from the map.
  - Mark the tile as decorative (`accessible={false}`); the item name next to it carries the meaning.

## 5. Components to build

Put shared pieces in `apps/mobile/src/components/` and replace the old visuals in `ui.tsx` and `Sections.tsx`. Keep their exported names where screens already import them, so the diff stays small.

1. **`Screen`** (rework it). On the top-level tab screens (Discover, My groups, Updates, Profile) it renders a **ChalkHeader**: `chalk` background with 20 px padding, holding:
   - the `poold` wordmark (Fraunces italic 700, 24, `chalkText`) on the left;
   - icon buttons (44 round, 1.5 px dashed `#A9B8AC` border, `chalkText` icon) on the right;
   - the title (Fraunces 700, 34);
   - an optional mono subtitle in `chalkMuted`;
   - optional slots below the subtitle (banner, chips).

  Detail screens (back = true) use a plain kraft page instead: a round 44 back button (paper fill, `line` border) on the left, an optional stamp on the right, then the mono meta line and the Fraunces 30 title. The page background is always `kraft`. Pull-to-refresh, the max width and keyboard avoiding stay as they are.
2. **`Button`** variants (same props as today, plus a `variant` prop):
   - `primary`: carrot fill with ink text, tag shape, height 50;
   - `secondary`: chalk fill with chalkText, fully round;
   - `outline`: paper fill with a 1.5 `lineStrong` border;
   - `danger`: beet fill with white text.

  All are at least 48 tall. Disabled is 40% opacity; pressed is 70% opacity.
3. **`Chip`**: height 36, radius 8. Selected: `chalkText` fill with `chalk` text (600). Unselected: 1.5 px border in `chalkLine` (on chalk) or `line` (on kraft), with `chalkText` or `ink` text. Chips sit in a row that scrolls sideways. Use `accessibilityRole="button"` with `accessibilityState.selected`.
4. **`Stamp`**: 2 px *dashed* border, radius 6, UPPERCASE Work Sans 700 12 with 0.6 letter-spacing, rotated 3–4°. It's beet for urgent deadlines (under 24 h) and "Cancelled". It's chalk for everything else ("Tomorrow", "Thu", "Draft", "Done").
5. **`PriceTag`** (tag shape, `tag` fill, mono 11) and **`SpotsTag`** (tag shape, `herb` fill, white Work Sans 700 13: "6 of 8 spots").
6. **`ShareBar`** (replaces `ProgressBar` visually): an 8 px track in `track`. Other members' claimed share is shown in `herbSoft`, and *yours* in `herb` after it. The accessible label says both numbers, for example "18 of 30 rolls claimed by others, 6 by you".
7. **`QuantityStepper`** (restyle; keep its props):
   - −: 40 round, paper fill, 1.5 `lineStrong` border;
   - count: Fraunces 700 19;
   - +: 40 round, `chalk` fill, `chalkText` icon.

  Add `hitSlop` so each control reaches 44.
8. **`StatusTrack`** replaces `StepTracker` for showing status. It is **display only, not tabs and not pressable**:
   - four equal columns, Open · Locked · Shopping · Ready, each a 6 px rounded bar with a label underneath (Work Sans 13);
   - bars up to and including the current step are `herb`, the rest are `line`;
   - the current label is 700 `herbText`, the others are 500 `muted`.

  Status mapping: `open` → step 1, `locked` → 2, `shopping` → 3, `ready` → 4. `completed` fills all four and shows the label "Done". `draft` shows a chalk "Draft" stamp instead of the track. `cancelled` shows a beet "Cancelled" stamp instead.

  Give the container `accessibilityLabel="Group status: Shopping, step 3 of 4"` and no role.

  The organizer can still look back at earlier steps: put a small text link under the track ("See collecting summary") instead of making the track clickable.
9. **`ReceiptCard`** (replaces `OrderRow`): a paper card with a top radius of 10, a 1 px `line` border, and a zigzag bottom edge. Top to bottom:
   - a deadline `Stamp` in the top-right corner (beet if under 24 h; otherwise chalk with a day name);
   - a mono meta line: `STORE · ORGANIZER FIRST NAME + INITIAL` (add `· QUICK SPLIT` or `· PRIVATE` when relevant);
   - the Fraunces 22 group name, with right padding so it never runs under the stamp;
   - **receipt lines**, at most 4: `ItemIcon` 26, the item name, a dotted leader, then the price per share (mono, for example `$0.83/roll`). If there are more items, add a mono `+N MORE` line;
   - a dashed top border (1.5 `line`), then the footer: `SpotsTag` on the left, and a pin icon with "SUB · Fri 5 pm" on the right.

  For quick splits (one item), use a compact layout instead: `ItemIcon` 52, the mono meta line, the title, a `ShareBar`, and a mono `12/20 KG · $1.90/KG`.

  In **My groups**, the card adds a role tag ("Joined" or "Organizing") and shows the status label instead of the deadline. The whole card is one pressable with the label `Open {name}`, as today.
10. **`ReceiptPanel`**: the sticky footer on the claim screen. It's inset 12 px from the sides, has a zigzag top edge in `chalk`, a `chalk` body and padding 14/18/20. Top to bottom:
   - the mono header `YOUR RECEIPT · 2 ITEMS` in `chalkMuted`;
   - one line per claimed item: a 22 px `chalkTile` with a `chalkTileIcon` glyph, the mono label `Paper towels ×6`, a `chalkLeader` dotted leader, and the mono cost;
   - when nothing is claimed, the empty line "Tap + on an item to add it.";
   - a dashed divider, then the mono label `EST. TOTAL · PAY {ORGANIZER FIRST NAME}` above the Fraunces 700 28 total, with the primary button (for example "Save shares") on the right.

  The panel updates live as the steppers change. Pad the scroll content so the last item is never hidden behind it.
11. **`BagReadyBanner`**: a carrot tag-shaped row with a `chalk` dot, the bold text "Your bag is ready · Fri 5 pm", and the mono `CODE 1234 5678` on the right. It goes to that order's pickup section.
12. **`PickupTicket`** (restyles `PickupDetails`, keeping its logic): a paper card with zigzag top and bottom edges, containing:
   - the mono label "SHOW THIS CODE TO {ORGANIZER}" and the collection code in DM Mono 500 at about 40 px, grouped in fours as today, and still `selectable`;
   - a dashed divider, then two rows, each with an icon tile and a text pair: place + "By the info desk"-style detail if available, and the time window with a relative time ("In 2 days");
   - a dashed divider, then "In your bag" as receipt lines and the estimated total;
   - below the ticket, the existing actions: "I'm at the pickup place" (primary) and Directions (outline).

  Keep the collected and nothing-to-collect states.
13. **`TabBar`** (in `(tabs)/_layout.tsx` via `tabBar` or `screenOptions`): `paper` background, 1 px `line` top border, height 64 + bottom inset. Five slots:
   - **Discover**, **My groups**, a raised centre **Start** button, **Updates** and **Profile**;
   - Start is a 52 round `chalk` button with a `chalkText` plus and a 4 px `kraft` ring, raised 18 px, with `accessibilityLabel="Start something new"`;
   - active tab: beet, 700; inactive: `muted`, 500; labels 11.
14. **Inputs** (`Field`, `CurrencyField`, `Select`, `DateTimeField`, `Choice`, `Check`): `paper` fill, 1.5 `line` border, radius 10, minimum height 48; the border turns `chalk` on focus. Labels are Work Sans 600 14. Errors use `beet` text with an alert role.
15. **`Collapsible`**: a paper card, radius 12, 1 px `line` border. Its title is Fraunces 600 italic 18 and its summary is mono 12 `muted`. The behaviour doesn't change.
16. **Empty, loading and error states:** a paper card containing an `ItemIcon`-style tile with an Ionicon, a Fraunces 18 line and a muted sentence. Use a herb `ActivityIndicator`.

## 6. Screens

### 6.1 Navigation and information architecture

- **The tabs become Discover · My groups · [+ Start] · Updates · Profile.** Updates and Profile move out of the header icons into the tab bar. The header keeps a search button only if search exists; it doesn't today, so leave it out.
  - Discover = `community.tsx` (keep the file; the title is now "Discover").
  - My groups = a new screen that **merges `my-orders.tsx` and `organize.tsx`** (put it in `my-orders.tsx` and change the tab title). It has chips for **Upcoming · Organizing · Past**. Upcoming = joined and organized groups that aren't completed or cancelled, sorted by next pickup, with drafts first under Organizing. Each card gets a "Joined" or "Organizing" tag. Turn `organize.tsx` into a `<Redirect>` to My groups with the Organizing chip selected (use a search param).
  - **Start (+)** opens a bottom sheet (a modal on web) with four large rows, each with an icon tile and a one-line explanation:
    - Organize a group order → `create`
    - Start a quick split → `create?quick=true`
    - Join with a private invite → `invite`
    - Suggest a product → `requests`

    This replaces the "More" button block at the bottom of Community.
  - Updates = `updates.tsx`; Profile = `account.tsx`. Both become visible tabs.
- **Titles say where you are.** Replace the slogan titles: "Find your group." → **Discover**; "Your shares, together." → **My groups**; "You're up to date." → **Updates**; "A familiar face." → **Profile**; "A small shop, shared." → **Start a group** (or **Edit draft**); "Join a private group." → **Join with invite**; "What should we share?" → **Suggest a product**; "Choose what fits." → **Choose your shares**; "Confirm your shares." → **Check your receipt**. Group screens use the group name. Subtitles become mono meta lines.
- Back buttons keep today's logic (`router.canGoBack()` or replace to Discover).

### 6.2 Discover (`(tabs)/community.tsx`)

- ChalkHeader containing:
  - the title "Discover";
  - a mono subtitle `{WEEKDAY MON DD} · {N} GROUPS OPEN NEAR UVIC`;
  - a `BagReadyBanner` if any of the user's groups is `ready` and they haven't collected yet. Get this from `/orders?scope=mine` and the order view, or leave the banner out if that needs a new request per order. **Don't add an endpoint just for this**;
  - a chip row: **All · Closing soon · Quick splits · Costco · Walmart · Superstore · More filters**.
- "Closing soon" means a deadline within 24 h, filtered on the device. Quick splits = `kind === "quick"`. Store chips set the existing `store` query param. "More filters" opens a sheet with the existing pickup-place `Select` and pickup-day choices, and a "Clear filters" button.
- Below the header are the sections **"You're in"** and **"Open to join"**. Section headings are Fraunces italic 20. Every group is a `ReceiptCard`, and quick splits use the compact variant.
- The empty state keeps today's wording logic. The "your own N groups are in My groups" link stays as a small paper card.
- **Receipt lines on the card need per-item data.** `OrderSummary.preview` today is only the names joined by " · ". You may make **one additive change**: add an optional `previewItems?: { name: string; category: string; priceCents: number; sharesPerPack: number; unit: string | null }[]` (the first 4 available items) to `OrderSummary` in `packages/contracts`, and fill it in `apps/api/src/order-model.ts`. Keep `preview` as it is, and add or extend an API test. If you'd rather not touch the API, list the preview names as receipt lines with icons and leave the prices off.

### 6.3 Group screen (`order/[id].tsx`, `MemberView`, `OrganizerView`)

- Detail header, top to bottom: back button, a deadline `Stamp`, the mono meta line `STORE · ORGANIZER · PICKUP FRI 5–6 PM, PLACE`, the Fraunces title, then the `StatusTrack`.
- For organizers, the "Organize / My share" choice stays, restyled as two chips (not a segmented tab bar). Keep its explanation line.
- **Buyer, while shares are open:** the heading "Pick from the stall" (Fraunces italic 20), then one paper card per item showing:
  - `ItemIcon` 48, the item name, a `PriceTag` with the price per share, and the `QuantityStepper`;
  - a `ShareBar`;
  - a mono line `{remaining} {UNIT} LEFT · {pack label}`.

  The sticky `ReceiptPanel` at the bottom replaces the "Your shares" and "Change your shares" collapsibles, and its button saves (the same API call as `ShareChooser`). The "full group", "closed" and "locked" messages become paper notes above the list. "Want something else?" (group requests) and "About this group" stay as collapsibles under the items.
- **Buyer, after shares close:** show the items as receipt lines on a paper card, then the `PickupTicket` once the status is `shopping` or `ready`.
- **Organizer:** `StatusTrack` (display only), then the current step's content in restyled collapsibles, with the next action as a full-width primary button at the bottom. Confirmation notes stay. Shopping list rows become receipt lines with icons and a check. Hand-out rows show a member's photo or initials, their receipt lines and the collected state. "More options" stays a collapsible with outline and danger buttons.

### 6.4 Claim (`claim/[id].tsx`)

Use the same item cards, steppers and `ReceiptPanel` as 6.3. The review step ("Check your receipt") shows the full receipt on a paper card with a zigzag edge, plus the confirm button (primary) and Back (outline).

### 6.5 Start a group (`create.tsx`) and `ItemEditor`

Keep the sections (The group · When · Where · Items), each as a Fraunces italic heading over a paper card. Each item in the editor shows its `ItemIcon` and name in its collapsible header. Catalog picks show their icon too. The sticky footer is a primary "Save draft" button.

### 6.6 My groups, Updates, Profile, Invite, Requests

- **My groups:** chips, then `ReceiptCard`s with role tags and status stamps. Empty states point to Discover or to Start.
- **Updates:** a paper list. Each row has a 40 icon tile (beet for alerts, herb for ready, chalk for info), a Work Sans 600 title, a body line and a mono timestamp. Tapping a row behaves as it does today.
- **Profile:** a chalk header with the photo or initials in a 72 circle, the name in Fraunces and the email in mono. Below that, paper cards for photo actions, account details and Sign out (outline danger).
- **Invite and Requests:** paper cards and restyled fields. Request cards show votes in a tag-shaped pill and a "Count me in" secondary button.

### 6.7 Welcome, sign-in and OTP (`index.tsx`, `EmailVerification.tsx`)

- **Welcome:** a full `chalk` top half with the wordmark, "Good things, shared." in Fraunces 40, and a one-line lead in `chalkMuted`. The kraft bottom half has the three steps as rows, each with a 48 item-style icon tile (people, pie chart, bag), plus the invite note when someone was invited. Then come **Get started** (primary) and **I already have an account** (outline).
- **Sign-in / sign-up:** the same chalk header and a paper form card. The password toggle stays.
- **OTP:** six large DM Mono boxes on paper (keep today's input logic), the resend timer in mono, and errors in beet.

## 7. Copy

Write short, plain words in sentence case. Mono lines are UPPERCASE. Show money with the existing `money()` helper. Show plurals with the contracts `plural()` helper. Show dates with the existing `when()` helper, or a new mono formatter in `theme.ts`. Every price stays labelled as an estimate somewhere on the screen ("EST. TOTAL").

## 8. Phases

Build in this order. After each phase, run the checks in section 9 and fix whatever fails before you move on.

1. **Foundation:** dependencies, `theme.ts`, font loading, `ItemIcon` with a validated glyph map, the zigzag and dotted-leader primitives, and the restyled `Button`, `Field`, `Chip`, `Stamp`, tags, `ShareBar`, `QuantityStepper`, `StatusTrack` and `Collapsible`.
2. **Navigation:** the new tab bar, the Start sheet, the merged My groups screen, the `organize` redirect, and the new titles.
3. **Discover and the cards:** `ReceiptCard` (and the optional `previewItems` change from 6.2).
4. **Group and claim screens:** buyer item cards, `ReceiptPanel`, `PickupTicket`, and the restyled organizer steps.
5. **Everything else:** create / ItemEditor, Updates, Profile, Invite, Requests, Welcome / auth / OTP, and the empty and error states.
6. **Clean-up:** remove dead styles and the old `C` tokens once nothing uses them. Then update the README sentence about the "neutral three-tab design" and the UI paragraph in `Documentation/implementation/SETUP.md` to describe the new navigation.

## 9. Checking your work

- `npm run typecheck`, `npm run lint` and `npm test` all pass.
- Run the app (`npm run dev`), sign in as **Maya** and walk through every screen at a **390×844** viewport on web. Use Playwright or the browser tool if you have one, take a screenshot of each screen, and fix anything clipped, overlapping or unreadable. The screens to check:
  - Welcome, sign-in, OTP;
  - Discover (with and without filters), Start sheet;
  - a group as a buyer (shares open, then closed);
  - the claim review;
  - a group as the organizer (draft, collecting, shopping, hand-out);
  - the pickup ticket;
  - My groups (all three chips), Updates, Profile, Invite, Requests.
- Check the claim flow from start to finish: + and − update the share bar and the receipt total, Save calls the same endpoint as before, and the saved shares show after a refresh.
- Check that a push or invite link to `/(tabs)/order/<id>` still opens the group, and that `/(tabs)/organize` lands on My groups → Organizing.
- Check contrast on any colour pair you add that isn't listed in section 4.1.

## 10. Done when

- [ ] Every screen in section 6 uses the Market Receipt design system from `theme.ts`, and no screen still uses the old navy palette or slogan titles.
- [ ] The tab bar is Discover · My groups · Start · Updates · Profile, and the Start sheet reaches create, quick split, invite and requests.
- [ ] Group cards and claim screens show item icons, receipt lines, the share bar, and the live `ReceiptPanel` with a zigzag edge.
- [ ] The status is a display-only `StatusTrack` everywhere: nothing about it looks or acts like tabs.
- [ ] All existing flows still work. Typecheck, lint and tests pass.
- [ ] The documentation sentences in phase 6 are updated.
- [ ] You've posted a short summary that lists the files changed, the dependencies added, any change to `contracts` or the API, the screenshots, and anything you couldn't check.
