import {
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { categoriesCol } from "@/lib/firebase/firestore";

function stripUndefinedValues<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export async function addCategory(
  householdId: string,
  data: {
    name: string;
    type: "income" | "expense" | "transfer";
    order: number;
    parentId?: string | null;
    imported?: boolean;
    budgetEnabled?: boolean;
    dotColor?: string;
    personalOnly?: boolean;
  }
) {
  return addDoc(categoriesCol(householdId), stripUndefinedValues(data));
}

export async function updateCategory(
  householdId: string,
  categoryId: string,
  data: {
    name?: string;
    type?: "income" | "expense" | "transfer";
    order?: number;
    parentId?: string | null;
    imported?: boolean;
    budgetEnabled?: boolean;
    dotColor?: string;
    personalOnly?: boolean;
  }
) {
  return updateDoc(
    doc(categoriesCol(householdId), categoryId),
    stripUndefinedValues(data)
  );
}

export async function deleteCategory(
  householdId: string,
  categoryId: string
) {
  return deleteDoc(doc(categoriesCol(householdId), categoryId));
}
