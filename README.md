# Temp

Temp is a production-oriented Progressive Web App for Kenya temporary gig work. It uses Next.js 15 App Router, React, TypeScript, Tailwind CSS, Framer Motion, Firebase Auth, Firestore, Storage, Cloud Functions, Cloud Messaging, and Firebase Hosting.

## What Is Included

- Mobile-first PWA with `app/manifest.ts`, service worker, offline fallback, install prompt, and push notification support.
- Firebase Authentication flows for email/password, Google, and phone OTP-ready Recaptcha setup.
- Role-based users: worker, client, admin.
- KYC upload flow with National ID hashing, selfie upload, duplicate ID detection, admin review functions, and status sync.
- Temporary job system with 2-hour minimum and 1-year maximum duration validation.
- Application workflow with KYC and account-lock restrictions.
- Chat architecture locked until an accepted application/invitation creates an unlocked conversation.
- Wallet architecture for M-Pesa and cash payment flows.
- Service fee calculation, worker wallet crediting, transaction records, account locking for unpaid cash fees, and unlock service.
- Admin dashboard routes for KYC, reports, transactions, and users.
- Firestore and Storage security rules, indexes, seed data, Firebase Hosting config, and Cloud Functions.

## Setup

1. Install dependencies:

```bash
npm install
cd functions && npm install && cd ..
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Fill Firebase web app values and service account values in `.env.local`.

4. Run locally:

```bash
npm run dev
```

5. Seed Firestore after credentials are configured:

```bash
npm run seed
```

## Firebase Deployment

```bash
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes,storage
npm run functions:build
firebase deploy --only functions,hosting
```

Firebase Hosting framework support is configured in `firebase.json`. Firestore indexes are in `firestore.indexes.json`; security rules are in `firestore.rules` and `storage.rules`.

## PWA Notes

The app follows the current Next.js App Router PWA shape with `app/manifest.ts`, a public service worker, an offline route, cache-first fallback for static/navigation failures, and web push registration. The official Next.js PWA guide used for this setup is [Next.js PWAs](https://nextjs.org/docs/app/guides/progressive-web-apps).

## M-Pesa Integration

`functions/src/index.ts` includes the secure callable completion flow and a callback endpoint scaffold. In production, connect the callback to Daraja STK Push validation, verify receipts server-side, then call the same transaction update path. Client-side code never writes wallet balances directly; rules reserve wallet writes for trusted admin/server contexts.

## Security Model

Firestore rules enforce authentication, ownership, role checks, chat participant access, job duration bounds, worker account-lock restrictions, admin-only wallet writes, and KYC/admin boundaries. Cloud Functions use Firebase Auth context as JWT-backed identity for privileged operations. Public registration only creates worker/client profiles; create the first admin from the Firebase console or Admin SDK, then use `setAdminRole` to grant future admin custom claims.
"# temp" 
"# temp" 
