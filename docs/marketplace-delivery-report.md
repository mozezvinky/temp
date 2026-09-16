# COPIC marketplace delivery report

## 1. What changed

Extended the existing production application in place: responsive admin navigation and overview; service analytics; a bounded aggregate supply map; COPIC recruitment campaigns; attribution-preserving signup/return flows; independent Agent capability and referral dashboards; server-owned skill pricing progression; identity/licence/deadline enforcement; immutable commission accounting; source-specific acquisition funnels; offline/reconnect feedback. Existing fonts, components, navigation destinations, and COPIC theme remain the foundation.

Implementation is local. Nothing has been deployed, committed, migrated, paid, or sent to users.

## 2–3. Files created and modified

The complete file inventory appears at the end of this report. Main implementation groups:

- `app/admin`, `components/admin`: admin map, recruitment, agent administration, analytics, service pricing and responsive existing screens.
- `app/agent`, `app/recruit`, `app/join`, `components/profile`: referral dashboards and recruitment onboarding.
- `app/api/acquisition`, `app/api/agent`, new admin APIs and profile pricing API: validated, authenticated server operations.
- `functions/src/marketplace-*`: shared domain policy, maintained projections, durable funnel transitions, service completions and commission reconciliation.
- `lib/service-pricing.ts`, `lib/marketplace-server.ts`, `hooks/useOperationalData.ts`: server pricing and shared operational reads.
- Existing jobs, applications, hires, verification, auth/profile, security rules and themes were extended for compatibility.
- `scripts/backfill-marketplace.ts`, `tests/marketplace*.test.ts`, `tests/memory-firestore.ts`, and local synthetic UI fixtures support rollout and verification.

## 4. Firestore / schema changes

Additive collections; existing user, service, job and verification documents are preserved:

| Collection | Purpose / key |
| --- | --- |
| marketplaceMetrics | `overview`: maintained user/capability/skill counters and backfill marker |
| marketplaceServices | normalized service ID: name/category/supply/completion counters |
| marketplaceProjections | user ID: previous contribution for idempotent updates |
| marketplaceCells | coarse grid/resolution ID: anonymous cohort and service counts |
| recruitmentCampaigns | immutable initial service/rate/unit plus campaign status, schedule, source, location and spend |
| acquisitionVisits | opaque visitor ID, source and dedup flags; seven-day expiration |
| acquisitionRateLimits | daily hashed address key; expiration |
| acquisitionAttributions | user ID: immutable first eligible source |
| acquisitionEvents | user + stage: durable milestone deduplication |
| acquisitionFunnels | source type + source ID counters |
| agentLinks | stable agent/service referral links |
| agentReferrals | worker ID: immutable agent ownership and referral timestamp |
| agentMetrics | agent ID: funnel and commission balances |
| servicePricing | service ID: rate/unit, bounds and configurable 5/15 thresholds |
| workerServiceOrigins | worker + service: authoritative recruitment price provenance |
| workerServiceProgress | worker + service: eligible paid completed job count |
| serviceCompletions | job + worker: completion contribution and owning application |
| commissionLedger | job + worker: original immutable earned amount and configured rate |
| commissionStates | job + worker: current settlement/reversal state |
| commissionEvents | commission + transition: append-only accounting history |
| marketplaceConfig | `agents`: default commission rate, initially 0.01 when absent |

Existing documents gain optional `agentEnabled`; service recruitment/pricing metadata; job `workDate`, `applicationDeadline`, and canonical service ID; verification `expiryDate`; user `driverLicenseExpiryDate`. Development SQLite gains additive job date and licence expiry columns. New campaign/agent/projection systems use production Firestore, not the optional SQLite backend.

A legacy job without a deadline remains usable. Newly posted work requires a work date and application deadline. A legacy approved driving licence with no expiry must be resubmitted; it cannot authorize driving work. Identity profile approval is preserved if no verification record exists, while a newer explicit verification record wins.

## 5. Indexes and TTL

`firestore.indexes.json` includes paged equality/order indexes for `agentReferrals.agentId`, `commissionLedger.agentId`, `agentLinks.agentId`, `users.agentEnabled`, and `verifications.status`, followed by document ID. Existing indexes remain intact. TTL overrides expire `acquisitionVisits.expiresAt` and `acquisitionRateLimits.expiresAt`.

Deploy indexes before switching traffic to the new queries; wait for readiness. Index deployment and emulator verification were not run in this session.

## 6. Security rules

Client writes cannot change agent ownership, counters, progression, commission ledger, financial status, identity claims, verification outcomes, jobs or applications. New marketplace collections are accessed through scoped server APIs. User document reads are self/admin; public discovery uses a safe API projection. Self-updates use an explicit profile-field allowlist. Verification uploads remain server-owned, and private verification media is delivered to authorized admins through short-lived signed URLs. Deploy Firestore and Storage rules alongside the API release.

## 7. Environment variables

Reuse existing Firebase public configuration (`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`) and production server credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, plus the existing supported service-account configuration). Keep existing Storage/email settings.

`NEXT_PUBLIC_APP_URL` must be the canonical deployed origin. `NEXT_PUBLIC_MAPBOX_TOKEN` must permit that origin and the existing Mapbox map/geocoding APIs. No new third-party vendor is introduced.

Backfill only: `GOOGLE_CLOUD_PROJECT`, Application Default Credentials (for example a securely supplied `GOOGLE_APPLICATION_CREDENTIALS`), `COPIC_BACKFILL_PROJECT` for explicit write authorization, and optional `COPIC_BACKFILL_AFTER` resume cursor. Never commit credentials.

## 8. Migration / backfill steps

1. Use a staging project and export/backup existing production data before the production rollout. Keep existing release rollback available.
2. Deploy indexes, the new Functions exports, compatible API code, Firestore rules and Storage rules. Ensure only the intended release is processing these events.
3. Explicitly select the target project and provide ADC. Run a dry user scan first: `npm run marketplace:backfill`.
4. Set `COPIC_BACKFILL_PROJECT` equal to `GOOGLE_CLOUD_PROJECT`, then run `npm run marketplace:backfill -- --apply`. This reads users in pages of 100 and writes idempotent maintained contributions. It records completion only after finishing.
5. Run `npm run marketplace:backfill -- --completed-jobs` as a dry scan, then add `--apply` to reconcile eligible existing completions. Ambiguous legacy jobs receive no guessed service credit. Historical commissions require valid pre-job referral ownership and identity, so the backfill does not invent agent relationships.
6. Resume interrupted runs using the printed document cursor in `COPIC_BACKFILL_AFTER`. To restart validation from the beginning, clear that variable. Re-running contribution reconciliation does not double-count.
7. Compare aggregate totals with authoritative count queries and spot-check service/location cohorts. Inspect legacy driving licences and ask those missing expiry to resubmit.
8. Set service pricing policies and commission rate, then perform the authenticated staging smoke checklist below before production use.

Do not delete projection state while keeping its counters: those documents are the deduplication baseline. No automatic bulk migration ran here.

## 9. New routes

Pages: `/admin/map`, `/admin/recruitment`, `/admin/recruitment/[campaignId]`, `/admin/agents`, `/admin/analytics`, `/admin/verification` (existing verification view alias), `/agent`, `/agent/referrals`, `/agent/earnings`, `/recruit/[campaignSlug]`, `/join/[linkId]`.

APIs: `/api/admin/marketplace`, `/api/admin/recruitment`, `/api/admin/agents`, `/api/admin/pricing`, `/api/acquisition`, `/api/agent`, `/api/profile/pricing`. Existing admin/users/jobs/skills/verification and worker application/hire APIs remain in place.

## 10. Performance improvements

Revenue uses a server aggregate instead of downloading payment documents. Map requests read at most 180 anonymous cells, with debounced bounds and no user database download. Service supply counts are maintained from per-user contributions; irrelevant profile updates skip projection writes. Lists have bounded pages and cursor navigation. The jobs admin fetches applications/timelines for the current job page. Shared operational reads deduplicate in-flight requests, pause in hidden/offline tabs and refresh on return. New screens poll at 30–60 seconds, replacing the affected five-second admin polling. Job deadline displays update once per minute.

The map is a coarse supply visualization: cell-edge counts are approximate, and it is not an individual live-location tracker. Global aggregate documents may require sharding at high sustained write volume; measure contention before a large acquisition campaign.

## 11. Security / business protections

- Server checks actual admin profile permissions; invalid sessions fail closed.
- Campaign price/unit/service come from authoritative records, not landing-page form values. Canonical names prevent case/whitespace duplicates.
- Attribution persists through signup but cannot be overwritten after first valid attachment. Return paths accept only known same-origin recruitment routes.
- Self-referral, an existing agent being recruited for commission, old-account referral capture, inactive agent links, and mismatched identity ownership are blocked. Daily visit throttling limits basic counter abuse; it is not a substitute for an edge/WAF rate limiter.
- Pending identity does not hide a worker's service or prevent receiving a request. Accepting work still requires identity verification; driving additionally requires an approved, unexpired licence.
- Deadlines are checked again in the server write transaction.
- Pricing counts are service-specific. Defaults: initial recruitment price through four eligible completions; a 75–125% band at five; full control at fifteen with good standing. Configure explicit per-service policies in Admin Skills. Legacy services without an explicit policy retain existing pricing behavior.
- Commission is created once per job/worker from authoritative confirmed worker earnings. Timeline jobs sum all relevant paid timelines. Rate changes never rewrite earned ledger entries. Reversals change accounting state and append events while preserving original entries.
- Settlement is bookkeeping only: marking paid requires a payment reference; this implementation does not execute a bank/M-Pesa payout.

## 12. Mobile responsiveness

Admin navigation expands into touch-sized links; grids collapse without fixed-width overflow; forms and cards wrap; tables remain in bounded containers; filters and pagination remain accessible. Existing UI components and button hierarchy are reused.

The fixture checks covered all 15 primary screens at a 320px iframe in both themes, plus Recruitment, Analytics and Agent at 375, 390, 430, 768, 1024 and 1440px in both themes. Scrollbars reduce the inner CSS width on some cases. Sixty-five stored measurements plus the initial overview measurement showed no page-level horizontal overflow. Menu expansion was exercised at 390px. These are component/fixture checks, not authenticated end-to-end production tests.

## 13. Themes

New components use existing semantic theme variables and COPIC Card/Button/input styles. Existing Hanken Grotesk and JetBrains Mono declarations, lime accent and spacing remain. The map chooses the existing provider's light/dark styles. Light/dark recruitment and dashboard screenshots were visually inspected; no full redesign was performed.

## 14. Tests performed and limits

`npm run test:marketplace`: 15 passing tests covering deadline boundaries, licence expiry, identity/driving gates, 5/15 service-specific progression and account standing, commission precision, bounded map cells, canonical service names, projection replay/order, immutable commission creation, refunds, self/agent/duplicate-identity abuse, all-paid timeline accounting, duplicate applications, durable source-specific funnel milestones, and unpaid timeline exclusion.

Transaction tests use a strict in-memory Firestore double, which rejects reads after writes and stages writes atomically. They are not Firestore emulator or concurrent production load tests.

Browser fixture checks used actual components with synthetic responses and auth adapters. Offline/reconnect events displayed the expected messages and kept a typed campaign draft. Real network interruption, Firebase reconnect behavior and deployed service-worker behavior still require staging verification. The map fixture exercised only its missing-token state, not live tiles/geocoding.

## 15. Build / typecheck / lint

- `npm run typecheck`: passed.
- `npm run functions:build`: passed.
- `npm run test:marketplace`: 15/15 passed.
- `npm run build`: passed; 103 pages generated, including new routes.
- Scoped application lint (`npx eslint app components context hooks lib services types utils functions/src scripts tests`): zero errors, nine image-element warnings (eight existing plus the intentionally plain local fixture image adapter).
- Whole-repository lint encounters pre-existing errors in the unrelated untracked `experts/` directory. Those user files were left untouched; no lint rule was disabled.
- Local Node is 24.15.0; the repository declares Node 20.x. Repeat CI validation on the declared runtime before release.
- Production runtime smoke launch stopped at the existing configuration guard because `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` and `NEXT_PUBLIC_APP_URL` are absent locally. Firebase emulator checks were not completed (local CLI configuration access and Java runtime constraints).

## 16. Remaining configuration and staging checks

Supply existing Firebase/Storage/app-origin configuration and a restricted Mapbox token; deploy indexes/rules/Functions; run and verify the explicit backfill; set service pricing policies and confirm the commission rate. No live map, authenticated cloud write, migration or settlement was executed here.

Before release, run with real staging worker/client/admin/non-admin accounts: permission rejection; campaign create/pause/expiry; anonymous click → signup/profile completion → attribution; returning existing campaign user; duplicate auto-skill addition and manipulated price rejection; pending worker discovery and incoming request; blocked unverified/expired-licence acceptance and successful verified acceptance; closed deadlines; agent register/general/service links; referral redirects and self/agent abuse; paid completion → one commission; replay/refund; map viewport/filter results; offline/reconnect with real network loss; both themes on physical mobile browsers. Check concurrent duplicate job applications and financial event retries in the emulator/staging environment. Automated coverage above should not be read as completion of this live integration checklist.

## File inventory

### Created

- `app/admin/agents/page.tsx`
- `app/admin/analytics/page.tsx`
- `app/admin/map/page.tsx`
- `app/admin/recruitment/[campaignId]/page.tsx`
- `app/admin/recruitment/page.tsx`
- `app/admin/verification/page.tsx`
- `app/agent/earnings/page.tsx`
- `app/agent/page.tsx`
- `app/agent/referrals/page.tsx`
- `app/api/acquisition/route.ts`
- `app/api/admin/agents/route.ts`
- `app/api/admin/marketplace/route.ts`
- `app/api/admin/pricing/route.ts`
- `app/api/admin/recruitment/route.ts`
- `app/api/agent/route.ts`
- `app/api/profile/pricing/route.ts`
- `app/join/[linkId]/page.tsx`
- `app/recruit/[campaignSlug]/page.tsx`
- `components/admin/AcquisitionFunnel.tsx`
- `components/admin/MarketplaceMap.tsx`
- `components/admin/PricingConfiguration.tsx`
- `components/admin/SkillsAnalytics.tsx`
- `components/layout/ConnectionStatus.tsx`
- `components/profile/AgentRecords.tsx`
- `components/profile/RecruitmentLanding.tsx`
- `components/profile/ServicePricingNotice.tsx`
- `docs/marketplace-delivery-report.md`
- `docs/marketplace-implementation.md`
- `functions/lib/marketplace-completions.js`
- `functions/lib/marketplace-completions.js.map`
- `functions/lib/marketplace-policy.js`
- `functions/lib/marketplace-policy.js.map`
- `functions/lib/marketplace-projections.js`
- `functions/lib/marketplace-projections.js.map`
- `functions/lib/marketplace-triggers.js`
- `functions/lib/marketplace-triggers.js.map`
- `functions/src/marketplace-completions.ts`
- `functions/src/marketplace-policy.ts`
- `functions/src/marketplace-projections.ts`
- `functions/src/marketplace-triggers.ts`
- `hooks/useOperationalData.ts`
- `lib/marketplace-server.ts`
- `lib/service-pricing.ts`
- `scripts/backfill-marketplace.ts`
- `scripts/marketplace-ui-fixtures.mts`
- `tests/marketplace-policy.test.ts`
- `tests/marketplace-transactions.test.ts`
- `tests/memory-firestore.ts`
- `tests/ui/auth.ts`
- `tests/ui/entry.tsx`
- `tests/ui/firebase.ts`
- `tests/ui/fixtures.ts`
- `tests/ui/image.tsx`
- `tests/ui/link.tsx`
- `tests/ui/navigation.ts`
- `tests/ui/protected.ts`
- `utils/acquisition-return.ts`

### Modified

- `.gitignore`
- `app/admin/jobs/page.tsx`
- `app/admin/kyc/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/page.tsx`
- `app/admin/skills/page.tsx`
- `app/admin/users/page.tsx`
- `app/api/admin/jobs/route.ts`
- `app/api/admin/skills/route.ts`
- `app/api/admin/stats/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/admin/verifications/route.ts`
- `app/api/applications/route.ts`
- `app/api/hire-requests/route.ts`
- `app/api/jobs/create/route.ts`
- `app/api/jobs/route.ts`
- `app/api/kyc/start/route.ts`
- `app/api/profile/skills/route.ts`
- `app/api/users/route.ts`
- `app/complete-profile/page.tsx`
- `app/dashboard/page.tsx`
- `app/layout.tsx`
- `app/plan-b-theme.css`
- `app/profile/page.tsx`
- `app/workers/page.tsx`
- `components/auth/AuthForm.tsx`
- `components/jobs/JobCard.tsx`
- `components/jobs/PostWorkWizard.tsx`
- `components/profile/AddSkillModal.tsx`
- `components/pwa/PwaBootstrap.tsx`
- `components/verification/IdentityVerificationModal.tsx`
- `components/verification/VerificationReminder.tsx`
- `context/AuthContext.tsx`
- `firestore.indexes.json`
- `firestore.rules`
- `functions/lib/index.js`
- `functions/lib/index.js.map`
- `functions/src/index.ts`
- `hooks/useProtectedRoute.ts`
- `lib/admin-security.ts`
- `lib/current-user-profile.ts`
- `lib/local-sql.ts`
- `lib/worker-verification.ts`
- `package.json`
- `services/kyc.ts`
- `services/users.ts`
- `storage.rules`
- `tsconfig.tsbuildinfo`
- `types/index.ts`
- `utils/jobRules.ts`
- `utils/validation.ts`
- `utils/worker-skills.ts`

Generated `functions/lib` outputs accompany the TypeScript source because this repository tracks compiled Functions. `tsconfig.tsbuildinfo` was refreshed by typechecking. The pre-existing `experts/` directory is excluded from this inventory.
