"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { paymentMethodsCol } from "@/lib/firebase/firestore";
import type { PaymentMethod } from "@/types/ledger";

type CachedPaymentMethods = {
  data: (PaymentMethod & { id: string })[];
  loading: boolean;
  unsubscribe?: () => void;
  listeners: Set<
    (data: (PaymentMethod & { id: string })[], loading: boolean) => void
  >;
};

const paymentMethodsCache = new Map<string, CachedPaymentMethods>();

function getOrCreateEntry(householdId: string) {
  const existing = paymentMethodsCache.get(householdId);
  if (existing) {
    return existing;
  }
  const entry: CachedPaymentMethods = {
    data: [],
    loading: true,
    listeners: new Set(),
  };
  const q = query(paymentMethodsCol(householdId), orderBy("order", "asc"));
  entry.unsubscribe = onSnapshot(q, (snapshot) => {
    entry.data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as PaymentMethod),
    }));
    entry.loading = false;
    entry.listeners.forEach((listener) => listener(entry.data, entry.loading));
  });
  paymentMethodsCache.set(householdId, entry);
  return entry;
}

export function usePaymentMethods(householdId: string | null) {
  const initial = useMemo(() => {
    if (!householdId) {
      return { data: [], loading: false };
    }
    const cached = paymentMethodsCache.get(householdId);
    if (!cached) {
      return { data: [], loading: true };
    }
    return { data: cached.data, loading: cached.loading };
  }, [householdId]);
  const [paymentMethods, setPaymentMethods] = useState<
    (PaymentMethod & { id: string })[]
  >(initial.data);
  const [loading, setLoading] = useState(initial.loading);

  useEffect(() => {
    if (!householdId) {
      setPaymentMethods([]);
      setLoading(false);
      return;
    }
    const entry = getOrCreateEntry(householdId);
    const listener = (
      data: (PaymentMethod & { id: string })[],
      isLoading: boolean
    ) => {
      setPaymentMethods(data);
      setLoading(isLoading);
    };
    entry.listeners.add(listener);
    listener(entry.data, entry.loading);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        entry.unsubscribe?.();
        paymentMethodsCache.delete(householdId);
      }
    };
  }, [householdId]);

  return { paymentMethods, loading };
}
