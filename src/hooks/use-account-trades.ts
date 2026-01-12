"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { accountTradesCol } from "@/lib/firebase/firestore";
import type { InvestmentTrade } from "@/types/ledger";

export function useAccountTrades(
  householdId: string | null,
  accountId: string | null
) {
  const [trades, setTrades] = useState<(InvestmentTrade & { id: string })[]>(
    []
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!householdId || !accountId) {
      setTrades([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      accountTradesCol(householdId, accountId),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as InvestmentTrade),
      }));
      setTrades(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [householdId, accountId]);

  return { trades, loading };
}

