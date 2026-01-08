"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { categoriesCol } from "@/lib/firebase/firestore";
import type { Category } from "@/types/ledger";

type CachedCategories = {
  data: (Category & { id: string })[];
  loading: boolean;
  unsubscribe?: () => void;
  listeners: Set<(data: (Category & { id: string })[], loading: boolean) => void>;
};

const categoriesCache = new Map<string, CachedCategories>();

function getOrCreateEntry(householdId: string) {
  const existing = categoriesCache.get(householdId);
  if (existing) {
    return existing;
  }
  const entry: CachedCategories = {
    data: [],
    loading: true,
    listeners: new Set(),
  };
  const q = query(categoriesCol(householdId), orderBy("order", "asc"));
  entry.unsubscribe = onSnapshot(q, (snapshot) => {
    entry.data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Category),
    }));
    entry.loading = false;
    entry.listeners.forEach((listener) => listener(entry.data, entry.loading));
  });
  categoriesCache.set(householdId, entry);
  return entry;
}

export function useCategories(householdId: string | null) {
  const initial = useMemo(() => {
    if (!householdId) {
      return { data: [], loading: false };
    }
    const cached = categoriesCache.get(householdId);
    if (!cached) {
      return { data: [], loading: true };
    }
    return { data: cached.data, loading: cached.loading };
  }, [householdId]);
  const [categories, setCategories] = useState<(Category & { id: string })[]>(
    initial.data
  );
  const [loading, setLoading] = useState(initial.loading);

  useEffect(() => {
    if (!householdId) {
      setCategories([]);
      setLoading(false);
      return;
    }
    const entry = getOrCreateEntry(householdId);
    const listener = (data: (Category & { id: string })[], isLoading: boolean) => {
      setCategories(data);
      setLoading(isLoading);
    };
    entry.listeners.add(listener);
    listener(entry.data, entry.loading);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        entry.unsubscribe?.();
        categoriesCache.delete(householdId);
      }
    };
  }, [householdId]);

  return { categories, loading };
}
