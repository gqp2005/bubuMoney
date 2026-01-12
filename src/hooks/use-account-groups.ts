"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { accountGroupsCol } from "@/lib/firebase/firestore";
import type { AccountGroup } from "@/types/ledger";

export function useAccountGroups(householdId: string | null) {
  const [groups, setGroups] = useState<(AccountGroup & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(accountGroupsCol(householdId), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as AccountGroup),
      }));
      setGroups(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [householdId]);

  return { groups, loading };
}
