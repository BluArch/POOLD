# Working MVP (October 29, 2026)

The Expo / React Native app, Node API and MySQL implementation are now in this repository. Start with [setup instructions](Documentation/implementation/SETUP.md), [API documentation](Documentation/implementation/API.md), and [verification evidence](Documentation/implementation/VERIFICATION.md). The implementation follows phases A–E of [the MVP plan](Documentation/implementation/MVP_PLAN.md), uses the Market Receipt design with Discover / My groups / Start / Updates / Profile navigation, and excludes all payment-related features.

Local preview: `npm run dev` after setup.

**Branch catalogue:** Organizers can select Costco, Real Canadian Wholesale Club, Bulk Barn, or Walmart and a Greater Victoria branch, then search its loaded products. For local demo items, run `npm run db:migrate` followed by `npm run catalogue:seed-demo -w @poold/api`. The seed creates 248 synthetic products and 520 branch offers, with illustrative prices and unverified stock; it refuses production or remote databases. Fresh deployments need an explicit authorized import before branch products appear. Existing groups without a branch retain the original 24-item picker, and manual entry remains available. See [catalogue setup and import instructions](Documentation/implementation/CATALOGUE.md).

**App redesign (layan/app-redesign):**

- **Buying and organizing are separate sides.** Each has its own home, tabs and colour: butter yellow for buying, sage green for organizing. Switch between them at the top of any home screen.
- **First-time intro.** Four swipeable intro screens appear the first time the app opens. They can be skipped and can be shown again from Profile.
- **Demo on phones.** Run `npm run phone`. It builds the web app and prints a Wi-Fi link plus a public `trycloudflare.com` link that any phone can open. Phones can add it to the home screen to use it like an app.
- **Sign-in fixes.** Sign-in limits now count per person, so a class on one Wi-Fi isn't locked out. There is also a "Forgot password?" option that emails a six-digit code.
- **Test payments only.** Buyers save a test card when they join, and nothing is charged while the group is open. When shares close, each buyer's card gets a hold for their shares plus a 5% service fee. A declined card has 2 hours to be updated, and "Start shopping" stays locked until every card is sorted. Starting shopping charges the holds and pays the organizer the Costco cost of buyers' shares. Store price differences are refunded, or charged to the saved card. Organizers pay for their own share at the store.
- **Organizer rules.** Organizers must take at least one share themselves, and can close shares even if nobody else joined. A group with no other buyers at the deadline is cancelled automatically.
- **Money model.** Buyers pay Costco's price + 15% markup, plus a 5% service fee on that total (it covers card processing). After hand-out the organizer earns $30, or 10% of buyers' groceries if that's more. POOLD breaks even at about $205 of groceries.
- **One-account demo.** In a group run by the demo account (Maya), "Add sample buyers" has Jordan, Alex and Priya fill the packs, and their pickup codes appear on the hand-out screen, so one person can show a whole run.
- **UVic only.** Accounts need an @uvic.ca email. The local demo accounts are the only exception.
- **No-shows and ratings.** A buyer who misses pickup has 24 hours to collect their bag. After that the organizer keeps the bag and the payment, and the buyer gets a no-show mark. If an organizer never gets to pickup, the group is cancelled and every buyer gets a full refund. Buyers rate organizers after pickup. The full rules are in the app under Profile → Payments, refunds and no-shows.

Live app: **[poold.onrender.com](https://poold.onrender.com)**. Hosted on [Render Free + Aiven MySQL Free](Documentation/implementation/HOSTING.md), with Brevo verification email configured. Free hosting sleeps when idle; the first request can take about a minute.

---

# POOLD - Your Shares, Shared

Check out our [product page](https://pooldtest.vercel.app/)!
