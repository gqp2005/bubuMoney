"use client";

import {
  Timestamp,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { transactionsCol } from "@/lib/firebase/firestore";
import { toMonthKey } from "@/lib/time";
import type { Transaction } from "@/types/ledger";

type TransactionWithId = Transaction & { id: string };

const EMPTY: TransactionWithId[] = [];
const EMPTY_SUMMARY = {
  income: 0,
  expense: 0,
  balance: 0,
  byCategory: {} as Record<string, number>,
};

export function useMonthlyTransactions(
  householdId: string | null,
  monthKey = toMonthKey(new Date())
) {
  const [received, setReceived] = useState<{
    key: string;
    items: TransactionWithId[];
  } | null>(null);

  const subscriptionKey = householdId ? `${householdId}/${monthKey}` : null;

  useEffect(() => {
    if (!householdId) {
      return;
    }
    const key = `${householdId}/${monthKey}`;
    const q = query(
      transactionsCol(householdId),
      where("monthKey", "==", monthKey),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReceived({
        key,
        items: snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Transaction),
        })),
      });
    });

    return () => unsubscribe();
  }, [householdId, monthKey]);

  // 구독 대상이 바뀌면 이전 결과는 버린다.
  const fresh = received && received.key === subscriptionKey ? received : null;
  const transactions = fresh ? fresh.items : EMPTY;
  const loading = subscriptionKey ? fresh === null : false;

  const summary = useMemo(() => {
    if (transactions.length === 0) {
      return EMPTY_SUMMARY;
    }
    let income = 0;
    let expense = 0;
    const byCategory: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.type === "income") {
        income += tx.amount;
        byCategory[tx.categoryId] = (byCategory[tx.categoryId] ?? 0) + tx.amount;
      } else if (tx.type === "expense") {
        expense += tx.amount;
        byCategory[tx.categoryId] = (byCategory[tx.categoryId] ?? 0) + tx.amount;
      }
    });
    return { income, expense, balance: income - expense, byCategory };
  }, [transactions]);

  return { transactions, summary, loading, monthKey };
}

export function useTransactionsRange(
  householdId: string | null,
  startDate: Date | null,
  endDate: Date | null
) {
  const [received, setReceived] = useState<{
    key: string;
    items: TransactionWithId[];
  } | null>(null);

  // Date 객체는 매 렌더마다 새로 생길 수 있으므로 숫자로 바꿔 비교한다.
  const startTime = startDate ? startDate.getTime() : null;
  const endTime = endDate ? endDate.getTime() : null;
  const subscriptionKey =
    householdId && startTime !== null && endTime !== null
      ? `${householdId}/${startTime}/${endTime}`
      : null;

  useEffect(() => {
    if (!householdId || startTime === null || endTime === null) {
      return;
    }
    const key = `${householdId}/${startTime}/${endTime}`;
    const q = query(
      transactionsCol(householdId),
      where("date", ">=", Timestamp.fromMillis(startTime)),
      where("date", "<=", Timestamp.fromMillis(endTime)),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReceived({
        key,
        items: snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Transaction),
        })),
      });
    });

    return () => unsubscribe();
  }, [householdId, startTime, endTime]);

  const fresh = received && received.key === subscriptionKey ? received : null;
  const transactions = fresh ? fresh.items : EMPTY;
  const loading = subscriptionKey ? fresh === null : false;

  return { transactions, loading };
}
