# POOLD “Market Receipt” redesign plan

Source brief: [CODEX_REDESIGN_PROMPT.md](CODEX_REDESIGN_PROMPT.md) and the screenshot supplied in the planning chat on November 4, 2026.

Status: all six implementation phases complete. Typecheck, lint, and the API suite passed after every phase; final web, iOS, and Android bundle exports pass. Browser screenshots and end-to-end evidence, with explicit verification gaps, are in [CODEX_REDESIGN_QA.md](CODEX_REDESIGN_QA.md).

| Phase | Implementation | Verification |
|---|---|---|
| 1 | Theme, fonts, receipt primitives, shared controls, header/footer slots | Typecheck, lint, 19 API tests passed |
| 2 | Five navigation slots, Start sheet, merged My groups, organize redirect | Typecheck, lint, 19 API tests passed |
| 3 | Discover chips/sheet, receipt cards, additive item previews | Typecheck, lint, 20 API tests passed |
| 4 | Shared share cards/receipts, pickup ticket, organizer summary links | Typecheck, lint, 20 API tests passed |
| 5 | Auth/OTP, drafts, Updates/Profile, invites and requests | Typecheck, lint, 20 API tests passed |
| 6 | Token cleanup, navigation docs, screenshots and handoff report | Typecheck, lint, 20 API tests, all-platform build and browser flows passed; gaps documented |

## Product scope correction (November 4, 2026)

The user's implementation review supersedes the original quick-split and standalone suggestion requirements below. Start offers only **Organize a group order** and **Join with a private invite**. Quick-split creation and filtering are removed. Product suggestions belong inside an open group order; the old standalone requests route redirects to My groups. Older phase descriptions below document the initial brief.

## Summary

Restyle the existing Expo app to match the attached screenshot and redesign brief, preserving all current features, validation, API mutations, sessions, and deep links.

## Implementation phases

### 1. Foundation

- Add only the five permitted dependencies through `expo install`.
- Centralize the specified palette, category colours, typography, spacing, and shapes in `apps/mobile/src/theme.ts`; load Fraunces, Work Sans, and DM Mono at the root.
- Build item icons with validated glyph names, SVG receipt edges, dotted leaders, tags, stamps, share bars, and display-only status tracks.
- Restyle existing buttons, fields, pickers, steppers, collapsibles, and resource states while retaining their interfaces and logic.
- Extend `Screen` with header slots and a footer outside the main scroll area. Keep safe areas, keyboard avoidance, refresh, and the 640px content limit.

### 2. Navigation and My groups

- Replace the three-tab bar with **Discover · My groups · Start · Updates · Profile**.
- Make Start a raised action button opening a reusable native bottom sheet/web modal with the four specified destinations.
- Merge joined and organized orders using the existing `mine` and `organizing` requests, deduplicated by order ID.
- Define chips as: Upcoming = active joined/organized groups; Organizing = active organized groups plus drafts; Past = completed/cancelled groups of either role. Sort by pickup, with drafts first under Organizing.
- Preserve `organize` as a redirect to My groups with Organizing selected. Keep all other route paths.

### 3. Discover and receipt cards

- Replace the current group-type switch and filter collapsible with the specified header chips and filter sheet. All shows both group kinds; closing-soon and quick-split filters run locally, alongside existing store/place/day queries.
- Replace `OrderRow` visuals with receipt cards: real metadata, item icons, dotted receipt lines, stamps, spots, and pickup information. Preserve its existing imports and navigation behavior.
- Add the brief’s optional `OrderSummary.previewItems` field with exactly the specified shape, populated with the first four available items; retain `preview` and extend an API regression test.
- Use compact quick-split cards. Show prices per **share** where the response cannot establish a physical-unit price accurately.

### 4. Group, claim, organizer, and pickup

- Give group details the specified metadata, title, deadline stamp, and status track. Restyle Organize/My share as chips.
- Share item cards and receipt rendering between inline selection and the dedicated claim route. Keep their existing save/review behavior and endpoint payloads.
- Update share bars and receipt totals live using the existing rounding rules. Preserve attendance confirmation, release-all behavior, unavailable items, price-change notes, errors, and refresh actions.
- Keep the receipt footer above navigation, with a bounded scrolling item list when selections are numerous.
- Restyle pickup details as a ticket, retaining selectable code grouping, arrival actions, directions, and collected/empty states.
- Restyle organizer draft review, collecting, shopping, and hand-out tools. Replace clickable progress steps with explicit links to earlier summaries and back to the current work.

### 5. Remaining screens

- **Create/Edit draft:** paper sections, item-editor icons, catalog icons, and sticky Save draft action.
- **Updates/Profile:** chalk headers, paper content, notification tiles, and profile photo/initials; preserve all existing actions.
- **Invite/Requests:** paper forms, vote tags, and restyled request actions.
- **Welcome/Auth/OTP:** chalk introduction and headers, paper forms, and six visual OTP boxes backed by the existing single input logic. Preserve autofill, password visibility, timers, errors, and invite continuation.

### 6. Cleanup and handoff

- Remove obsolete styles and old colour tokens after migrating every consumer.
- Update the README and setup guide’s navigation descriptions.
- Deliver the local preview, screenshot evidence, changed-file/dependency summary, API-change summary, and explicit verification gaps.

## Verification

- After each phase, run typecheck, lint, and the existing test suite; fix failures before continuing.
- Extend API coverage for preview ordering, four-item limit, unavailable-item exclusion, and unchanged legacy preview behavior.
- Walk every screen/state listed in the brief at **390×844**, using Maya and local test fixtures where necessary.
- Verify claim changes through save and refresh; organizer transitions and confirmations; pickup, requests, private invites, sign-out, and legacy links.
- Check long titles, large text, many receipt items, keyboard interaction, sheet dismissal/focus, and wide-screen layout.
- Verify 44px touch areas—including hit areas around 36px chips—labels, contrast, and noninteractive status semantics.
- Export web and native bundles. Record any native-device testing that cannot be performed.
- Compare Discover and open-share screens against the attached reference, saving screenshots and a design QA report; resolve substantive layout and visual defects before completion.

## Defaults and boundaries

- The written brief governs behavior where the screenshot differs: Updates lives in the tab bar; no header bell.
- Default to the permitted additive preview API change. No new endpoints or database migrations.
- Omit the optional Discover pickup banner when its real code/collection state would require per-order requests.
- Summary responses lack item-capacity counts. Quick-split cards will retain the compact design and real member information; item-level share progress appears on detail/claim screens with full item data.
- Use real data throughout. Preserve estimates in CAD, existing security behavior, environment files, hosting configuration, and the supplied design document. No payment features or deployment.
