"use client";

import { orderBy, query } from "firebase/firestore";
import { categoriesCol } from "@/lib/firebase/firestore";
import { createSharedCollection } from "@/hooks/internal/shared-collection";
import type { Category } from "@/types/ledger";

type CategoryWithId = Category & { id: string };

const useSharedCategories = createSharedCollection<CategoryWithId>(
  (householdId) => query(categoriesCol(householdId), orderBy("order", "asc")),
  (id, data) => ({ id, ...(data as Category) })
);

export function useCategories(householdId: string | null) {
  const { items, loading } = useSharedCategories(householdId);
  return { categories: items, loading };
}
