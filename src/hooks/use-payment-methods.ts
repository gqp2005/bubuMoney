"use client";

import { orderBy, query } from "firebase/firestore";
import { paymentMethodsCol } from "@/lib/firebase/firestore";
import { createSharedCollection } from "@/hooks/internal/shared-collection";
import type { PaymentMethod } from "@/types/ledger";

type PaymentMethodWithId = PaymentMethod & { id: string };

const useSharedPaymentMethods = createSharedCollection<PaymentMethodWithId>(
  (householdId) =>
    query(paymentMethodsCol(householdId), orderBy("order", "asc")),
  (id, data) => ({ id, ...(data as PaymentMethod) })
);

export function usePaymentMethods(householdId: string | null) {
  const { items, loading } = useSharedPaymentMethods(householdId);
  return { paymentMethods: items, loading };
}
