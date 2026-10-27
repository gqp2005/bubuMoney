"use client";

import { orderBy, query } from "firebase/firestore";
import { subjectsCol } from "@/lib/firebase/firestore";
import { createSharedCollection } from "@/hooks/internal/shared-collection";
import type { Subject } from "@/types/ledger";

type SubjectWithId = Subject & { id: string };

const useSharedSubjects = createSharedCollection<SubjectWithId>(
  (householdId) => query(subjectsCol(householdId), orderBy("order", "asc")),
  (id, data) => ({ id, ...(data as Subject) })
);

export function useSubjects(householdId: string | null) {
  const { items, loading } = useSharedSubjects(householdId);
  return { subjects: items, loading };
}
