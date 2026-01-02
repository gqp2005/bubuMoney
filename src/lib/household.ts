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
  paymentMethodsCol,
  subjectsCol,
} from "@/lib/firebase/firestore";

type SpouseRole = "husband" | "wife";

export function generateInviteCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createHousehold(
  name: string,
  uid: string,
  creatorDisplayName?: string,
  partnerDisplayName?: string,
  creatorRole: SpouseRole = "husband"
) {
  const householdRef = await addDoc(collection(db, "households"), {
    name,
    createdAt: serverTimestamp(),
    membersCount: 1,
    creatorDisplayName: creatorDisplayName ?? null,
    partnerDisplayName: partnerDisplayName ?? null,
  });

  await setDoc(doc(membersCol(householdRef.id), uid), {
    role: "owner",
    createdAt: serverTimestamp(),
  });

  const batch = writeBatch(db);
  const defaultCategories = [
    { name: "급여", type: "income", order: 1, parentId: null },
    { name: "기타수입", type: "income", order: 2, parentId: null },
  ];
  defaultCategories.forEach((category) => {
    const categoryRef = doc(categoriesCol(householdRef.id));
    batch.set(categoryRef, category);
  });

  const cleanedCreator = creatorDisplayName?.trim();
  const cleanedPartner = partnerDisplayName?.trim();
  const husbandName =
    creatorRole === "wife"
      ? cleanedPartner || "남편"
      : cleanedCreator || "남편";
  const wifeName =
    creatorRole === "wife" ? cleanedCreator || "아내" : cleanedPartner || "아내";
  const subjectDefaults = [
    { name: husbandName, order: 1 },
    { name: wifeName, order: 2 },
    { name: "우리", order: 3 },
    { name: "시댁", order: 4 },
    { name: "처가댁", order: 5 },
    { name: "아기", order: 6 },
  ];
  subjectDefaults.forEach((subject) => {
    const subjectRef = doc(subjectsCol(householdRef.id));
    batch.set(subjectRef, subject);
  });

  const defaultPaymentMethods = [
    { name: "현금", order: 1 },
    { name: "은행", order: 2 },
    { name: "체크카드", order: 3 },
    { name: "신용카드", order: 4 },
    { name: "대출", order: 5 },
    { name: "기타", order: 6 },
  ];
  const owners: SpouseRole[] = ["husband", "wife"];
  owners.forEach((owner) => {
    defaultPaymentMethods.forEach((method) => {
      const methodRef = doc(paymentMethodsCol(householdRef.id));
      batch.set(methodRef, { ...method, owner, parentId: null });
    });
  });
  defaultPaymentMethods.forEach((method) => {
    const methodRef = doc(paymentMethodsCol(householdRef.id));
    batch.set(methodRef, { ...method, owner: "our", parentId: null });
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

export async function findInviteByCode(
  code: string
): Promise<{
  inviteId: string;
  householdId: string;
  createdBy: string;
} | null> {
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
  const data = inviteDoc.data() as { createdBy?: string };
  if (!data.createdBy) {
    return null;
  }

  return {
    inviteId: inviteDoc.id,
    householdId: householdRef.id,
    createdBy: data.createdBy,
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
