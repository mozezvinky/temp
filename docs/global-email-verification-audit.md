# COPIC global email-verification audit
Date: 2026-09-19

## Outcome and scope
Implemented one reusable Firebase verification-link flow for normal Worker/Client signup and login, Agent onboarding, Agent worker referrals, Admin recruitment campaigns, and Admin mailbox verification. Protected APIs now check fresh Firebase Auth state. Public pages and public acquisition viewing/visit recording stay public. No changes to commission calculations, referral ownership, recruitment pricing, completion rules, service fees, or KYC decisions.

This is a local implementation, not a confirmation that production has been deployed. No real accounts, verification emails, financial records, or production settings were changed in testing.

## 1. Existing functionality
Firebase email/password signup, Google popup service, custom-token Admin login, browser-local Firebase persistence, role selection, and profile recovery already existed. Agent/recruitment paths shared a Firebase verification-link component with reload, forced token refresh and a 60-second resend cooldown. Normal signup and /verify-email instead used separate custom OTP endpoints. No application middleware/proxy provides trusted Firebase authorization; protection lives in page hooks, APIs, callable Functions and Firebase rules.

## 2. Agent-specific protection
Agent activation and recruitment attribution already fetched Firebase Auth emailVerified on the server. Recruitment intent already preserved /become-agent, /join/{link}, and /recruit/{campaign}. Those routes and their attribution rules are retained.

## 3. Missing global enforcement
Normal login and the shared protected-page hook allowed unverified users through. The auth context, an email-verification component, server profile guards and Firestore rules could rely on profile/session-storage verification flags. Several APIs checked identity but not verification. Normal signup could delete a newly created Auth account on an OTP delivery failure and misleadingly label send failures as nonexistent emails. Admin bootstrap created new accounts as verified without mailbox proof. Account email changes did not explicitly clear verification.

## 4. Files changed
- app/api/account-settings/route.ts
- app/api/acquisition/route.ts
- app/api/activities/route.ts
- app/api/admin/actions/route.ts
- app/api/agent/route.ts
- app/api/applications/route.ts
- app/api/auth/admin-login/route.ts
- app/api/auth/create-profile/route.ts
- app/api/auth/me/route.ts
- app/api/auth/send-email-otp/route.ts
- app/api/auth/verify-email-otp/route.ts
- app/api/chat/route.ts
- app/api/hire-requests/route.ts
- app/api/jobs/create/route.ts
- app/api/jobs/route.ts
- app/api/kyc/start/route.ts
- app/api/location/resolve-landmark/route.ts
- app/api/notifications/route.ts
- app/api/profile/location/route.ts
- app/api/profile/photo/route.ts
- app/api/profile/pricing/route.ts
- app/api/profile/skills/route.ts
- app/api/ratings/route.ts
- app/api/reports/route.ts
- app/api/service-fee/payments/route.ts
- app/api/service-fee/status/route.ts
- app/api/users/route.ts
- app/auth/admin/page.tsx
- app/complete-profile/page.tsx
- app/profile/page.tsx
- app/verify-email/page.tsx
- components/auth/AuthForm.tsx
- components/auth/EmailVerificationRequired.tsx
- components/auth/RecruitmentEmailVerification.tsx
- components/layout/Shell.tsx
- context/AuthContext.tsx
- docs/global-email-verification-audit.md
- firestore.rules
- functions/lib/index.js
- functions/lib/index.js.map
- functions/src/index.ts
- hooks/useProtectedRoute.ts
- lib/admin-security.ts
- lib/current-user-profile.ts
- lib/server-auth.ts
- lib/verified-auth.ts
- services/auth.ts
- services/emailVerification.ts
- storage.rules
- tests/global-email-verification.test.ts
- tests/recruitment-verification.test.ts
- tests/ui/auth.ts
- tests/ui/email-services.ts
- tests/ui/entry.tsx
- utils/email-validation.ts
- utils/verification-return.ts

## 5. Shared verification UI
/verify-email now always renders the existing RecruitmentEmailVerification component, reused globally despite its historical filename. Normal signup no longer embeds a separate OTP form. The retired OTP endpoints return HTTP 410 directing old tabs to /verify-email; they no longer generate codes or change Auth/profile verification state.

The screen sends Firebase verification links, shows the destination mailbox, reloads the Firebase user when checking, forces a fresh ID token after success, and resumes the safe destination. A click alone never proves verification. AuthContext display mirrors come from user.emailVerified; sessionStorage/profile booleans no longer authorize access.

## 6. Failed sending and retries
Invalid syntax is rejected before creating an account, including addresses without a dotted domain. Error messages distinguish invalid-email, Firebase rate limits, network failures and unknown send failures. Successful sends show “Verification email sent.” The existing persisted 60-second cooldown and in-flight guards prevent duplicate clicks/resends across refresh. Firebase also applies its own server-side limits. There is no mailbox-existence guessing.

## 7. Correcting an email / preserving accounts
The verification screen retains “Sign out / change account.” This signs out without deleting Auth users, profiles or history, and opens login with the original returnTo; the signup link remains available. Signing back into the same email resumes its existing UID. An intentionally different email uses a different account; abandoned unverified Auth users are not automatically deleted. Protected Firestore profiles and referral attribution are not created before verification, avoiding orphan profile/attribution writes on delivery failure.

For an existing verified account changing its email through Profile, the server explicitly clears Auth verification, revokes old refresh tokens and clears the Firestore verification mirror. The client signs out and explains that the user must sign in with the new email and verify it. The original UID and profile/history stay intact.

## 8. Return intent
The existing acquisition allowlist remains unchanged. A shared verification-return helper accepts a bounded set of internal COPIC pages, Worker/Client setup role hints, job IDs and the existing acquisition paths. It rejects external URLs, protocol-relative URLs, javascript:, encoded path attacks, arbitrary queries and verification loops. The destination survives in returnTo plus existing browser storage patterns. No financial values are accepted in return intent.

## 9. Agent referral attribution
/join/{linkId} survives signup, login, refresh, verification and changing accounts. The backend reloads the authoritative link when attaching; existing self-referral, nested-Agent and idempotency rules remain intact. Verification itself does not create an upstream Agent relationship.

## 10. Recruitment campaigns
/recruit/{campaignId} survives the same flow. The existing campaign backend supplies the service/rate/unit; client query values are not financial authority. Standard /become-agent stays separate from both worker recruitment systems.

## 11. Existing accounts and providers
Existing unverified accounts are redirected to verification rather than deleted or recreated. Worker/client roles, Agent capability, services, jobs, referrals, commissions and KYC records remain intact. Verified Google users continue without an extra email-verification step; the existing Google service also checks Firebase state before profile creation if the provider returns an unverified user. No new Google login UI was introduced. There are phone helper functions but no separate active phone signup page in the inspected UI; protected access still requires a verified Firebase email.

Admin credentials and configured 2FA are validated as before. An unverified Admin receives only a Firebase sign-in token to open the same verification screen, without new Admin claims/profile/session. After verifying, they return to /auth/admin and authenticate again before Admin provisioning. Existing verified Admins retain the normal flow.

## 12. Server/API and direct-access enforcement
verifyVerifiedIdToken verifies/revocation-checks the token and fetches the current Firebase Auth account before accepting emailVerified. Browser flags and saved profile flags are not authority. Unverified requests receive HTTP 403 with error EMAIL_NOT_VERIFIED. Disabled accounts are also rejected.

Shared guards cover Agent APIs, jobs, applications, ratings, KYC and reports. Direct token users were updated for profile skills/photo/location/pricing, account settings, chat, hire requests, notifications, activities (SQL), service-fee status/payments, worker listing and authenticated location lookup. Both profile-creation entry points enforce verification. Admin routes retain their permission checks and now also fetch fresh mailbox verification.

GET /api/auth/me deliberately allows authenticated unverified users to read their own bootstrap profile; it does not grant protected access or create an unverified SQL profile. Public recruitment/acquisition GET and public visit recording are unchanged.

Firestore/Storage signed-in rules require the signed Firebase email_verified claim. Own-profile bootstrap reads remain available while unverified; protected writes and other private reads require verification. Functions' existing email guard now reads Firebase Auth; Admin callable guards include the same check. Existing business predicates remain unchanged.

## 13. Firebase link configuration found
Client Firebase configuration comes from NEXT_PUBLIC_FIREBASE_* variables; Auth uses browserLocalPersistence. Existing .firebaserc references the project temp-a6a03. firebase.json configures web hosting, Firestore rules, Storage rules and Functions deployment.
Production continuation URLs now use configuredAppUrl() / NEXT_PUBLIC_APP_URL with the existing COPIC production-origin fallback. Development uses the running local origin. Firebase's hosted action handler is retained (handleCodeInApp: false), rather than adding a new action-code handler.

## 14. Deployment and Firebase Console checks
Deploy the application, firestore.rules, storage.rules, and Functions together to activate all enforcement layers. A web-only deployment does not deploy Firebase rules/Functions.
Confirm NEXT_PUBLIC_APP_URL is the intended official COPIC origin. In Firebase Authentication, confirm email/password is enabled, the actual production hostname(s) are Authorized domains, and localhost is authorized for local testing if needed. Verify that the email template uses Firebase's working hosted action handler and preserves the supplied continuation URL. Google configuration must remain enabled if that provider is in use.
These Console settings were not inspected or changed through a live Firebase Console session. Live email delivery and the deployed rule set still require a controlled deployment smoke test.

## 15. Tests and limits
Automated suite: 43 tests across global email verification, Agent onboarding, recruitment verification, marketplace policy and transaction regression suites. This includes real server-module execution with mocked external Firebase/SQL services, false profile/token flags, sixteen protected API entry points, disabled/revoked sessions, safe return paths, role hints, signup without account deletion, send-error mapping, retired OTP endpoints, Admin bootstrap and email-change revocation.

Browser fixtures checked verification layouts at 320, 360, 375, 390, 430, 768, 1024 and 1440 pixels in light/dark mode: no viewport overflow, buttons at least 44px high. Checked inline invalid email, network error, cooldown, premature verification check, refresh, sign-out preserving campaign returnTo, verified Agent continuation, and direct navigation redirected by the real protected hook.

Tests substitute external Firebase/mail/production services. They do not prove real mail delivery, exercise real Google OAuth, or deploy/emulate Firestore/Storage rules. Rule claim checks were inspected and regression-asserted in source, not tested against a running Firebase emulator.

## 16. Build results
Typecheck passed. Functions TypeScript build passed. Targeted ESLint passed for the core verification/auth files. Final production build passed with 106 generated pages, including the last email-change UX adjustment. All 43 regression tests passed.

## Other existing issues left outside this change
The local SQL development profile helper can infer roles from request hints; production is forced to Firebase. This task did not redesign local development roles. Existing Admin session records are not per-device Firebase session identities, and the legacy Admin login lockout query is not ordered. Those broader systems were not redesigned. No unrelated lint cleanup, index changes, data migration, or account deletion was performed.
