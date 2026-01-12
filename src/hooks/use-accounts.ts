"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { accountsCol } from "@/lib/firebase/firestore";
import type { Account } from "@/types/ledger";

export function useAccounts(householdId: string | null) {
  const [accounts, setAccounts] = useState<(Account & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(accountsCol(householdId), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Account),
      }));
      setAccounts(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [householdId]);

  return { accounts, loading };
}
