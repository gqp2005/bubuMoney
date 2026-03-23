"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { recurringTransactionRulesCol } from "@/lib/firebase/firestore";
import type { RecurringTransactionRule } from "@/types/ledger";

type RecurringRuleWithId = RecurringTransactionRule & { id: string };

type CachedRecurringRules = {
  data: RecurringRuleWithId[];
  loading: boolean;
  unsubscribe?: () => void;
  listeners: Set<(data: RecurringRuleWithId[], loading: boolean) => void>;
};

const recurringRulesCache = new Map<string, CachedRecurringRules>();

function getOrCreateEntry(householdId: string) {
  const existing = recurringRulesCache.get(householdId);
  if (existing) {
    return existing;
  }
  const entry: CachedRecurringRules = {
    data: [],
    loading: true,
    listeners: new Set(),
  };
  const q = query(
    recurringTransactionRulesCol(householdId),
    orderBy("createdAt", "desc")
  );
  entry.unsubscribe = onSnapshot(q, (snapshot) => {
    entry.data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as RecurringTransactionRule),
    }));
    entry.loading = false;
    entry.listeners.forEach((listener) => listener(entry.data, entry.loading));
  });
  recurringRulesCache.set(householdId, entry);
  return entry;
}

export function useRecurringTransactionRules(householdId: string | null) {
  const initial = useMemo(() => {
    if (!householdId) {
      return { data: [], loading: false };
    }
    const cached = recurringRulesCache.get(householdId);
    if (!cached) {
      return { data: [], loading: true };
    }
    return { data: cached.data, loading: cached.loading };
  }, [householdId]);
  const [recurringRules, setRecurringRules] = useState<RecurringRuleWithId[]>(
    initial.data
  );
  const [loading, setLoading] = useState(initial.loading);
  const resolvedRecurringRules = householdId ? recurringRules : [];
  const resolvedLoading = householdId ? loading : false;

  useEffect(() => {
    if (!householdId) {
      return;
    }
    const entry = getOrCreateEntry(householdId);
    const listener = (data: RecurringRuleWithId[], isLoading: boolean) => {
      setRecurringRules(data);
      setLoading(isLoading);
    };
    entry.listeners.add(listener);
    listener(entry.data, entry.loading);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        entry.unsubscribe?.();
        recurringRulesCache.delete(householdId);
      }
    };
  }, [householdId]);

  return { recurringRules: resolvedRecurringRules, loading: resolvedLoading };
}
