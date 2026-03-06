import type { TransactionType } from "@/types/ledger";

const UNDO_STORAGE_KEY = "couple-ledger.undo-action";

type TransactionDeleteUndoPayload = {
  transactionId: string;
  type: TransactionType;
  amount: number;
  discountAmount?: number;
  categoryId: string;
  paymentMethod: string;
  paymentMethodId?: string | null;
  subject: string;
  dateIso: string;
  note?: string;
  budgetApplied?: boolean;
  createdBy: string;
  createdAtIso?: string | null;
};

type MemoDeleteUndoPayload = {
  monthKey: string;
  entry: {
    id: string;
    text: string;
    createdAtIso?: string | null;
    createdBy?: string | null;
    visibleFromIso?: string | null;
    visibleUntilIso?: string | null;
  };
};

export type TransactionDeleteUndoAction = {
  kind: "transaction.delete";
  householdId: string;
  expiresAt: number;
  payload: TransactionDeleteUndoPayload;
};

export type MemoDeleteUndoAction = {
  kind: "memo.delete";
  householdId: string;
  expiresAt: number;
  payload: MemoDeleteUndoPayload;
};

export type PendingUndoAction =
  | TransactionDeleteUndoAction
  | MemoDeleteUndoAction;

export function savePendingUndoAction(action: PendingUndoAction) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(action));
}

export function loadPendingUndoAction() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(UNDO_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PendingUndoAction;
  } catch {
    window.sessionStorage.removeItem(UNDO_STORAGE_KEY);
    return null;
  }
}

export function clearPendingUndoAction(expectedKind?: PendingUndoAction["kind"]) {
  if (typeof window === "undefined") {
    return;
  }
  if (!expectedKind) {
    window.sessionStorage.removeItem(UNDO_STORAGE_KEY);
    return;
  }
  const current = loadPendingUndoAction();
  if (!current || current.kind === expectedKind) {
    window.sessionStorage.removeItem(UNDO_STORAGE_KEY);
  }
}

export function isPendingUndoExpired(action: PendingUndoAction) {
  return action.expiresAt <= Date.now();
}
