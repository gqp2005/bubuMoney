"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { accountTradesCol } from "@/lib/firebase/firestore";
import type { InvestmentTrade } from "@/types/ledger";

type TradeWithId = InvestmentTrade & { id: string };

const EMPTY: TradeWithId[] = [];

export function useAccountTrades(
  householdId: string | null,
  accountId: string | null
) {
  const [received, setReceived] = useState<{
    key: string;
    items: TradeWithId[];
  } | null>(null);

  const subscriptionKey =
    householdId && accountId ? `${householdId}/${accountId}` : null;

  useEffect(() => {
    if (!householdId || !accountId) {
      return;
    }
    const key = `${householdId}/${accountId}`;
    const q = query(
      accountTradesCol(householdId, accountId),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReceived({
        key,
        items: snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as InvestmentTrade),
        })),
      });
    });

    return () => unsubscribe();
  }, [householdId, accountId]);

  const fresh = received && received.key === subscriptionKey ? received : null;
  const trades = fresh ? fresh.items : EMPTY;
  const loading = subscriptionKey ? fresh === null : false;

  return { trades, loading };
}
