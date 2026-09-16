# COPIC marketplace expansion

## Audit and implementation plan (before code changes)

- Next.js 16 App Router / React 19 / TypeScript; API route handlers, not server actions. Firebase Authentication bearer tokens; authoritative admin profiles and permission checks in `lib/admin-security.ts`. Production always uses Firestore; optional SQLite is development-only.
- Users live in `users`; worker/client capabilities use `roles` alongside the current `role`. Worker service profiles are embedded `skillProfiles` with legacy `skills` names. Preserve both and existing reviews. Service taxonomy is `lib/jobCategories.ts`; do not seed duplicates.
- Identity and driving credentials share `verifications`, IDs `uid` and `driver-license-uid`. Existing private upload/signing and mobile review UI can be extended. Licence expiry is missing. Eligibility is centralized but approval fallback can override a newer rejection.
- Jobs, applications (including direct hires), timelines, ratings and service-fee payments are separate collections. Completion/payment confirmation is server-owned. Existing direct hire creation blocks unverified recipients; acceptance must remain gated instead.
- Admin already has overview, users, skills review, jobs, KYC, support, fees, disputes, reports, audit, admins, settings. Preserve these. Overview counts are server aggregates, but revenue downloads all approved payments. Skill review scans a capped worker subset; separate maintained analytics from review lists.
- Mapbox GL / react-map-gl is the existing map stack. Locations include exact coordinates and addresses; the new admin map must consume coarse aggregate cells only.
- Hanken Grotesk and JetBrains Mono, existing `temp-*` / `copic-*` components and `plan-b-theme.css` are authoritative. Lime #b2f746, black, CSS variables and `data-ui-theme` implement both themes. Reuse Card, Button, AppModal and existing spacing.
- AuthContext owns profile/verification listeners. Several services poll every five seconds; avoid adding equivalent listeners. PWA reconnect currently reloads and loses drafts. No acquisition/commission infrastructure found.
- Security rules currently allow overly broad user mutations and direct application writes. Protect authoritative fields and route new business writes through authenticated server handlers.
- Working tree initially contains untracked `experts/`; leave it untouched. Baseline typecheck started before changes.

## Ordered phases

1. Responsive admin navigation and theme aliases; aggregate overview.
2. Maintained service/geographic projections and bounded analytics/map views.
3. COPIC campaign management and attribution-preserving recruitment flow.
4. Worker visibility/acceptance, deadlines, licence expiry, service pricing policy.
5. Independent agent capability, links, immutable referral ownership and commission ledger.
6. Idempotent acquisition funnel events and operational refresh.
7. Connection recovery, targeted performance/security fixes, backfill tooling.
8. Typecheck, lint, domain tests, functions build, production build and UI checks where local runtime permits.

No production migration or deployment will run automatically. New projection data requires an explicit documented backfill; all existing users/skills remain intact.
