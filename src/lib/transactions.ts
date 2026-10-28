import {
  Timestamp,
  addDoc,
  deleteField,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { transactionsCol } from "@/lib/firebase/firestore";
import {
  hasPaymentMethodId,
  normalizePaymentMethodId,
  requirePaymentMethodId,
} from "@/lib/payment-method-resolver";
import { toMonthKey } from "@/lib/time";
import type { TransactionType } from "@/types/ledger";

function stripUndefinedValues<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export async function addTransaction(params: {
  householdId: string;
  type: TransactionType;
  amount: number;
  discountAmount?: number;
  categoryId: string;
  // 표시용 이름 스냅샷. 로직은 paymentMethodId만 쓴다.
  paymentMethod: string;
  paymentMethodId: string;
  recurringRuleId?: string | null;
  generatedFromRecurringRuleId?: string | null;
  recurringOccurrenceDateKey?: string | null;
  subject: string;
  date: Date;
  note?: string;
  budgetApplied?: boolean;
  createdBy: string;
}) {
  // 검사와 정규화를 함께 한다. 공백이 섞인 ID도 정리된 값으로 저장된다.
  const paymentMethodId = requirePaymentMethodId(params.paymentMethodId);
  const { householdId, date, ...rest } = params;
  const payload = {
    ...stripUndefinedValues(rest),
    paymentMethodId,
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
  discountAmount?: number;
  categoryId: string;
  // 표시용 이름 스냅샷. 로직은 paymentMethodId만 쓴다.
  paymentMethod: string;
  paymentMethodId: string;
  recurringRuleId?: string | null;
  generatedFromRecurringRuleId?: string | null;
  recurringOccurrenceDateKey?: string | null;
  subject: string;
  date: Date;
  note?: string;
  budgetApplied?: boolean;
}) {
  const paymentMethodId = requirePaymentMethodId(params.paymentMethodId);
  const { householdId, transactionId, date, ...rest } = params;
  const payload: Record<string, unknown> = {
    ...stripUndefinedValues(rest),
    paymentMethodId,
    date: Timestamp.fromDate(date),
    monthKey: toMonthKey(date),
  };
  if (rest.note === undefined) {
    payload.note = deleteField();
  }
  if (rest.discountAmount === undefined) {
    payload.discountAmount = deleteField();
  }
  if (rest.recurringRuleId === undefined) {
    payload.recurringRuleId = deleteField();
  }
  if (rest.generatedFromRecurringRuleId === undefined) {
    payload.generatedFromRecurringRuleId = deleteField();
  }
  if (rest.recurringOccurrenceDateKey === undefined) {
    payload.recurringOccurrenceDateKey = deleteField();
  }
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

/**
 * 삭제 직후 "되돌리기"로 거래를 원래 문서 그대로 복원한다.
 *
 * add/update와 달리 paymentMethodId를 강제하지 않는다. 새 데이터를 만드는 게
 * 아니라 방금 지운 문서를 되살리는 것이라, 여기서 막으면 되돌리기가 실패해
 * 거래가 영구히 사라진다. (운영 데이터는 전부 ID가 있어 실제로는 항상 함께 온다)
 */
export async function restoreTransaction(params: {
  householdId: string;
  transactionId: string;
  type: TransactionType;
  amount: number;
  discountAmount?: number;
  categoryId: string;
  paymentMethod: string;
  paymentMethodId?: string | null;
  recurringRuleId?: string | null;
  generatedFromRecurringRuleId?: string | null;
  recurringOccurrenceDateKey?: string | null;
  subject: string;
  date: Date;
  note?: string;
  budgetApplied?: boolean;
  createdBy: string;
  createdAt?: Date | null;
}) {
  const { householdId, transactionId, date, createdAt, ...rest } = params;
  // ID가 있으면 정규화해서 되살리고, 없으면(공백만 있는 경우 포함) 필드를 생략한다.
  const payload = {
    ...stripUndefinedValues({
      ...rest,
      paymentMethodId: hasPaymentMethodId(rest.paymentMethodId)
        ? normalizePaymentMethodId(rest.paymentMethodId)
        : undefined,
    }),
    date: Timestamp.fromDate(date),
    monthKey: toMonthKey(date),
    createdAt: createdAt ? Timestamp.fromDate(createdAt) : serverTimestamp(),
  };
  return setDoc(
    doc(db, "households", householdId, "transactions", transactionId),
    payload
  );
}

async function updateTransactionsFieldValue(
  householdId: string,
  field: "subject",
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
