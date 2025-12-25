"use client";

import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { transactionsCol } from "@/lib/firebase/firestore";
import { toMonthKey } from "@/lib/time";
import type { Transaction } from "@/types/ledger";

export function useMonthlyTransactions(
  householdId: string | null,
  monthKey = toMonthKey(new Date())
) {
  const [transactions, setTransactions] = useState<
    (Transaction & { id: string })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      transactionsCol(householdId),
      where("monthKey", "==", monthKey),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Transaction),
      }));
      setTransactions(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [householdId, monthKey]);

  const summary = useMemo(() => {
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
