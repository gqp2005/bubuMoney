import { collection, doc } from "firebase/firestore";
import { db } from "./client";

export const householdDoc = (householdId: string) =>
  doc(db, "households", householdId);

export const membersCol = (householdId: string) =>
  collection(db, "households", householdId, "members");

export const invitesCol = (householdId: string) =>
  collection(db, "households", householdId, "invites");

export const categoriesCol = (householdId: string) =>
  collection(db, "households", householdId, "categories");

export const subjectsCol = (householdId: string) =>
  collection(db, "households", householdId, "subjects");

export const paymentMethodsCol = (householdId: string) =>
  collection(db, "households", householdId, "paymentMethods");

export const transactionsCol = (householdId: string) =>
  collection(db, "households", householdId, "transactions");

export const notificationsCol = (householdId: string) =>
  collection(db, "households", householdId, "notifications");

export const budgetsCol = (householdId: string) =>
  collection(db, "households", householdId, "budgets");

export const publicInvitesCol = () => collection(db, "publicInvites");
