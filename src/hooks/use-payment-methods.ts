"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { paymentMethodsCol } from "@/lib/firebase/firestore";
import type { PaymentMethod } from "@/types/ledger";

export function usePaymentMethods(householdId: string | null) {
  const [paymentMethods, setPaymentMethods] = useState<
    (PaymentMethod & { id: string })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setPaymentMethods([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(paymentMethodsCol(householdId), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as PaymentMethod),
      }));
      setPaymentMethods(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [householdId]);

  return { paymentMethods, loading };
}
