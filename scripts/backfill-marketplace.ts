/** Non-destructive, resumable marketplace projection backfill. Uses Application Default Credentials. */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { syncMarketplaceUser } from "../functions/src/marketplace-projections";
import { reconcileCompletedApplication } from "../functions/src/marketplace-completions";

async function main() {
  const apply = process.argv.includes("--apply");
  const completed = process.argv.includes("--completed-jobs");
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error("Set GOOGLE_CLOUD_PROJECT explicitly. No default production project is selected.");
  if (apply && process.env.COPIC_BACKFILL_PROJECT !== project) throw new Error("Set COPIC_BACKFILL_PROJECT to the same explicit project to authorize writes.");
  initializeApp({ projectId: project, credential: applicationDefault() });
  const db = getFirestore();
  const collection = completed ? "applications" : "users";
  let cursor = process.env.COPIC_BACKFILL_AFTER ?? "", count = 0;
  for (;;) {
    let query = db.collection(collection).orderBy("__name__").limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      if (apply) {
        if (completed) await reconcileCompletedApplication(db, doc.id);
        else await syncMarketplaceUser(db, doc.id);
      }
      count++;
    }
    cursor = page.docs[page.docs.length-1].id;
    process.stdout.write(`${apply ? "Applied" : "Dry run"}: ${count} ${collection}; resume cursor ${cursor}\n`);
  }
  if (apply && !completed) await db.doc("marketplaceMetrics/overview").set({ backfillCompletedAt: new Date(), backfillProject: project }, { merge: true });
}
void main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : error}\n`); process.exitCode = 1; });
