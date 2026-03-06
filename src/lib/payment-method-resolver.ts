import type { PaymentMethod, Transaction } from "@/types/ledger";

const LEGACY_PAYMENT_METHOD_KEY_PREFIX = "legacy:";

type PaymentMethodLike = Pick<PaymentMethod, "name" | "owner"> & { id: string };

export function formatPaymentMethodLabel(value?: string | null) {
  const normalized = (value ?? "").trim();
  if (normalized === "cash") {
    return "현금";
  }
  if (normalized === "card") {
    return "카드";
  }
  if (normalized === "transfer") {
    return "계좌이체";
  }
  return normalized || "미지정";
}

export function buildPaymentMethodNameMap(
  paymentMethods: Array<Pick<PaymentMethod, "name"> & { id: string }>
) {
  return new Map(paymentMethods.map((method) => [method.id, method.name]));
}

export function getLegacyPaymentMethodKey(name?: string | null) {
  return `${LEGACY_PAYMENT_METHOD_KEY_PREFIX}${formatPaymentMethodLabel(name)}`;
}

export function getTransactionPaymentMethodKey(
  transaction: Pick<Transaction, "paymentMethod" | "paymentMethodId">
) {
  const paymentMethodId = transaction.paymentMethodId?.trim();
  if (paymentMethodId) {
    return paymentMethodId;
  }
  return getLegacyPaymentMethodKey(transaction.paymentMethod);
}

export function resolveTransactionPaymentMethodName(
  transaction: Pick<Transaction, "paymentMethod" | "paymentMethodId">,
  paymentMethodNameMap: Map<string, string>
) {
  if (transaction.paymentMethodId) {
    const resolvedName = paymentMethodNameMap.get(transaction.paymentMethodId);
    if (resolvedName) {
      return formatPaymentMethodLabel(resolvedName);
    }
  }
  return formatPaymentMethodLabel(transaction.paymentMethod);
}

export function getPaymentMethodLabelFromKey(
  key: string,
  paymentMethodNameMap: Map<string, string>
) {
  if (key.startsWith(LEGACY_PAYMENT_METHOD_KEY_PREFIX)) {
    return formatPaymentMethodLabel(
      key.slice(LEGACY_PAYMENT_METHOD_KEY_PREFIX.length)
    );
  }
  return formatPaymentMethodLabel(paymentMethodNameMap.get(key) ?? key);
}

export function findPaymentMethodByName(
  paymentMethods: PaymentMethodLike[],
  name: string,
  preferredOwner?: PaymentMethod["owner"] | null
) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return null;
  }
  const candidates = paymentMethods.filter(
    (method) => method.name.trim() === trimmedName
  );
  if (candidates.length === 0) {
    return null;
  }
  if (preferredOwner) {
    const preferred = candidates.find((method) => method.owner === preferredOwner);
    if (preferred) {
      return preferred;
    }
  }
  return candidates[0] ?? null;
}
