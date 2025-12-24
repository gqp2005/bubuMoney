import type { Timestamp } from "firebase/firestore";

export type MemberRole = "owner" | "member";
export type TransactionType = "income" | "expense";

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
}

export interface Transaction {
  type: TransactionType;
  amount: number;
  categoryId: string;
  paymentMethod: "cash" | "card" | "transfer";
  recorder: "빵디" | "궁디";
  subject: "우리" | "남편" | "아내" | "처가댁" | "시댁";
  date: Timestamp;
  monthKey: string;
  note?: string;
  createdBy: string;
  createdAt: Timestamp;
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
}
