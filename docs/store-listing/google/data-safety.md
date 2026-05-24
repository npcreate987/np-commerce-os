# Google Play — Data Safety Form

Required since 2022 — every app must declare what data it collects.
Reject if mismatched with actual code. This doc is the source-of-truth
that **must match** the Privacy Manifest (`PrivacyInfo.xcprivacy`) and
Privacy Policy (`docs/legal/privacy-policy.md` / `/legal/privacy`).

## Data Encryption

- **Is the data encrypted in transit?**: ✅ Yes (TLS 1.3)
- **Can users request that their data be deleted?**: ✅ Yes
  - In-app path: `/profile/privacy → "ลบบัญชี"` (30-day grace)
  - Backend: `DELETE /v1/me/account` (Phase 17)

## Personal Info

| Data Type | Collected | Shared | Required | Purpose | Optional? |
|---|---|---|---|---|---|
| Name | ✅ | ❌ | Required | App functionality | No |
| Email address | ✅ | ❌ | Required | App functionality, Account management, Authentication | No |
| Phone number | ✅ | ❌ | Required | App functionality, Account management | No |
| User IDs | ✅ | ❌ | Required | App functionality, Analytics | No |
| Address | ✅ | ⚠️ Shared with shipping carrier (per-order) | Optional | App functionality (delivery) | Yes |

## Financial Info

| Data Type | Collected | Shared | Purpose |
|---|---|---|---|
| Purchase history | ✅ | ❌ | App functionality, Account management |
| Other financial info | ❌ | — | — (no credit card stored on our side — Omise tokenises) |

## Location

| Data Type | Collected | Shared | Required | Purpose |
|---|---|---|---|---|
| Approximate location | ✅ | ❌ | Optional | App functionality (nearby shops) |
| Precise location | ✅ | ❌ | Optional | App functionality (delivery) |

## Photos and Videos

| Data Type | Collected | Shared | Purpose |
|---|---|---|---|
| Photos | ✅ | ❌ | App functionality (user content + reviews) |
| Videos | ✅ | ❌ | App functionality (feed posts) |

## Files and Docs

❌ Not collected

## Audio

| Data Type | Collected | Shared | Purpose |
|---|---|---|---|
| Voice or sound recordings | ✅ (only during video recording) | ❌ | App functionality |

## App Activity

| Data Type | Collected | Shared | Purpose |
|---|---|---|---|
| App interactions | ✅ | ❌ | App functionality, Analytics |
| In-app search history | ✅ | ❌ | App functionality, Analytics, Personalization |
| Installed apps | ❌ | — | — |
| Other user-generated content | ✅ | ❌ | App functionality |
| Other actions | ✅ | ❌ | App functionality, Analytics |

## App Info and Performance

| Data Type | Collected | Shared | Purpose |
|---|---|---|---|
| Crash logs | ✅ | ⚠️ Sentry (data processor under contract) | App functionality, Analytics |
| Diagnostics | ✅ | ⚠️ Sentry | App functionality, Analytics |
| Other app performance data | ✅ | ❌ | Analytics |

## Device or other IDs

| Data Type | Collected | Shared | Purpose |
|---|---|---|---|
| Device or other IDs | ✅ (FCM token only) | ❌ | App functionality (push notifications) |

## Security Practices

- ✅ Data is encrypted in transit (TLS 1.3)
- ✅ You can request that data be deleted
- ✅ Committed to Play Families Policy (for users under 18 we still
      require parental consent per Thailand PDPA)
- ✅ Independent security review (Phase 18 plan — link audit report
      here when done)
