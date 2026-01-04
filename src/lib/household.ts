import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  budgetsCol,
  categoriesCol,
  householdDoc,
  invitesCol,
  membersCol,
  paymentMethodsCol,
  publicInvitesCol,
  transactionsCol,
  subjectsCol,
} from "@/lib/firebase/firestore";
import { getUserProfile } from "@/lib/firebase/user";

type SpouseRole = "husband" | "wife";

type ResetOptions = {
  transactions?: boolean;
  memos?: boolean;
  categories?: boolean;
  subjects?: boolean;
  paymentMethods?: boolean;
  budgets?: boolean;
  invites?: boolean;
  members?: boolean;
  household?: boolean;
};

async function deleteCollectionDocs(colRef: ReturnType<typeof collection>) {
  let snapshot = await getDocs(query(colRef, limit(500)));
  while (!snapshot.empty) {
    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    snapshot = await getDocs(query(colRef, limit(500)));
  }
}

export async function resetHouseholdData(
  householdId: string,
  options: ResetOptions
) {
  if (!householdId) {
    return;
  }
  if (options.transactions || options.household) {
    await deleteCollectionDocs(transactionsCol(householdId));
  }
  if (options.memos || options.household) {
    const memosCol = collection(db, "households", householdId, "memos");
    await deleteCollectionDocs(memosCol);
  }
  if (options.categories || options.household) {
    await deleteCollectionDocs(categoriesCol(householdId));
  }
  if (options.subjects || options.household) {
    await deleteCollectionDocs(subjectsCol(householdId));
  }
  if (options.paymentMethods || options.household) {
    await deleteCollectionDocs(paymentMethodsCol(householdId));
  }
  if (options.budgets || options.household) {
    await deleteCollectionDocs(budgetsCol(householdId));
  }
  if (options.invites || options.household) {
    await deleteCollectionDocs(invitesCol(householdId));
  }
  if (options.members || options.household) {
    await deleteCollectionDocs(membersCol(householdId));
  }
  if (options.household) {
    await deleteDoc(householdDoc(householdId));
  }
}

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
  const userProfile = await getUserProfile(uid);
  const householdSnapshot = await getDoc(householdDoc(householdId));
  const householdData = householdSnapshot.exists()
    ? (householdSnapshot.data() as { partnerDisplayName?: string | null })
    : {};
  const inviteRef = await addDoc(invitesCol(householdId), {
    code,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt,
    inviterRole: userProfile?.spouseRole ?? null,
    inviterDisplayName: userProfile?.displayName ?? null,
    partnerDisplayName: householdData.partnerDisplayName ?? null,
  });
  await setDoc(doc(publicInvitesCol(), code), {
    code,
    householdId,
    inviteId: inviteRef.id,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt,
    usedBy: null,
    inviterRole: userProfile?.spouseRole ?? null,
    inviterDisplayName: userProfile?.displayName ?? null,
    partnerDisplayName: householdData.partnerDisplayName ?? null,
  });
  return { id: inviteRef.id, code, expiresAt };
}

export async function joinHousehold(
  householdId: string,
  uid: string,
  invitedBy: string
) {
  const memberRef = doc(membersCol(householdId), uid);
  try {
    const existing = await getDoc(memberRef);
    if (existing.exists()) {
      return;
    }
  } catch {
    // Non-members may not have permission to read members; continue to create.
  }

  await setDoc(memberRef, {
    role: "member",
    invitedBy,
    createdAt: serverTimestamp(),
  });

  try {
    await updateDoc(householdDoc(householdId), {
      membersCount: increment(1),
    });
  } catch {
    // Non-members may not have permission to update the household doc.
  }
}

export async function findInviteByCode(
  code: string
): Promise<{
  inviteId: string;
  householdId: string;
  createdBy: string;
  inviterRole?: SpouseRole | null;
  inviterDisplayName?: string | null;
  partnerDisplayName?: string | null;
} | null> {
  const snapshot = await getDoc(doc(publicInvitesCol(), code.toUpperCase()));
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data() as {
    inviteId?: string;
    householdId?: string;
    createdBy?: string;
    inviterRole?: SpouseRole | null;
    inviterDisplayName?: string | null;
    partnerDisplayName?: string | null;
    usedBy?: string | null;
    expiresAt?: Timestamp;
  };
  if (!data.inviteId || !data.householdId || !data.createdBy) {
    return null;
  }
  if (data.usedBy) {
    return null;
  }
  if (data.expiresAt && data.expiresAt.toMillis() <= Timestamp.now().toMillis()) {
    return null;
  }
  return {
    inviteId: data.inviteId,
    householdId: data.householdId,
    createdBy: data.createdBy,
    inviterRole: data.inviterRole ?? null,
    inviterDisplayName: data.inviterDisplayName ?? null,
    partnerDisplayName: data.partnerDisplayName ?? null,
  };
}

export async function acceptInvite(
  inviteId: string,
  householdId: string,
  uid: string
) {
  const inviteRef = doc(invitesCol(householdId), inviteId);
  const snapshot = await getDoc(inviteRef);
  const data = snapshot.exists()
    ? (snapshot.data() as { code?: string })
    : {};
  await updateDoc(inviteRef, {
    usedBy: uid,
  });
  if (data.code) {
    await updateDoc(doc(publicInvitesCol(), data.code), {
      usedBy: uid,
    });
  }
}
