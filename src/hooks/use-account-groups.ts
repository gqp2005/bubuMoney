"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { accountGroupsCol } from "@/lib/firebase/firestore";
import type { AccountGroup } from "@/types/ledger";

type AccountGroupWithId = AccountGroup & { id: string };

const EMPTY: AccountGroupWithId[] = [];

export function useAccountGroups(householdId: string | null) {
  const [received, setReceived] = useState<{
    key: string;
    items: AccountGroupWithId[];
  } | null>(null);

  useEffect(() => {
    if (!householdId) {
      return;
    }
    const q = query(accountGroupsCol(householdId), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReceived({
        key: householdId,
        items: snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as AccountGroup),
        })),
      });
    });

    return () => unsubscribe();
  }, [householdId]);

  const fresh = received && received.key === householdId ? received : null;
  const groups = fresh ? fresh.items : EMPTY;
  const loading = householdId ? fresh === null : false;

  return { groups, loading };
}
