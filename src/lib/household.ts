import {
  Timestamp,
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  categoriesCol,
  householdDoc,
  invitesCol,
  membersCol,
} from "@/lib/firebase/firestore";

export function generateInviteCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createHousehold(name: string, uid: string) {
  const householdRef = await addDoc(collection(db, "households"), {
    name,
    createdAt: serverTimestamp(),
    membersCount: 1,
  });

  await setDoc(doc(membersCol(householdRef.id), uid), {
    role: "owner",
    createdAt: serverTimestamp(),
  });

  const batch = writeBatch(db);
  const defaultCategories = [
    { name: "식비", type: "expense", order: 1 },
    { name: "교통", type: "expense", order: 2 },
    { name: "주거", type: "expense", order: 3 },
    { name: "생활", type: "expense", order: 4 },
    { name: "의료", type: "expense", order: 5 },
    { name: "여가", type: "expense", order: 6 },
    { name: "급여", type: "income", order: 1 },
    { name: "기타수입", type: "income", order: 2 },
  ];
  defaultCategories.forEach((category) => {
    const categoryRef = doc(categoriesCol(householdRef.id));
    batch.set(categoryRef, category);
  });
  await batch.commit();

  return householdRef.id;
}

export async function createInvite(householdId: string, uid: string) {
  const code = generateInviteCode();
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
  );
  const inviteRef = await addDoc(invitesCol(householdId), {
    code,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt,
  });
  return { id: inviteRef.id, code };
}

export async function joinHousehold(
  householdId: string,
  uid: string,
  invitedBy: string
) {
  const memberRef = doc(membersCol(householdId), uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) {
    return;
  }

  await setDoc(memberRef, {
    role: "member",
    invitedBy,
    createdAt: serverTimestamp(),
  });

  await updateDoc(householdDoc(householdId), {
    membersCount: increment(1),
  });
}

export async function findInviteByCode(code: string) {
  const invitesQuery = query(
    collectionGroup(db, "invites"),
    where("code", "==", code.toUpperCase()),
    where("usedBy", "==", null),
    where("expiresAt", ">", Timestamp.now())
  );
  const snapshot = await getDocs(invitesQuery);
  if (snapshot.empty) {
    return null;
  }

  const inviteDoc = snapshot.docs[0];
  const householdRef = inviteDoc.ref.parent.parent;
  if (!householdRef) {
    return null;
  }

  return {
    inviteId: inviteDoc.id,
    householdId: householdRef.id,
    ...inviteDoc.data(),
  };
}

export async function acceptInvite(
  inviteId: string,
  householdId: string,
  uid: string
) {
  await updateDoc(doc(invitesCol(householdId), inviteId), {
    usedBy: uid,
  });
}
