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
  personalOnly?: boolean;
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
  goalMonthly?: number | null;
}

export interface Account {
  name: string;
  type: "cash" | "bank" | "savings" | "investment" | "debt";
  order: number;
  balance: number;
  groupId?: string | null;
  kis?: {
    provider: "koreainvestment";
    market: "domestic" | "overseas";
    cano: string;
    acntPrdtCd: string;
    afhrFlprYn: "Y" | "N";
    inqrDvsn: "02";
    unprDvsn: "01";
    fundSttlIcldYn: "Y" | "N";
    fncgAmtAutoRdptYn: "Y" | "N";
    prcsDvsn: "00";
  };
  kisLastSyncedAt?: Timestamp;
  savingsKind?: "installment" | "deposit" | "cma" | "compound";
  interestType?: "simple" | "monthly_compound";
  interestRate?: number;
  monthlyDeposit?: number;
  startDate?: Timestamp;
  maturityDate?: Timestamp;
  taxType?: "standard";
  createdBy: string;
  createdAt: Timestamp;
}

export interface AccountGroup {
  name: string;
  order: number;
  visibility: "shared" | "personal";
  createdBy: string;
  createdAt: Timestamp;
}

export interface Transfer {
  fromAccountId?: string | null;
  toAccountId?: string | null;
  accountIds: string[];
  amount: number;
  date: Timestamp;
  monthKey: string;
  memo?: string;
  createdBy: string;
  createdAt: Timestamp;
}

export interface InvestmentTrade {
  accountId: string;
  type: "buy" | "sell";
  amount: number;
  date: Timestamp;
  memo?: string;
  createdBy: string;
  createdAt: Timestamp;
}

export interface InvestmentHolding {
  pdno: string;
  prdtName: string;
  hldgQty: number;
  pchsAvgPric: number;
  prpr: number;
  evluAmt: number;
  evluPflsAmt: number;
  evluPflsRt: number;
  syncedAt: Timestamp;
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
