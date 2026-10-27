"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { accountsCol } from "@/lib/firebase/firestore";
import type { Account } from "@/types/ledger";

type AccountWithId = Account & { id: string };

// 빈 결과는 매번 새 배열을 만들지 않는다. 호출부의 useMemo 의존성이 안정된다.
const EMPTY: AccountWithId[] = [];

export function useAccounts(householdId: string | null) {
  const [received, setReceived] = useState<{
    key: string;
    items: AccountWithId[];
  } | null>(null);

  useEffect(() => {
    if (!householdId) {
      return;
    }
    const q = query(accountsCol(householdId), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReceived({
        key: householdId,
        items: snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Account),
        })),
      });
    });

    return () => unsubscribe();
  }, [householdId]);

  // householdId가 바뀌면 이전 가계부의 데이터는 버리고 다시 로딩으로 본다.
  const fresh = received && received.key === householdId ? received : null;
  const accounts = fresh ? fresh.items : EMPTY;
  const loading = householdId ? fresh === null : false;

  return { accounts, loading };
}
