"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { accountHoldingsCol } from "@/lib/firebase/firestore";
import type { InvestmentHolding } from "@/types/ledger";

export function useAccountHoldings(
  householdId: string | null,
  accountId: string | null
) {
  const [holdings, setHoldings] = useState<(InvestmentHolding & { id: string })[]>(
    []
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!householdId || !accountId) {
      setHoldings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      accountHoldingsCol(householdId, accountId),
      orderBy("evluAmt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as InvestmentHolding),
      }));
      setHoldings(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [householdId, accountId]);

  return { holdings, loading };
}
