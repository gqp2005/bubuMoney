import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export async function getMonthlyMemo(householdId: string, monthKey: string) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data() as { text?: string };
  return data.text ?? null;
}

export async function setMonthlyMemo(
  householdId: string,
  monthKey: string,
  text: string,
  uid: string
) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  await setDoc(
    ref,
    {
      text,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
