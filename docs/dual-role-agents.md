# COPIC dual-role agents

The existing `agentEnabled` capability grants both dashboard modes. Existing accounts default to Worker Agent; no registration, balance reset or historical migration is needed. Entries without `roleType` remain Worker Agent entries. Old `/join/{linkId}` links are unchanged.

## Attribution and approval

Client links use `/agent/client/{code}`, with a deterministic opaque code in the existing `agentLinks` collection. An authenticated agent's overview lazily creates the client link if missing, without reactivating a disabled link. A client explicitly confirms a referral, which is retained in session storage through authentication and consumed after one successful posting. No commission is generated from a click or signup.

Agents prepare proposals with the existing PostWorkWizard. The customer must first have a client account; the agent provides that account's email. The proposal and in-app approval notification are committed atomically. There is a 30-proposal daily limit. The recipient can review, edit and approve using the existing job-creation route, or reject. Publication requires the existing client verification checks. The proposal transitions from pending to published in the same Firestore transaction as the job write, preventing concurrent or repeated publication. Agents cannot publish proposals themselves.

An explicitly approved proposal takes precedence over a referral link. The server validates the active agent and blocks self-attribution, agent-to-agent sourcing and an existing worker referral back to the sourcing agent. Only a server-created immutable job snapshot identifies the agent. Normal job edits do not accept attribution fields.

## Accounting

New commissions are exactly 1% of finalized `applications.workerEarnings`, or the sum of the assignment's paid `jobTimelines.workerAmount`. Existing payment workflows calculate those values for fixed work, timeline work and direct hiring. Neither worker payouts nor client prices are modified. Commission funding is recorded as COPIC fee revenue. Decimal values are converted to integer KES minor units using decimal/BigInt half-up rounding before commission calculation.

The existing marketplace supports multiple workers on a job, potentially recruited by different agents. Consequently, ledger uniqueness remains per **job + worker assignment + role**, rather than collapsing different workers' earnings into one job-level beneficiary. Existing worker keys stay `{jobId}_{workerId}`; the client role uses `{jobId}_{workerId}_CLIENT_AGENT`. A repeated application for the same assignment cannot re-credit or reverse a different application's commission. This is a deliberate adaptation of the brief's job/role identity to the existing multi-worker model.

Both role records are read and written in one Firestore transaction. A legitimately qualifying agent can receive both entries. Original historical amounts, rates, worker relationships and ledger identities are retained.

Completion and payment confirmation are prerequisites. Open participant reports, disputes, refunds, invalid records and unpaid timelines block commissions. Job, application, timeline, report and dispute triggers reconcile authoritative current records. Other users' reports do not hijack a participant's settlement; report ownership cannot be forged through direct browser writes.

Calculated commissions enter pending verification. Only finance administrators can release or record payment. Release/payment rechecks the source inside the payout transaction and requires a verification/payment reference. Paid status requires a prior available state and an explicit receipt. Commission events record the admin, reason and reference.

Reversals retain immutable ledger calculations and payment references. A changed settled value reverses the existing amount once. Administrators can recalculate from verified current source values; the original ledger remains intact and a correction event records the new effective amount in commissionStates. A previously paid amount requires a recovery reference before correction. Restored eligibility requires administrator review, never automatic re-crediting.

## Security and deployment review

Agent data is read through authenticated, owner-scoped server routes. Direct Firestore reads/writes for private referral, proposal, rate-limit and financial collections are denied, including for agents. Approval requires the intended authenticated client. Financial calculations and privileged state transitions use Admin SDK transactions.

No production deployment, financial backfill or migration was executed. Review these deployment steps:

1. Deploy the updated Next.js application, Firestore rules and compiled Functions together in a staging environment. The Functions source exports new report, dispute and timeline reconciliation triggers.
2. Queries use single equality filters and existing document-name ordering, so no new composite index is required. Ensure normal single-field indexing remains enabled for `jobs.clientAgent.agentId`, `agentJobProposals.agentId`, `reports.relatedJobId` and issue/job identifiers.
3. No historical backfill is required. Do not replay historical completions merely to add client commissions; old jobs have no approved client snapshot. Preserve existing ledger/state/metrics collections.
4. Firestore emulator authorization and transaction integration tests now pass using the isolated demo project. Before production, complete an end-to-end staging check with separate verified client, worker, agent and finance accounts. Emulator results do not verify real off-platform receipts or the configuration of a deployed Firebase project.
5. Agent sourcing requires Firebase mode. The SQL-only local backend explicitly rejects attributed postings rather than silently dropping attribution; existing unattributed local posting remains available.

## Verification

Automated coverage includes activation compatibility, instant dashboard switching, trusted client approval, source precedence, self/circular referrals, privacy checks, exact rates, rounding, both roles, replay/concurrent transactions, timelines, source reports/disputes, corrections, recovery and payout authorization. Concurrent tests cover both an optimistic-conflict Firestore test double and real parallel transactions against the Firestore emulator.

The dashboard fixture uses synthetic data. Browser checks verified default worker mode and instant client switching at 320 px and 1440 px with no horizontal overflow. The overview currently reads all of the authenticated agent's ledger/referral records to produce exact historical totals. At large account volumes, move these totals to maintained role summaries and paginate detailed lists before scaling this endpoint.

Run `npx tsx --test tests/*.test.ts`, `npm run test:agents:emulator`, `npm run typecheck`, `npm run functions:build` and `npm run build` before deployment. Targeted ESLint checks cover the changed agent, approval and settlement surfaces.

Verified locally on 25 October 2026: all 116 regression tests and all 10 emulator integration tests pass. TypeScript, the production build and Functions compilation pass. The emulator suite checks six identities (including unverified users and admins), legitimate profile/job/application access, forbidden private data access and financial writes, forged issue ownership, real concurrent transaction idempotency and report-triggered reversals.

The emulator runner uses `demo-copic-dual-agent` on `127.0.0.1:8185` with a separate config and refuses production project/host settings. Firebase CLI 13.35.1 supports the installed Java 17. On Windows, the runner selects Java’s loopback TCP fallback to avoid an AF_UNIX wakeup-pipe error; it does not change system Java settings. No Functions emulator or live Firebase services are started.
