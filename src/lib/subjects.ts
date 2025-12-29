import { addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { subjectsCol } from "@/lib/firebase/firestore";

export async function addSubject(
  householdId: string,
  data: { name: string; order: number; imported?: boolean }
) {
  return addDoc(subjectsCol(householdId), data);
}

export async function updateSubject(
  householdId: string,
  subjectId: string,
  data: { name?: string; order?: number; imported?: boolean }
) {
  return updateDoc(doc(subjectsCol(householdId), subjectId), data);
}

export async function deleteSubject(householdId: string, subjectId: string) {
  return deleteDoc(doc(subjectsCol(householdId), subjectId));
}
