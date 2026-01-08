"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { subjectsCol } from "@/lib/firebase/firestore";
import type { Subject } from "@/types/ledger";

type CachedSubjects = {
  data: (Subject & { id: string })[];
  loading: boolean;
  unsubscribe?: () => void;
  listeners: Set<(data: (Subject & { id: string })[], loading: boolean) => void>;
};

const subjectsCache = new Map<string, CachedSubjects>();

function getOrCreateEntry(householdId: string) {
  const existing = subjectsCache.get(householdId);
  if (existing) {
    return existing;
  }
  const entry: CachedSubjects = {
    data: [],
    loading: true,
    listeners: new Set(),
  };
  const q = query(subjectsCol(householdId), orderBy("order", "asc"));
  entry.unsubscribe = onSnapshot(q, (snapshot) => {
    entry.data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Subject),
    }));
    entry.loading = false;
    entry.listeners.forEach((listener) => listener(entry.data, entry.loading));
  });
  subjectsCache.set(householdId, entry);
  return entry;
}

export function useSubjects(householdId: string | null) {
  const initial = useMemo(() => {
    if (!householdId) {
      return { data: [], loading: false };
    }
    const cached = subjectsCache.get(householdId);
    if (!cached) {
      return { data: [], loading: true };
    }
    return { data: cached.data, loading: cached.loading };
  }, [householdId]);
  const [subjects, setSubjects] = useState<(Subject & { id: string })[]>(
    initial.data
  );
  const [loading, setLoading] = useState(initial.loading);

  useEffect(() => {
    if (!householdId) {
      setSubjects([]);
      setLoading(false);
      return;
    }
    const entry = getOrCreateEntry(householdId);
    const listener = (data: (Subject & { id: string })[], isLoading: boolean) => {
      setSubjects(data);
      setLoading(isLoading);
    };
    entry.listeners.add(listener);
    listener(entry.data, entry.loading);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        entry.unsubscribe?.();
        subjectsCache.delete(householdId);
      }
    };
  }, [householdId]);

  return { subjects, loading };
}
