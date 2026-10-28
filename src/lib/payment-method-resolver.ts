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

/**
 * getTransactionPaymentMethodKey()로 만든 키의 표시 이름.
 *
 * snapshotName은 그 키에 속한 거래에 저장된 결제수단 이름이다. 결제수단이 삭제돼
 * ID로 찾을 수 없을 때 "서울페이 (삭제됨)"처럼 원래 이름을 보여주는 데 쓴다.
 * "(삭제됨)"을 붙이는 이유: 같은 이름의 결제수단이 아직 있으면 두 줄이 똑같아 보인다.
 */
export function getPaymentMethodLabelFromKey(
  key: string,
  paymentMethodNameMap: Map<string, string>,
  snapshotName?: string | null
) {
  const snapshot = snapshotName?.trim() ? formatPaymentMethodLabel(snapshotName) : "";
  if (!key) {
    // ID가 없는 예전 거래: 저장된 이름이 있으면 그것을, 없으면 "미지정"
    return snapshot || formatPaymentMethodLabel("");
  }
  const name = paymentMethodNameMap.get(key);
  if (name !== undefined) {
    return formatPaymentMethodLabel(name);
  }
  return snapshot ? `${snapshot} (삭제됨)` : DELETED_PAYMENT_METHOD_LABEL;
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

export type PaymentOwnerLabels = Record<NonNullable<PaymentMethod["owner"]>, string>;

/**
 * 한 목록 안에서 이름이 겹치는 결제수단을 구분할 수 있게 이름을 보탠다.
 * 겹치는 항목에만 1~3단계를 차례로 적용하고, 4단계에서 이름을 확정한다.
 *
 * 1단계: 이름이 겹치면 소유자를 붙인다.   국민은행 → 국민은행 (궁디)
 * 2단계: 그래도 겹치면 상위 결제수단 이름을 붙인다.
 *                                          국민은행 (궁디) → 국민은행 (궁디 · 월급통장)
 * 3단계: 그래도 겹치면 순번을 붙인다.     현금 (궁디) → 현금 (궁디) #2
 *        순번은 화면에 보이는 구성 요소(이름·소유자 표시 이름·상위 이름)가 같은
 *        결제수단 전체를 설정 순서(order, 같으면 id)로 정렬해서 매긴다.
 *        화면에서 겹친 항목은 이 구성 요소도 같으므로 반드시 다른 번호를 받고,
 *        달마다 어떤 항목이 목록에 나오든 같은 결제수단은 같은 번호를 받는다.
 * 4단계(최종 배정): 설정 순서대로 한 항목씩 이름을 확정한다. 후보 이름이 이미
 *        쓰였으면(원래 이름 포함) #2, #3 … 중 비어 있는 첫 이름을 쓴다.
 *
 * 보장 (scripts/test-payment-method-resolver.mjs 의 속성 검사로 확인한다)
 * - 원래 목록에서 이름이 하나뿐인 항목은 예약되어 절대 바뀌지 않는다.
 * - 결과 이름은 모두 서로 다르다. 확정한 이름은 바로 '사용 중'에 추가되고,
 *   사용 중인 이름은 유한하므로 비어 있는 이름을 항상 찾을 수 있다.
 *
 * 목록 항목의 id는 결제수단 ID여야 한다(삭제된 결제수단이면 찾지 못할 수 있다).
 * 0원 항목을 빼는 등 화면에 실제로 보일 목록을 넘겨야 한다. (안 보이는 항목과
 * 겹친다고 판단하면 불필요한 소유자가 붙는다)
 */
export function disambiguatePaymentMethodNames<
  T extends { id: string; name: string },
>(
  items: T[],
  paymentMethods: Array<
    Pick<PaymentMethod, "name" | "owner" | "parentId" | "order"> & { id: string }
  >,
  ownerLabels: PaymentOwnerLabels
): T[] {
  type MethodLike = (typeof paymentMethods)[number];
  const byId = new Map(paymentMethods.map((method) => [method.id, method]));

  // 화면에 보이는 구성 요소. 소유자·상위는 ID가 아니라 표시되는 이름으로 본다.
  const ownerLabelOf = (method: MethodLike | undefined) =>
    method?.owner ? ownerLabels[method.owner] : "";
  const parentNameOf = (method: MethodLike | undefined) => {
    const parent = method?.parentId ? byId.get(method.parentId) : undefined;
    return parent ? formatPaymentMethodLabel(parent.name) : "";
  };
  const displayKey = (method: MethodLike) =>
    [
      formatPaymentMethodLabel(method.name),
      ownerLabelOf(method),
      parentNameOf(method),
    ].join("\u0000");
  // 설정 화면에서 보이는 순서: 상위 결제수단의 순서 → 자기 순서 → id.
  // (하위끼리는 자기 순서가 같은 경우가 많아, 상위 순서를 먼저 봐야 번호가 화면 순서와 맞는다)
  const parentOrderOf = (method: MethodLike) =>
    method.parentId ? (byId.get(method.parentId)?.order ?? 0) : 0;
  const byOrderThenId = (a: MethodLike, b: MethodLike) =>
    parentOrderOf(a) - parentOrderOf(b) ||
    (a.order ?? 0) - (b.order ?? 0) ||
    a.id.localeCompare(b.id);

  // 표시 구성 요소가 같은 결제수단 전체에서의 순번(1부터). 찾지 못하면 0.
  const displayRank = (id: string) => {
    const method = byId.get(id);
    if (!method) {
      return 0;
    }
    const key = displayKey(method);
    const sameLooking = paymentMethods
      .filter((candidate) => displayKey(candidate) === key)
      .sort(byOrderThenId);
    return sameLooking.length > 1
      ? sameLooking.findIndex((candidate) => candidate.id === id) + 1
      : 0;
  };

  // 설정 화면 순서. 찾지 못한 항목(삭제된 결제수단)은 뒤로, 그들끼리는 id 순.
  const listOrder = (a: number, b: number) => {
    const ma = byId.get(items[a].id);
    const mb = byId.get(items[b].id);
    if (ma && mb) {
      return byOrderThenId(ma, mb);
    }
    if (ma || mb) {
      return ma ? -1 : 1;
    }
    return items[a].id.localeCompare(items[b].id);
  };

  // 원래 이름이 목록에서 하나뿐인 항목은 예약한다. 이 이름들은 끝까지 바꾸지 않고,
  // 다른 항목이 같은 이름을 갖지 못하게 막는 데 쓴다.
  const nameCounts = new Map<string, number>();
  items.forEach((item) =>
    nameCounts.set(item.name, (nameCounts.get(item.name) ?? 0) + 1)
  );
  const reservedNames = new Set(
    items.filter((item) => nameCounts.get(item.name) === 1).map((item) => item.name)
  );
  const targets = items
    .map((_, index) => index)
    .filter((index) => (nameCounts.get(items[index].name) ?? 0) > 1);
  const labels = items.map((item) => item.name);

  // 겹침 판정: 이름을 보탤 항목끼리 같거나, 예약된 이름과 같으면 겹친 것으로 본다.
  // 각 단계는 판정 시점의 이름(스냅샷)을 기준으로 한다.
  const collisionCheck = () => {
    const counts = new Map<string, number>();
    targets.forEach((index) =>
      counts.set(labels[index], (counts.get(labels[index]) ?? 0) + 1)
    );
    return (label: string) =>
      (counts.get(label) ?? 0) > 1 || reservedNames.has(label);
  };

  // 1단계: 소유자 (겹치는 항목이므로 소유자가 있으면 붙인다)
  targets.forEach((index) => {
    const owner = ownerLabelOf(byId.get(items[index].id));
    if (owner) {
      labels[index] = `${items[index].name} (${owner})`;
    }
  });

  // 2단계: 상위 결제수단
  const collidesAfterOwner = collisionCheck();
  targets.forEach((index) => {
    if (!collidesAfterOwner(labels[index])) {
      return;
    }
    const method = byId.get(items[index].id);
    const parent = parentNameOf(method);
    if (!parent) {
      return;
    }
    const owner = ownerLabelOf(method);
    labels[index] = `${items[index].name} (${owner ? `${owner} · ${parent}` : parent})`;
  });

  // 3단계: 순번. 찾을 수 있는 결제수단은 표시 구성 요소 기준 순번(달이 바뀌어도
  // 같은 번호), 찾을 수 없는 것(삭제된 결제수단)은 목록 안 순서로 번호를 매긴다.
  const collidesAfterParent = collisionCheck();
  const beforeRank = [...labels];
  const unknownGroups = new Map<string, number[]>();
  targets.forEach((index) => {
    if (!collidesAfterParent(beforeRank[index])) {
      return;
    }
    const rank = displayRank(items[index].id);
    if (rank > 0) {
      labels[index] = `${beforeRank[index]} #${rank}`;
    } else if (!byId.has(items[index].id)) {
      const group = unknownGroups.get(beforeRank[index]) ?? [];
      group.push(index);
      unknownGroups.set(beforeRank[index], group);
    }
  });
  unknownGroups.forEach((group) => {
    if (group.length < 2) {
      return;
    }
    [...group].sort(listOrder).forEach((index, position) => {
      labels[index] = `${beforeRank[index]} #${position + 1}`;
    });
  });

  // 4단계: 최종 배정. 설정 순서대로 확정하고, 이미 쓰인 이름이면 비어 있는
  // 번호를 찾는다. 확정한 이름은 바로 사용 중에 넣으므로 결과는 항상 서로 다르다.
  const taken = new Set(reservedNames);
  [...targets].sort(listOrder).forEach((index) => {
    let label = labels[index];
    if (taken.has(label)) {
      const base = beforeRank[index];
      let n = 2;
      while (taken.has(`${base} #${n}`)) {
        n += 1;
      }
      label = `${base} #${n}`;
    }
    taken.add(label);
    labels[index] = label;
  });

  return items.map((item, index) =>
    labels[index] === item.name ? item : { ...item, name: labels[index] }
  );
}
