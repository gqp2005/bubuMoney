import { addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { paymentMethodsCol } from "@/lib/firebase/firestore";

export async function addPaymentMethod(
  householdId: string,
  data: {
    name: string;
    order: number;
    owner?: "husband" | "wife" | "our";
    parentId?: string | null;
    imported?: boolean;
    goalMonthly?: number;
  }
) {
  return addDoc(paymentMethodsCol(householdId), data);
}

export async function updatePaymentMethod(
  householdId: string,
  paymentMethodId: string,
  data: {
    name?: string;
    order?: number;
    owner?: "husband" | "wife" | "our";
    parentId?: string | null;
    imported?: boolean;
    goalMonthly?: number;
  }
) {
  return updateDoc(doc(paymentMethodsCol(householdId), paymentMethodId), data);
}

export async function deletePaymentMethod(
  householdId: string,
  paymentMethodId: string
) {
  return deleteDoc(doc(paymentMethodsCol(householdId), paymentMethodId));
}
