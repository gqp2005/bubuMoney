"use client";

import { orderBy, query } from "firebase/firestore";
import { recurringTransactionRulesCol } from "@/lib/firebase/firestore";
import { createSharedCollection } from "@/hooks/internal/shared-collection";
import type { RecurringTransactionRule } from "@/types/ledger";

type RecurringRuleWithId = RecurringTransactionRule & { id: string };

const useSharedRecurringRules = createSharedCollection<RecurringRuleWithId>(
  (householdId) =>
    query(
      recurringTransactionRulesCol(householdId),
      orderBy("createdAt", "desc")
    ),
  (id, data) => ({ id, ...(data as RecurringTransactionRule) })
);

export function useRecurringTransactionRules(householdId: string | null) {
  const { items, loading } = useSharedRecurringRules(householdId);
  return { recurringRules: items, loading };
}
