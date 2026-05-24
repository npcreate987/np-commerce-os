# Apple Review Information

กรอกใน App Store Connect → App Store → App Review Information ก่อนกด
Submit for Review

## Contact Information

- **First Name**: NP
- **Last Name**: Compliance Team
- **Phone Number**: +66-2-XXX-XXXX
- **Email Address**: `compliance@np.app`

## Demo Account

- **Username**: `reviewer@np.app`
- **Password**: `NPReview2026!` (override via env `REVIEWER_PASSWORD`)

> Reviewer account is provisioned automatically via the seed script
> `pnpm --filter api seed:reviewer` — see `docs/phase-17-store-compliance.md`
> for how we keep it in sync.

## Sign-In Required

✅ Yes

## Demo Account Capabilities

```
- Browse the video feed without logging in
- After login (with above credentials):
  • Cart is pre-seeded with 1 product to test checkout
  • Profile → Privacy lets you test account deletion (30-day grace)
  • Profile → Notifications shows native push registration toggle
  • All payments are in TEST mode — no real charge
```

## Notes for Reviewer (4000 char max)

```
NP Commerce is a Thailand-focused marketplace combining a TikTok-style
video feed, traditional product listings, and food/cafe local delivery.

Key flows to test:

1. SIGN-IN (Email + Password — no Sign in with Apple yet because we
   serve a single-region Thai market with PDPA compliance via email/OTP):
   - Use the demo account above

2. ACCOUNT DELETION (Google + Apple required path):
   - Profile → Privacy → "ลบบัญชี" (Delete Account)
   - 30-day grace period; reversible from the same screen during grace.
     This satisfies the "in-app, ≤2 taps from settings" requirement.

3. PURCHASE TEST FLOW (sandbox payments only):
   - Cart is pre-seeded with one item. Go to /cart → Checkout.
   - Choose any payment method — Omise is in test mode.
   - No real money is charged.

4. APP TRACKING TRANSPARENCY:
   - On first launch we show a pre-prompt sheet explaining what we
     collect. Either choice respects the user — opting out simply
     disables the recommendation personalization (see /profile/privacy
     toggle).

5. PUSH NOTIFICATIONS:
   - We use APNs only after the user grants permission.
   - Test by going to /profile/notifications → "เปิดการแจ้งเตือน"

PHYSICAL GOODS ONLY:
   This app does not sell digital content or subscriptions, so it does
   not implement Apple In-App Purchase. All transactions are for
   physical goods or local services (food delivery, restaurant pickup)
   and fall under "marketplace" rules where third-party payment is
   permitted (App Store Review Guidelines 3.1.1 / 3.1.5).

PRIVACY MANIFEST:
   PrivacyInfo.xcprivacy is included in the bundle. Required-reason API
   declarations match plugin usage (Capacitor Preferences for UserDefaults,
   etc.). See docs/phase-17-store-compliance.md.

CONTACT:
   For any questions during review, email compliance@np.app — we
   monitor 24/7 during submission window.
```

## Attachment

- (none) — no special build configuration needed; archive normally.
