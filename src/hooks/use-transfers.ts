"use client";

import { Timestamp, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { transfersCol } from "@/lib/firebase/firestore";
import type { Transfer } from "@/types/ledger";

type TransferWithId = Transfer & { id: string };

const EMPTY: TransferWithId[] = [];

export function useTransfersRange(
  householdId: string | null,
  startDate: Date | null,
  endDate: Date | null
) {
  const [received, setReceived] = useState<{
    key: string;
    items: TransferWithId[];
  } | null>(null);

  // Date 객체는 매 렌더마다 새로 생길 수 있으므로 숫자로 바꿔 비교한다.
  const startTime = startDate ? startDate.getTime() : null;
  const endTime = endDate ? endDate.getTime() : null;
  const subscriptionKey =
    householdId && startTime !== null && endTime !== null
      ? `${householdId}/${startTime}/${endTime}`
      : null;

  useEffect(() => {
    if (!householdId || startTime === null || endTime === null) {
      return;
    }
    const key = `${householdId}/${startTime}/${endTime}`;
    const q = query(
      transfersCol(householdId),
      where("date", ">=", Timestamp.fromMillis(startTime)),
      where("date", "<=", Timestamp.fromMillis(endTime)),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReceived({
        key,
        items: snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Transfer),
        })),
      });
    });

    return () => unsubscribe();
  }, [householdId, startTime, endTime]);

  const fresh = received && received.key === subscriptionKey ? received : null;
  const transfers = fresh ? fresh.items : EMPTY;
  const loading = subscriptionKey ? fresh === null : false;

  return { transfers, loading };
}
