import {
  Timestamp,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { transactionsCol } from "@/lib/firebase/firestore";
import { toMonthKey } from "@/lib/time";
import type { TransactionType } from "@/types/ledger";

export async function addTransaction(params: {
  householdId: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  paymentMethod: string;
  subject: string;
  date: Date;
  note?: string;
  createdBy: string;
}) {
  const { householdId, date, ...rest } = params;
  const payload = {
    ...rest,
    date: Timestamp.fromDate(date),
    monthKey: toMonthKey(date),
    createdAt: serverTimestamp(),
  };

  return addDoc(transactionsCol(householdId), payload);
}

export async function updateTransaction(params: {
  householdId: string;
  transactionId: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  paymentMethod: string;
  subject: string;
  date: Date;
  note?: string;
}) {
  const { householdId, transactionId, date, ...rest } = params;
  const payload = {
    ...rest,
    date: Timestamp.fromDate(date),
    monthKey: toMonthKey(date),
  };
  return updateDoc(
    doc(db, "households", householdId, "transactions", transactionId),
    payload
  );
}

export async function deleteTransaction(
  householdId: string,
  transactionId: string
) {
  return deleteDoc(
    doc(db, "households", householdId, "transactions", transactionId)
  );
}

async function updateTransactionsFieldValue(
  householdId: string,
  field: "subject" | "paymentMethod",
  oldValue: string,
  newValue: string
) {
  if (!oldValue || oldValue === newValue) {
    return;
  }
  const snapshot = await getDocs(
    query(transactionsCol(householdId), where(field, "==", oldValue))
  );
  if (snapshot.empty) {
    return;
  }
  const docs = snapshot.docs;
  let index = 0;
  while (index < docs.length) {
    const batch = writeBatch(db);
    const slice = docs.slice(index, index + 500);
    slice.forEach((docSnap) => {
      batch.update(docSnap.ref, { [field]: newValue });
    });
    await batch.commit();
    index += slice.length;
  }
}

export async function updateTransactionsSubjectName(
  householdId: string,
  oldName: string,
  newName: string
) {
  return updateTransactionsFieldValue(householdId, "subject", oldName, newName);
}

export async function updateTransactionsPaymentMethodName(
  householdId: string,
  oldName: string,
  newName: string
) {
  return updateTransactionsFieldValue(
    householdId,
    "paymentMethod",
    oldName,
    newName
  );
}
