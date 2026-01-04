import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });

const db = getFirestore();

async function backfillUserIds() {
  const usersRef = db.collection("users");
  const snapshot = await usersRef.get();
  if (snapshot.empty) {
    console.log("No users found.");
    return;
  }

  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (data.id === docSnap.id) {
      continue;
    }
    batch.update(docSnap.ref, { id: docSnap.id });
    updated += 1;
    ops += 1;
    if (ops === 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  console.log(`Backfill done. Updated: ${updated}`);
}

backfillUserIds().catch((err) => {
  console.error(err);
  process.exit(1);
});
