"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { categoriesCol } from "@/lib/firebase/firestore";
import type { Category } from "@/types/ledger";

export function useCategories(householdId: string | null) {
  const [categories, setCategories] = useState<(Category & { id: string })[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(categoriesCol(householdId), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Category),
      }));
      setCategories(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [householdId]);

  return { categories, loading };
}
