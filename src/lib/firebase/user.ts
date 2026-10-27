import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

// 사용자 프로필 생성과 가계부 연결은 서버(/api/signup 등)가 한다.

export const userDoc = (uid: string) => doc(db, "users", uid);

export async function updateUserDisplayName(uid: string, displayName: string) {
  await updateDoc(userDoc(uid), { displayName });
}

export async function getUserProfile(uid: string) {
  const snapshot = await getDoc(userDoc(uid));
  if (!snapshot.exists()) {
    return null;
  }
  return {
    id: snapshot.id,
    ...(snapshot.data() as {
      householdId?: string;
      displayName?: string | null;
      spouseRole?: "husband" | "wife" | null;
      createdAt?: unknown;
    }),
  };
}
