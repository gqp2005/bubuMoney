import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export const userDoc = (uid: string) => doc(db, "users", uid);

export async function createUserProfile(
  uid: string,
  householdId: string,
  displayName?: string
) {
  await setDoc(userDoc(uid), {
    householdId,
    displayName: displayName ?? null,
    createdAt: serverTimestamp(),
  });
}

export async function setUserHousehold(uid: string, householdId: string) {
  try {
    await updateDoc(userDoc(uid), { householdId });
  } catch (err) {
    await setDoc(userDoc(uid), {
      householdId,
      createdAt: serverTimestamp(),
    });
  }
}

export async function updateUserDisplayName(uid: string, displayName: string) {
  await updateDoc(userDoc(uid), { displayName });
}

export async function getUserProfile(uid: string) {
  const snapshot = await getDoc(userDoc(uid));
  if (!snapshot.exists()) {
    return null;
  }
  return { id: snapshot.id, ...snapshot.data() };
}
