/* eslint-disable no-console */
const admin = require("firebase-admin");

function resolveProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT
  );
}

async function main() {
  const projectId = resolveProjectId();
  if (!projectId) {
    console.error(
      "Missing project id. Set FIREBASE_PROJECT_ID or GOOGLE_CLOUD_PROJECT."
    );
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  const db = admin.firestore();
  const snapshot = await db.collectionGroup("categories").get();

  let total = 0;
  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;

  snapshot.docs.forEach((docSnap) => {
    total += 1;
    const data = docSnap.data();
    if (!Object.prototype.hasOwnProperty.call(data, "budgetEnabled")) {
      batch.update(docSnap.ref, { budgetEnabled: false });
      updated += 1;
      batchCount += 1;
      if (batchCount >= 450) {
        batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  });

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Scanned: ${total}`);
  console.log(`Updated: ${updated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
