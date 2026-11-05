# Working MVP (October 29, 2026)

The Expo / React Native app, Node API and MySQL implementation are now in this repository. Start with [setup instructions](Documentation/implementation/SETUP.md), [API documentation](Documentation/implementation/API.md), and [verification evidence](Documentation/implementation/VERIFICATION.md). The implementation follows phases A–E of [the MVP plan](Documentation/implementation/MVP_PLAN.md), uses the Market Receipt design with Discover / My groups / Start / Updates / Profile navigation, and excludes all payment-related features.

Local preview: `npm run dev` after setup.

**App redesign (layan/app-redesign):**

- **Buying and organizing are separate sides.** Each has its own home, tabs and colour: butter yellow for buying, sage green for organizing. Switch between them at the top of any home screen.
- **First-time intro.** Four swipeable intro screens appear the first time the app opens. They can be skipped and can be shown again from Profile.
- **Demo on phones.** Run `npm run phone`. It builds the web app and prints a Wi-Fi link plus a public `trycloudflare.com` link that any phone can open. Phones can add it to the home screen to use it like an app.
- **Sign-in fixes.** Sign-in limits now count per person, so a class on one Wi-Fi isn't locked out. There is also a "Forgot password?" option that emails a six-digit code.
- **Test payments only.** Buyers pay their share after the organizer finishes shopping, and nobody is charged. Leave `STRIPE_SECRET_KEY` blank to use the built-in test screen, or set a Stripe `sk_test_` key to use real Stripe test checkout. Live keys are refused.

Live app: **[poold.onrender.com](https://poold.onrender.com)**. Hosted on [Render Free + Aiven MySQL Free](Documentation/implementation/HOSTING.md), with Brevo verification email configured. Free hosting sleeps when idle; the first request can take about a minute.

---

# POOLD - Your Shares, Shared

Check out our [product page](https://pooldtest.vercel.app/)!
