# COPIC service catalogue implementation

## Changes and integration points

- `utils/service-catalogue.ts` defines the five priority sectors, category-specific optional requirements, validated catalogue data, booking snapshots and catalogue quotes. Quotes delegate to the existing authoritative client-total money helper.
- `app/api/profile/catalogue/route.ts` manages entries inside existing `users.skillProfiles[].catalogue`. It checks worker ownership, skill approval, certificate eligibility, prices, image ownership, parent sector and document size. Entries support up to eight photos, worker-defined add-ons, duration, visibility, availability and service arrangements. Deleting an entry leaves existing booking snapshots untouched.
- `components/profile/ServiceCatalogueManager.tsx` is included in the existing worker dashboard and profile. It supports creating, editing, hiding, deleting, previewing and reusing uploaded images, with optional add-on images and explicit public shop locations.
- `components/workers/ServiceDiscovery.tsx` is included in the existing Workers page and selected-worker panel. It groups exact normalized service names, then shows actual worker offers. Category, service name, minimum/maximum price, area, availability and arrangement filters are additive. Existing worker search, nearest-worker sorting and workers without portfolios remain available.
- Catalogue bookings call the existing `/api/hire-requests` route. They create the same pending job/application records, notifications, acceptance/decline, payment and completion workflow. Server snapshots contain the original service, images, selected extra IDs and prices, budget, preferred appointment, arrangement, location and instructions. Worker edits cannot alter those snapshots. The transaction rechecks the current catalogue before committing.
- `components/jobs/ServicePreferences.tsx` extends Post Work with multiple private inspiration images, removable previews, optional unpriced requirements, service arrangement and instructions. Existing dates, location and budget inputs are reused. `JobCard` displays the requirements to workers. Worker request details display the catalogue snapshot and inspiration photos.
- Existing skill submission and admin review handle certification. New submissions in the four certificate-required sectors require a certificate; Cleaning / Mama Fua remains exempt. Replacing proof resets approval. Admin review supports rejection reasons and resubmission requests. Existing approved skills remain functional and need no catalogue uploads.
- `app/api/service-media/route.ts` validates upload size, MIME type and file signatures. Files use UUID storage names. Catalogue images are public portfolio media; certificates require owner/admin authorization. Inspiration files require owner access, a visible open job or the targeted worker request. Private reads use authenticated server delivery, without Firebase download tokens.

## Financial behavior

Catalogue prices are full client totals. A KSh 700 service with two KSh 100 extras produces a KSh 900 proposed payment, KSh 90 included fee and KSh 810 net. Travel charges are explicitly included. Selecting extras never changes the client's maximum budget; totals above it are rejected.

New desired-worker-net direct quotes use the existing worker quote helper with inverse calculation: KSh 900 desired net means KSh 1,000 client total. Existing recorded pricing snapshots keep their original amounts. Settlement continues through `resolveJobPaymentBreakdown`, and the dual-agent commission/completion functions are unchanged. Explicitly approved client-agent attribution uses the existing helper inside the job transaction; no new commission is created on browsing or request submission.

Money remains in the platform's existing whole-KSh representation. Catalogue prices and add-ons must be nonnegative integers, with main prices at least KSh 50. Fees use existing deterministic rounding.

## Additive database changes

Firebase requires no destructive data migration:

- Optional `catalogue`, `certificationRequired` and `certificationReviewStatus` fields on existing skill profiles.
- Optional `serviceBooking` snapshots on existing jobs and applications.
- Optional `servicePreferences` on general jobs.
- Server-only `serviceMedia/{id}` upload metadata, with files under `service-media/{ownerId}/{id}` in the existing Firebase Storage bucket.

The optional SQLite development backend adds `jobs.serviceBooking`, `jobs.servicePreferences` and `applications.serviceBooking` columns through existing `ensureColumn` migrations. Its catalogue entries remain in the existing skill JSON. Uploads still require the configured Firebase Storage bucket and server Firebase credentials.

Legacy portfolios and proof URLs are not rewritten or deleted. Workers can replace legacy proof with the new private upload flow. Historical jobs do not require any of the new fields.

## Deployment

1. Configure the existing Firebase Admin credentials and Storage bucket in the Next.js runtime. The server needs permission to write/read that bucket and the `serviceMedia` collection. Private uploads and downloads must run in the authenticated Next.js backend.
2. Deploy the updated Firestore and Storage rules using the existing Firebase configuration. Both `serviceMedia` metadata and `service-media` objects deny direct SDK access. The two inspiration-image lookup queries use single-field array indexes, enabled by Firestore by default; no composite index is required.
3. Build and deploy the existing Next.js app. On this Windows host, `npm run build -- --webpack` succeeded; default Turbopack encountered a process-launch failure while processing Mapbox CSS. An initial sandboxed Webpack attempt also encountered a Windows directory permission error; the normal host build succeeded.
4. In a staging account, verify actual Firebase uploads, administrator certificate review, request acceptance, email delivery and the existing M-Pesa/payment confirmation flow before production rollout. No live accounts, payments or production records were changed during this implementation.

## Validation and practical limits

- 105 combined automated tests passed, including 27 catalogue domain/API tests.
- `npm run test:catalogue`: domain and API coverage for ownership, visibility, certificates, media access, budgets, prices, immutable history and existing job/application creation.
- Existing marketplace policy, transaction and dual-agent suites, agent settlement/security/client approval suites, recruitment verification and global email verification were exercised.
- `npm run functions:build` passed.
- New component/API lint checks had no errors; eight existing-style `<img>` optimization warnings remain. Private blob previews deliberately use normal images.
- Local fixture UI supports `/catalogue` with client, worker and Post Work states. Narrow-screen discovery was visually inspected at 320px and reported no horizontal overflow; exact-style worker comparison was exercised.
- Appointment timestamps are **preferences**, not a capacity calendar or reserved slot. Existing acceptance restrictions on workers with live work remain in place; no fabricated availability is shown. The repository has no confirmed future-slot calendar to extend.
- Public shop locations must be explicitly selected in the location picker. Existing private worker home addresses are not used as shop locations.
- No production end-to-end upload, email or financial transaction was executed. Automated tests use the existing in-memory transaction harness and isolated UI fixtures, never mock backend behavior in production.
