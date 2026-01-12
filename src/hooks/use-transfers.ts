"use client";

import { Timestamp, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { transfersCol } from "@/lib/firebase/firestore";
import type { Transfer } from "@/types/ledger";

export function useTransfersRange(
  householdId: string | null,
  startDate: Date | null,
  endDate: Date | null
) {
  const [transfers, setTransfers] = useState<(Transfer & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const startTime = startDate ? startDate.getTime() : null;
  const endTime = endDate ? endDate.getTime() : null;

  useEffect(() => {
    if (!householdId || !startDate || !endDate) {
      setTransfers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      transfersCol(householdId),
      where("date", ">=", Timestamp.fromDate(startDate)),
      where("date", "<=", Timestamp.fromDate(endDate)),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Transfer),
      }));
      setTransfers(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [householdId, startTime, endTime]);

  return { transfers, loading };
}
