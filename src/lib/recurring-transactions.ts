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
import {
  hasPaymentMethodId,
  normalizePaymentMethodId,
  requirePaymentMethodId,
} from "@/lib/payment-method-resolver";
import { formatDate, toDateKey, toMonthKey } from "@/lib/time";
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

export function buildRecurringTransactionNote(
  note: string | undefined,
  date: Date,
  prependMonthToNote = false
) {
  const baseNote = note?.trim() ?? "";
  if (!prependMonthToNote) {
    return baseNote || undefined;
  }
  const monthLabel = formatDate(date, "M월");
  if (!baseNote) {
    return monthLabel;
  }
  return `${monthLabel} ${baseNote}`;
}

export function stripRecurringMonthPrefix(
  note: string | undefined,
  date: Date
) {
  const normalized = note?.trim() ?? "";
  if (!normalized) {
    return "";
  }
  const monthLabel = formatDate(date, "M월");
  if (normalized === monthLabel) {
    return "";
  }
  const prefix = `${monthLabel} `;
  if (normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length).trimStart();
  }
  return normalized;
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
  // 표시용 이름 스냅샷. 로직은 paymentMethodId만 쓴다.
  paymentMethod: string;
  paymentMethodId: string;
  subject: string;
  note?: string;
  prependMonthToNote?: boolean;
  budgetApplied?: boolean;
  dayOfMonth: number;
  startDate: Date;
  endDate?: Date;
  lastGeneratedDateKey?: string;
  createdBy: string;
}) {
  const paymentMethodId = requirePaymentMethodId(params.paymentMethodId);
  const {
    householdId,
    startDate,
    endDate,
    ...rest
  } = params;
  return addDoc(recurringTransactionRulesCol(householdId), {
    ...stripUndefinedValues(rest),
    paymentMethodId,
    startDate: Timestamp.fromDate(startDate),
    ...(endDate ? { endDate: Timestamp.fromDate(endDate) } : {}),
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
  // 표시용 이름 스냅샷. 로직은 paymentMethodId만 쓴다.
  paymentMethod: string;
  paymentMethodId: string;
  subject: string;
  note?: string;
  prependMonthToNote?: boolean;
  budgetApplied?: boolean;
  dayOfMonth: number;
  startDate: Date;
  endDate?: Date;
}) {
  const paymentMethodId = requirePaymentMethodId(params.paymentMethodId);
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
      paymentMethodId,
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
    // 결제수단 ID가 없는 규칙으로는 거래를 만들지 않는다. 이름만 있는 거래가
    // 다시 생기는 것을 막기 위해서다. lastGeneratedDateKey를 건드리지 않으므로
    // 설정 화면에서 결제수단을 다시 고르면 밀린 날짜가 한꺼번에 생성된다.
    if (!hasPaymentMethodId(rule.paymentMethodId)) {
      continue;
    }
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
          paymentMethodId: normalizePaymentMethodId(rule.paymentMethodId),
          subject: rule.subject,
          note: buildRecurringTransactionNote(
            rule.note,
            date,
            Boolean(rule.prependMonthToNote)
          ),
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
