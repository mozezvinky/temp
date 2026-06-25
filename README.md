# Copic

Copic is a Progressive Web App for connecting people, earning income, and building careers. Clients can post work, workers can find opportunities, and both sides can manage profiles, chat, alerts, and payments from one responsive interface.

## Included

- Mobile-first app experience with install support and offline fallback.
- Email and password account access.
- Secure 6-digit email verification codes delivered through Resend.
- Worker, client, and hidden admin roles.
- Manual ID verification with protected front, back, and selfie-with-ID uploads.
- Work posting with duration validation.
- Locked chat until job acceptance or invitation acceptance.
- Service-fee review, alerts, support tickets, and admin review screens.
- Mapbox address and coordinate selection for jobs and verification profiles.
- Security rules, deployment config, and production build scripts.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill the required environment values before using live account, payment, notification, and upload features.

## Local SQL Mode

For local development you can keep Firebase Auth for sign-in while storing app data in SQLite instead of Firestore:

```env
NEXT_PUBLIC_DATA_BACKEND=sql
DATA_BACKEND=sql
LOCAL_SQLITE_PATH=./data/temp-local.sqlite
```

Restart `npm run dev` after changing these values. SQL mode stores local users, jobs, verification requests, service-fee records, and activities in `data/temp-local.sqlite`. This is for development only; remove or change those variables when you are ready to move the app data back to Firebase.

## Email Verification

New email/password accounts are directed to `/verify-email`. A signed-in user can request a 6-digit code, which is delivered through Resend and expires after 10 minutes. The server stores only a SHA-256 hash protected by `OTP_SECRET`, applies a 60-second resend cooldown, and limits failed attempts to five. Successful verification updates Firebase Authentication and the user's Firestore profile.

1. Create an API key in the [Resend dashboard](https://resend.com/api-keys).
2. Add `RESEND_API_KEY`, a long random `OTP_SECRET`, and Firebase Admin service-account values to `.env.local` or deployment secrets.
3. For production sending, verify your domain in Resend and set `RESEND_FROM_EMAIL` to an address on that domain. The `onboarding@resend.dev` value is useful only for initial Resend testing restrictions.
4. Sign up with an email/password account, open `/verify-email`, and enter the delivered code.

Email OTP confirms account access before sensitive verification actions.

## Identity Verification

Users upload the front of their ID, the back of their ID, and a selfie holding the ID to private Storage paths under `verification/{uid}/`. The database stores only object paths and a keyed hash of the ID number. Admin review images are exposed through short-lived signed URLs from the permission-checked `/api/admin/verifications` endpoint. Admins approve or reject requests at `/admin/kyc`; rejected users see the reason and can resubmit.

## Locations

Set `NEXT_PUBLIC_MAPBOX_TOKEN` to enable the client-only Mapbox picker used for job locations.

## Support

Help tickets are realtime threads at `supportTickets/{ticketId}/messages/{messageId}`. Users can access only their tickets; admins reply and update statuses at `/admin/support`. Published FAQ records in `faqs/{faqId}` appear in `/faq`.

## Security

- `emailOtps`, `identityClaims`, verification decisions, and admin audit logs are backend-only.
- Service-fee decisions and payment records are server-controlled.
- Verification decisions and admin logs cannot be written from browser code.
- Verification uploads accept only images under 8 MB and are owner/admin accessible.

## Build

```bash
npm run typecheck
npm run build
```

## Deploy

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
npm run functions:build
firebase deploy --only functions,hosting
```
