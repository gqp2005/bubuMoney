import {
  Timestamp,
  addDoc,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  recurringTransactionRulesCol,
  transactionsCol,
} from "@/lib/firebase/firestore";
import { toDateKey, toMonthKey } from "@/lib/time";
import type { RecurringTransactionRule, TransactionType } from "@/types/ledger";

function stripUndefinedValues<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function parseDateKey(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clampDayOfMonth(year: number, monthIndex: number, dayOfMonth: number) {
  return Math.min(dayOfMonth, new Date(year, monthIndex + 1, 0).getDate());
}

function buildOccurrenceDate(
  year: number,
  monthIndex: number,
  dayOfMonth: number
) {
  return new Date(
    year,
    monthIndex,
    clampDayOfMonth(year, monthIndex, dayOfMonth)
  );
}

function buildGeneratedTransactionId(ruleId: string, dateKey: string) {
  return `recurring-${ruleId}-${dateKey.replaceAll("-", "")}`;
}

function buildPendingOccurrenceDates(
  rule: RecurringTransactionRule,
  now: Date
) {
  const today = startOfLocalDay(now);
  const startDate = startOfLocalDay(rule.startDate.toDate());
  const endDate = rule.endDate ? startOfLocalDay(rule.endDate.toDate()) : null;
  const lastGeneratedDate = rule.lastGeneratedDateKey
    ? parseDateKey(rule.lastGeneratedDateKey)
    : null;
  const dates: Date[] = [];

  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  while (cursor <= lastMonth) {
    const occurrenceDate = buildOccurrenceDate(
      cursor.getFullYear(),
      cursor.getMonth(),
      rule.dayOfMonth
    );
    if (
      occurrenceDate >= startDate &&
      occurrenceDate <= today &&
      (!endDate || occurrenceDate <= endDate) &&
      (!lastGeneratedDate || occurrenceDate > lastGeneratedDate)
    ) {
      dates.push(occurrenceDate);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return dates;
}

export async function createRecurringTransactionRule(params: {
  householdId: string;
  type: TransactionType;
  amount: number;
  discountAmount?: number;
  categoryId: string;
  paymentMethod: string;
  paymentMethodId?: string | null;
  subject: string;
  note?: string;
  budgetApplied?: boolean;
  dayOfMonth: number;
  startDate: Date;
  endDate?: Date;
  lastGeneratedDateKey?: string;
  createdBy: string;
}) {
  const {
    householdId,
    startDate,
    endDate,
    ...rest
  } = params;
  return addDoc(recurringTransactionRulesCol(householdId), {
    ...stripUndefinedValues(rest),
    startDate: Timestamp.fromDate(startDate),
    endDate: endDate ? Timestamp.fromDate(endDate) : undefined,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateRecurringTransactionRule(params: {
  householdId: string;
  ruleId: string;
  type: TransactionType;
  amount: number;
  discountAmount?: number;
  categoryId: string;
  paymentMethod: string;
  paymentMethodId?: string | null;
  subject: string;
  note?: string;
  budgetApplied?: boolean;
  dayOfMonth: number;
  startDate: Date;
  endDate?: Date;
}) {
  const {
    householdId,
    ruleId,
    startDate,
    endDate,
    ...rest
  } = params;
  return updateDoc(
    doc(db, "households", householdId, "recurringTransactionRules", ruleId),
    {
      ...stripUndefinedValues(rest),
      startDate: Timestamp.fromDate(startDate),
      endDate: endDate ? Timestamp.fromDate(endDate) : deleteField(),
      updatedAt: serverTimestamp(),
    }
  );
}

export async function deleteRecurringTransactionRule(
  householdId: string,
  ruleId: string
) {
  return deleteDoc(
    doc(db, "households", householdId, "recurringTransactionRules", ruleId)
  );
}

export async function stopRecurringTransactionRule(
  householdId: string,
  ruleId: string,
  endDate = new Date()
) {
  return updateDoc(
    doc(db, "households", householdId, "recurringTransactionRules", ruleId),
    {
      endDate: Timestamp.fromDate(endDate),
      updatedAt: serverTimestamp(),
    }
  );
}

export async function getRecurringTransactionRule(
  householdId: string,
  ruleId: string
) {
  const snapshot = await getDoc(
    doc(db, "households", householdId, "recurringTransactionRules", ruleId)
  );
  if (!snapshot.exists()) {
    return null;
  }
  return {
    id: snapshot.id,
    ...(snapshot.data() as RecurringTransactionRule),
  };
}

export async function findSourceTransactionIdByRecurringRuleId(
  householdId: string,
  ruleId: string
) {
  const snapshot = await getDocs(
    query(transactionsCol(householdId), where("recurringRuleId", "==", ruleId))
  );
  return snapshot.docs[0]?.id ?? null;
}

export async function syncRecurringTransactionRules(
  householdId: string,
  now = new Date()
) {
  const snapshot = await getDocs(recurringTransactionRulesCol(householdId));
  if (snapshot.empty) {
    return;
  }

  for (const ruleDoc of snapshot.docs) {
    const rule = ruleDoc.data() as RecurringTransactionRule;
    const pendingDates = buildPendingOccurrenceDates(rule, now);
    if (pendingDates.length === 0) {
      continue;
    }

    const batch = writeBatch(db);
    pendingDates.forEach((date) => {
      const dateKey = toDateKey(date);
      const payload = {
        ...stripUndefinedValues({
          type: rule.type,
          amount: rule.amount,
          categoryId: rule.categoryId,
          paymentMethod: rule.paymentMethod,
          paymentMethodId: rule.paymentMethodId,
          subject: rule.subject,
          note: rule.note,
          budgetApplied: rule.budgetApplied ?? false,
          discountAmount: rule.discountAmount,
          createdBy: rule.createdBy,
          generatedFromRecurringRuleId: ruleDoc.id,
          recurringOccurrenceDateKey: dateKey,
        }),
        date: Timestamp.fromDate(date),
        monthKey: toMonthKey(date),
        createdAt: serverTimestamp(),
      };
      batch.set(
        doc(
          transactionsCol(householdId),
          buildGeneratedTransactionId(ruleDoc.id, dateKey)
        ),
        payload
      );
    });
    batch.update(ruleDoc.ref, {
      lastGeneratedDateKey: toDateKey(pendingDates[pendingDates.length - 1]),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }
}
