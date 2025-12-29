import { addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { paymentMethodsCol } from "@/lib/firebase/firestore";

export async function addPaymentMethod(
  householdId: string,
  data: { name: string; order: number; imported?: boolean }
) {
  return addDoc(paymentMethodsCol(householdId), data);
}

export async function updatePaymentMethod(
  householdId: string,
  paymentMethodId: string,
  data: { name: string; imported?: boolean }
) {
  return updateDoc(doc(paymentMethodsCol(householdId), paymentMethodId), data);
}

export async function deletePaymentMethod(
  householdId: string,
  paymentMethodId: string
) {
  return deleteDoc(doc(paymentMethodsCol(householdId), paymentMethodId));
}
