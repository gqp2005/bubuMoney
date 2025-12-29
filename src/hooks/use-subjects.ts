"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { subjectsCol } from "@/lib/firebase/firestore";
import type { Subject } from "@/types/ledger";

export function useSubjects(householdId: string | null) {
  const [subjects, setSubjects] = useState<(Subject & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setSubjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(subjectsCol(householdId), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Subject),
      }));
      setSubjects(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [householdId]);

  return { subjects, loading };
}
