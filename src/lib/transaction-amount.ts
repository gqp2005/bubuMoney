import type { TransactionType } from "@/types/ledger";

type TransactionAmountLike = {
  type: TransactionType;
  amount: number;
  discountAmount?: number;
};

function toSafePositiveInt(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
}

export function getExpenseDiscountAmount(tx: TransactionAmountLike) {
  if (tx.type !== "expense") {
    return 0;
  }
  const amount = toSafePositiveInt(tx.amount);
  const discount = toSafePositiveInt(tx.discountAmount);
  return Math.min(discount, amount);
}

export function getEffectiveExpenseAmount(tx: TransactionAmountLike) {
  if (tx.type !== "expense") {
    return 0;
  }
  const amount = toSafePositiveInt(tx.amount);
  const discount = getExpenseDiscountAmount(tx);
  return Math.max(0, amount - discount);
}
