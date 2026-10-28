import type { PaymentMethod, Transaction } from "@/types/ledger";

/**
 * 결제수단은 ID로만 식별한다.
 *
 * 결제수단 이름은 소유자별로 겹친다(남편·아내·우리 각각의 "현금" 등).
 * 그래서 집계·필터·선택 같은 로직에는 이름을 쓰지 않는다. 거래에 저장된
 * paymentMethod(이름)는 결제수단이 삭제됐을 때 보여줄 표시용 스냅샷일 뿐이다.
 */

const DELETED_PAYMENT_METHOD_LABEL = "삭제된 결제수단";

// 예전 버전이 저장해 둔 필터 값에 붙어 있을 수 있는 접두어.
const LEGACY_SELECTION_PREFIX = "legacy:";

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

/**
 * 결제수단 ID를 정규화한다. 공백만 있는 값은 ID가 없는 것으로 본다.
 *
 * ID 처리 규칙:
 * - 들어올 때: Firestore에서 읽은 ID는 이 함수로 정규화해서 상태에 넣는다
 * - 판정할 때: hasPaymentMethodId()로 판단한다
 * - 나갈 때: requirePaymentMethodId()가 돌려준 정규화된 값을 저장한다
 */
export function normalizePaymentMethodId(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function hasPaymentMethodId(value: string | null | undefined) {
  return normalizePaymentMethodId(value) !== "";
}

/**
 * 저장용 결제수단 ID. 없으면 예외를 던지고, 있으면 공백을 제거한 값을 돌려준다.
 * 결제수단 ID 없이 거래·반복 규칙을 저장하지 않는다. 이름은 소유자별로 겹치므로
 * ID가 없으면 어떤 결제수단인지 다시 알아낼 방법이 없다.
 */
export function requirePaymentMethodId(value: string | null | undefined) {
  const normalized = normalizePaymentMethodId(value);
  if (!normalized) {
    throw new Error("결제수단을 선택해주세요.");
  }
  return normalized;
}

/** 거래를 결제수단별로 묶을 때 쓰는 키. 결제수단 ID 그 자체이며, 없으면 빈 문자열. */
export function getTransactionPaymentMethodKey(
  transaction: Pick<Transaction, "paymentMethodId">
) {
  return normalizePaymentMethodId(transaction.paymentMethodId);
}

/**
 * 거래의 결제수단 표시 이름. ID로 찾고, 결제수단이 삭제돼 찾을 수 없으면
 * 거래에 저장된 이름 스냅샷을 보여준다.
 */
export function resolveTransactionPaymentMethodName(
  transaction: Pick<Transaction, "paymentMethod" | "paymentMethodId">,
  paymentMethodNameMap: Map<string, string>
) {
  const paymentMethodId = normalizePaymentMethodId(transaction.paymentMethodId);
  const resolvedName = paymentMethodId
    ? paymentMethodNameMap.get(paymentMethodId)
    : undefined;
  return formatPaymentMethodLabel(resolvedName ?? transaction.paymentMethod);
}

/** getTransactionPaymentMethodKey()로 만든 키의 표시 이름. */
export function getPaymentMethodLabelFromKey(
  key: string,
  paymentMethodNameMap: Map<string, string>
) {
  if (!key) {
    return formatPaymentMethodLabel("");
  }
  return formatPaymentMethodLabel(
    paymentMethodNameMap.get(key) ?? DELETED_PAYMENT_METHOD_LABEL
  );
}

/**
 * 결제수단 선택값(필터 등)을 ID 집합으로 바꾼다.
 *
 * 예전 버전은 필터에 결제수단 "이름"(또는 "legacy:이름")을 저장했다. 그런 값은
 * 같은 이름을 가진 결제수단 전부로 펼친다. 이름이 겹칠 때 예전 필터가 모두를
 * 포함했던 동작을 그대로 유지하기 위해서다. 알 수 없는 값은 버린다.
 */
export function expandPaymentMethodSelection(
  values: Iterable<string>,
  paymentMethods: Array<Pick<PaymentMethod, "name"> & { id: string }>
) {
  const ids = new Set(paymentMethods.map((method) => method.id));
  const result = new Set<string>();
  for (const raw of values) {
    if (ids.has(raw)) {
      result.add(raw);
      continue;
    }
    const legacyName = toLegacySelectionName(raw);
    paymentMethods.forEach((method) => {
      if (formatPaymentMethodLabel(method.name) === legacyName) {
        result.add(method.id);
      }
    });
  }
  return result;
}

/**
 * 저장된 결제수단 선택값 하나를 화면에 보여줄 이름으로 바꾼다.
 * - 결제수단 ID면 그 이름
 * - 예전 버전의 이름 값("현금", "legacy:현금")이면 접두어를 떼고 이름 그대로
 * - 둘 다 아니면 삭제된 결제수단의 ID로 본다
 */
export function describePaymentMethodSelection(
  value: string,
  paymentMethods: Array<Pick<PaymentMethod, "name"> & { id: string }>
) {
  const method = paymentMethods.find((candidate) => candidate.id === value);
  if (method) {
    return formatPaymentMethodLabel(method.name);
  }
  const legacyName = toLegacySelectionName(value);
  const isLegacyName =
    value.startsWith(LEGACY_SELECTION_PREFIX) ||
    paymentMethods.some(
      (candidate) => formatPaymentMethodLabel(candidate.name) === legacyName
    );
  return isLegacyName ? legacyName : DELETED_PAYMENT_METHOD_LABEL;
}

function toLegacySelectionName(value: string) {
  return formatPaymentMethodLabel(
    value.startsWith(LEGACY_SELECTION_PREFIX)
      ? value.slice(LEGACY_SELECTION_PREFIX.length)
      : value
  );
}
