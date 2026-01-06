import type { Timestamp } from "firebase/firestore";

export type MemberRole = "owner" | "member";
export type TransactionType = "income" | "expense" | "transfer";

export interface Household {
  name: string;
  createdAt: Timestamp;
  membersCount: number;
}

export interface HouseholdMember {
  role: MemberRole;
  invitedBy?: string;
  createdAt: Timestamp;
}

export interface InviteCode {
  code: string;
  createdBy: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  usedBy?: string;
}

export interface Category {
  name: string;
  type: TransactionType;
  order: number;
  parentId?: string | null;
  imported?: boolean;
  budgetEnabled?: boolean;
}

export interface Transaction {
  type: TransactionType;
  amount: number;
  categoryId: string;
  paymentMethod: string;
  subject: string;
  date: Timestamp;
  monthKey: string;
  note?: string;
  budgetApplied?: boolean;
  createdBy: string;
  createdAt: Timestamp;
}

export interface Subject {
  name: string;
  order: number;
  imported?: boolean;
}

export interface PaymentMethod {
  name: string;
  order: number;
  owner?: "husband" | "wife" | "our";
  parentId?: string | null;
  imported?: boolean;
}

export interface Budget {
  monthKey: string;
  total: number;
  byCategory?: Record<string, number>;
  createdAt: Timestamp;
}

export interface UserProfile {
  householdId: string;
  createdAt: Timestamp;
  displayName?: string;
  spouseRole?: "husband" | "wife" | null;
}
