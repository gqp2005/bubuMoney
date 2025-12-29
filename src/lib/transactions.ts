import {
  Timestamp,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
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
