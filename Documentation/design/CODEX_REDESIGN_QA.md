# Market Receipt redesign handoff

Implemented all six phases of [the plan](CODEX_REDESIGN_PLAN.md), in order. The shared system and every application screen now use the Market Receipt theme. No deployment was performed.

## Product scope correction (November 4, 2026)

Following the user's review, Start now offers only organizing a group order and joining with a private invite. Quick-split creation/filtering and standalone product suggestions were removed. New drafts use the standard group kind even when opened through an old `create?quick=true` link. Suggestions are submitted from the group page to `/orders/{id}/requests`; old standalone request links redirect to My groups. Initial screenshots and checks below describe the prior brief and are historical where they mention quick splits or four Start destinations.

Correction verification: typecheck, lint, all 20 API tests, and a browser check passed. The browser confirmed that the two Start choices render correctly, old quick-create links save standard groups, standalone requests redirect, and a submitted suggestion persists with the correct group `orderId`. See [current Start](evidence/44-start-group-options.png), [group suggestion](evidence/45-group-product-suggestion.png), [standard draft](evidence/46-standard-group-draft.png), and [verification results](evidence/scope-correction-results.json).

## Local preview loading fix (November 4, 2026)

The development database had migrations 001–003 only. The preview query required the nullable `unit` column added by the existing migration 004, so both order-list requests returned HTTP 500 (`Unknown column 'unit'`). Earlier fixture tests used the migrated test database and missed this local setup mismatch. Ran `npm run db:migrate` against the loopback `poold_dev` database; it applied the existing migration 004 without resetting orders.

My groups now combines the two resource states into one error/retry area, retries both requests together, and only shows empty-state guidance and numeric chip counts after both lists load successfully. Browser checks against the actual port-4000 API confirmed successful loading of existing groups. Forced failures of both lists and either list individually confirmed one error, no misleading empty state or zero counts, and successful retry recovery. Typecheck, lint and all 20 API tests pass.

Evidence: [local groups restored](evidence/47-local-my-groups-restored.png), [single error state](evidence/48-single-load-error.png), [browser results](evidence/local-groups-results.json).

## Preview and evidence

- Run `npm run dev` and open [the local preview](http://localhost:8081). The development API is on port 4000. The preview was left running at handoff.
- Open [the screenshot gallery](evidence/index.html) or browse [the evidence folder](evidence/). Most images are 390×844; the wide-screen image is 1280×900.
- Browser verification used Maya and freshly created fixtures on `poold_test`, through separate local API instances. Browser requests were forwarded to those real APIs; responses were not mocked. No development orders were changed. Temporary fixture orders and test accounts were removed afterward.
- Detailed assertions: [browser flows](evidence/browser-results.json), [organizer lifecycle](evidence/organizer-results.json), [auth/OTP](evidence/auth-results.json), [keyboard/touch/large text](evidence/accessibility-results.json), [additional states](evidence/state-results.json).

## What changed

| Area | Files and behavior |
|---|---|
| Shared design system | `apps/mobile/src/theme.ts`; `components/ui.tsx`, `Sections.tsx`, `ItemIcon.tsx`, `Market.tsx`, `Receipt.tsx`, `Sheet.tsx`, `StartSheet.tsx`; root font loading in `app/_layout.tsx` |
| Navigation | `app/(tabs)/_layout.tsx`, new `start.tsx`, `my-orders.tsx`, `organize.tsx`; Discover / My groups / Start / Updates / Profile, four Start destinations, deduplicated joined/organized groups, legacy organize redirect |
| Discovery | `community.tsx`, `OrderRow.tsx`; horizontal filter chips, reusable filter sheet, compact quick splits, item previews, receipt cards, real member counts and pickup metadata |
| Orders and claims | `order/[id].tsx`, `claim/[id].tsx`, `MemberView.tsx`, `OrganizerView.tsx`; display-only status, explicit summary links, shared item cards, fixed live receipt, preserved rounding/attendance/release/error behavior, selectable pickup ticket and handoff actions |
| Remaining screens | `create.tsx`, `ItemEditor.tsx`, `Pickers.tsx`, `updates.tsx`, `account.tsx`, `invite.tsx`, `requests.tsx`, `RequestList.tsx`, `app/index.tsx`, `EmailVerification.tsx`; paper forms, sticky draft save, catalog icons, profile photo/initials, notification tiles, vote tags, chalk auth headers and six OTP boxes backed by one input |
| API and contracts | `packages/contracts/src/index.ts`, `apps/api/src/order-model.ts`, `apps/api/test/organize.test.ts`; optional additive preview field and regression coverage |
| Setup | `apps/mobile/package.json`, `package-lock.json`, `app.config.ts`, `README.md`, `Documentation/implementation/SETUP.md`; fonts/SVG setup and navigation descriptions |

Only the five permitted dependencies were added with `expo install`: `expo-font` (~58.0.11), `@expo-google-fonts/fraunces` (^0.4.1), `@expo-google-fonts/work-sans` (^0.4.2), `@expo-google-fonts/dm-mono` (^0.4.2), and `react-native-svg` (15.16.0). Fonts import only the required weight assets. The dynamic Expo config includes the `expo-font` plugin.

The sole API change is optional `OrderSummary.previewItems?: { name: string; category: string; priceCents: number; sharesPerPack: number; unit: string | null }[]`. The server returns the first four available items, ordered by name then ID. Legacy `preview` is unchanged. There are no new endpoints or migrations, and mutation payloads are unchanged. Card prices are estimates per share because summary data cannot establish physical-unit prices accurately. Item capacity bars use full detail responses. The optional Discover pickup banner is omitted as planned.

## Verification

- Each implementation phase passed root typecheck, lint, and the API suite before the next phase. Phases 1–2: 19 tests. Phases 3–6: 20 tests, including the new preview ordering/limit/unavailable/legacy regression.
- Final `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`: passed. Build includes contracts/API compilation and Expo web, iOS, and Android bundle exports.
- Browser: inline claim save and refresh (including 1001-cent pack / 5-share rounding to 200 cents), release-all, dedicated review/confirm, eight-item receipt scrolling, all three My groups filters, all four Start destinations, legacy organize/order links, private invite continuation, requests/votes, pickup arrival, sign-out, and offline retry.
- Organizer browser sequence: create and edit a quick-split draft using sticky Save; publish; confirm closing shares; confirm shopping; check bought items; confirm ready; submit the actual collection code; confirm completion. Existing API tests additionally cover concurrency, shortfall decisions, price/stock changes, collection replay, repeat orders, security, and jobs.
- Auth browser sequence: registration, password visibility, six visual OTP boxes with the original single autofill input, local code delivery, cooldown, verification and continuation to the invited private order. No external email was sent.
- Accessibility/layout: keyboard focus remains in sheets and returns to the trigger; Escape dismisses; button bounds are at least 44px, including calendar dates and controls around 40px stepper circles; chips expose selection on native and web; status tracks have labels and no interaction roles. A 130% text simulation on a long-title share screen showed no page overflow. Wide content remains capped at 640px.
- Normal browser flows reported no page or console errors. The offline test intentionally aborted the list request, then verified recovery with Retry.

## Design QA findings resolved

- Removed a web-only SVG `accessible` attribute warning that had produced an Expo error overlay.
- Made item category chips horizontal so long group titles leave room for item cards.
- Corrected sheet Escape behavior during opening transitions and labelled each Start destination explicitly.
- Kept 12px zigzag teeth at different widths; bounded the receipt item list; removed nested pickup containers and moved pickup actions below the ticket.
- Isolated create/edit form state by route parameters and waited for draft data before showing editable fields, preserving quick-split defaults when revisiting the hidden create route.
- Kept the specified palette and added two contrast tokens: white spots-tag text gives 4.75:1 on herb; near-ink `actionInk` (#203126) gives 4.57:1 on carrot. The specified ink/carrot pair measured 4.46:1, just below the required 4.5:1. Body text retains the specified ink token.

## Verification gaps

- Native bundles export, but no physical iOS/Android device, native keyboard, screen reader, native OTP autofill, photo picker, or live push delivery was tested. Browser text scaling is not a substitute for native Dynamic Type testing.
- The reference screenshot mentioned in the planning document is not present in this checkout or the current chat. Discover and open-share screens were reviewed against the written palette, typography, shapes, layout and data requirements; a direct image-to-image comparison could not be performed.
- External map navigation and real email delivery were not exercised; their existing actions and configuration are preserved. No production data, environment files, hosting configuration, or payment behavior changed.
