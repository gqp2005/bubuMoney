import {
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { categoriesCol } from "@/lib/firebase/firestore";

export async function addCategory(
  householdId: string,
  data: {
    name: string;
    type: "income" | "expense" | "transfer";
    order: number;
    parentId?: string | null;
  }
) {
  return addDoc(categoriesCol(householdId), data);
}

export async function updateCategory(
  householdId: string,
  categoryId: string,
  data: {
    name: string;
    type: "income" | "expense" | "transfer";
    parentId?: string | null;
  }
) {
  return updateDoc(doc(categoriesCol(householdId), categoryId), data);
}

export async function deleteCategory(
  householdId: string,
  categoryId: string
) {
  return deleteDoc(doc(categoriesCol(householdId), categoryId));
}
