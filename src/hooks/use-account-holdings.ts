"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { accountHoldingsCol } from "@/lib/firebase/firestore";
import type { InvestmentHolding } from "@/types/ledger";

type HoldingWithId = InvestmentHolding & { id: string };

const EMPTY: HoldingWithId[] = [];

export function useAccountHoldings(
  householdId: string | null,
  accountId: string | null
) {
  const [received, setReceived] = useState<{
    key: string;
    items: HoldingWithId[];
  } | null>(null);

  // householdId와 accountId를 함께 묶어 구독 대상을 식별한다.
  const subscriptionKey = householdId && accountId ? `${householdId}/${accountId}` : null;

  useEffect(() => {
    if (!householdId || !accountId) {
      return;
    }
    const key = `${householdId}/${accountId}`;
    const q = query(
      accountHoldingsCol(householdId, accountId),
      orderBy("evluAmt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReceived({
        key,
        items: snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as InvestmentHolding),
        })),
      });
    });

    return () => unsubscribe();
  }, [householdId, accountId]);

  const fresh =
    received && received.key === subscriptionKey ? received : null;
  const holdings = fresh ? fresh.items : EMPTY;
  const loading = subscriptionKey ? fresh === null : false;

  return { holdings, loading };
}
