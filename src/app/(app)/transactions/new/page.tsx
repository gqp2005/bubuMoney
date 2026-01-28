"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDoc } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useSubjects } from "@/hooks/use-subjects";
import { formatKrw } from "@/lib/format";
import { householdDoc } from "@/lib/firebase/firestore";
import { addNotification } from "@/lib/notifications";
import { addTransaction } from "@/lib/transactions";
import { toDateKey } from "@/lib/time";
import type { TransactionType } from "@/types/ledger";

type PaymentOwner = "husband" | "wife" | "our";

export default function NewTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { householdId, displayName, spouseRole } = useHousehold();
  const { categories } = useCategories(householdId);
  const { subjects } = useSubjects(householdId);
  const { paymentMethods } = usePaymentMethods(householdId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TransactionType>("expense");
  const [subject, setSubject] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentOwner, setPaymentOwner] = useState<PaymentOwner>("our");
  const [amountInput, setAmountInput] = useState("");
  const hasSetInitialOwner = useRef(false);
  const [partnerName, setPartnerName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [budgetApplied, setBudgetApplied] = useState(false);
  const [budgetExcluded, setBudgetExcluded] = useState(false);
  const [isTypeSheetOpen, setIsTypeSheetOpen] = useState(false);
  const [isSubjectSheetOpen, setIsSubjectSheetOpen] = useState(false);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);
  const [expandedCategoryParentIds, setExpandedCategoryParentIds] = useState<
    Set<string>
  >(() => new Set());
  const [expandedPaymentParentId, setExpandedPaymentParentId] = useState<
    string | null
  >(null);
  const today = toDateKey(new Date());
  const defaultDate = searchParams.get("date") ?? today;
  const hasCategories = categories.length > 0;
  const typeLabelMap: Record<TransactionType, string> = {
    expense: "지출",
    income: "수입",
    transfer: "이체",
  };
  const typeOptions: { value: TransactionType; label: string }[] = [
    { value: "expense", label: "지출" },
    { value: "income", label: "수입" },
    { value: "transfer", label: "이체" },
  ];

  function formatAmountValue(value: string) {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) {
      return "";
    }
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function parseAmountValue(value: string) {
    return Number(value.replace(/,/g, ""));
  }

  const selectedCategory = useMemo(() => {
    return categories.find((category) => category.id === categoryId) ?? null;
  }, [categories, categoryId]);
  const selectedCategoryName = selectedCategory?.name ?? "";
  const selectedCategoryBudgetEnabled = Boolean(
    selectedCategory?.type === "expense" && selectedCategory?.budgetEnabled
  );

  const spouseName = displayName?.trim() || "";
  const partnerTrimmed = partnerName.trim();
  const husbandLabel =
    spouseRole === "wife"
      ? partnerTrimmed || "남편"
      : spouseName || "남편";
  const wifeLabel =
    spouseRole === "wife" ? spouseName || "아내" : partnerTrimmed || "아내";

  const categoryParents = useMemo(() => {
    return categories
      .filter((cat) => cat.type === type && !cat.parentId)
      .sort((a, b) => a.order - b.order);
  }, [categories, type]);
  const categoryChildrenByParent = useMemo(() => {
    const map = new Map<string, typeof categories>();
    categories
      .filter((cat) => cat.type === type && cat.parentId)
      .forEach((child) => {
        const bucket = map.get(child.parentId ?? "") ?? [];
        bucket.push(child);
        map.set(child.parentId ?? "", bucket);
      });
    map.forEach((list) => list.sort((a, b) => a.order - b.order));
    return map;
  }, [categories, type]);
  const categoryOptions = useMemo(() => {
    const children = categories.filter((cat) => cat.type === type && cat.parentId);
    return children.length ? children : categoryParents;
  }, [categories, type, categoryParents]);

  useEffect(() => {
    if (categoryParents.length === 0) {
      setExpandedCategoryParentIds(new Set());
      return;
    }
    setExpandedCategoryParentIds(new Set(categoryParents.map((parent) => parent.id)));
  }, [categoryParents]);

  const paymentGrouped = useMemo(() => {
    const byOwner: Record<
      PaymentOwner,
      { parents: typeof paymentMethods; children: typeof paymentMethods }
    > = {
      husband: { parents: [], children: [] },
      wife: { parents: [], children: [] },
      our: { parents: [], children: [] },
    };
    paymentMethods.forEach((method) => {
      const owner = method.owner ?? "our";
      if (method.parentId) {
        byOwner[owner].children.push(method);
      } else {
        byOwner[owner].parents.push(method);
      }
    });
    return byOwner;
  }, [paymentMethods]);

  useEffect(() => {
    if (!householdId) {
      setPartnerName("");
      return;
    }
    getDoc(householdDoc(householdId)).then((snapshot) => {
      if (!snapshot.exists()) {
        return;
      }
      const data = snapshot.data() as {
        creatorDisplayName?: string | null;
        partnerDisplayName?: string | null;
      };
      const creatorName = data.creatorDisplayName ?? "";
      const partnerDisplayName = data.partnerDisplayName ?? "";
      const currentName = (displayName ?? "").trim();
      if (currentName && creatorName && currentName === creatorName) {
        setPartnerName(partnerDisplayName);
      } else if (
        currentName &&
        partnerDisplayName &&
        currentName === partnerDisplayName
      ) {
        setPartnerName(creatorName);
      } else {
        setPartnerName(partnerDisplayName);
      }
    });
  }, [displayName, householdId]);

  useEffect(() => {
    if (subject || subjects.length === 0) {
      return;
    }
    const baseName = (displayName ?? "").trim();
    const matched = baseName
      ? subjects.find((item) => item.name === baseName)
      : null;
    setSubject(matched?.name ?? subjects[0].name);
  }, [displayName, subject, subjects]);

  useEffect(() => {
    if (hasSetInitialOwner.current) {
      return;
    }
    if (spouseRole === "husband" || spouseRole === "wife") {
      setPaymentOwner(spouseRole);
      hasSetInitialOwner.current = true;
    }
  }, [spouseRole]);

  useEffect(() => {
    const ownerParents = paymentGrouped[paymentOwner]?.parents ?? [];
    if (!paymentMethod && ownerParents.length > 0) {
      setPaymentMethod(ownerParents[0].name);
    }
  }, [paymentGrouped, paymentMethod, paymentOwner]);

  useEffect(() => {
    const ownerMethods = [
      ...paymentGrouped[paymentOwner].parents,
      ...paymentGrouped[paymentOwner].children,
    ];
    if (!paymentMethod) {
      return;
    }
    if (ownerMethods.length > 0 && !ownerMethods.some((m) => m.name === paymentMethod)) {
      setPaymentMethod(ownerMethods[0].name);
    }
  }, [paymentGrouped, paymentMethod, paymentOwner]);

  useEffect(() => {
    if (categoryOptions.length === 0) {
      return;
    }
    if (!categoryId) {
      setCategoryId(categoryOptions[0].id);
      return;
    }
    if (!categoryOptions.some((cat) => cat.id === categoryId)) {
      setCategoryId(categoryOptions[0].id);
    }
  }, [categoryId, categoryOptions]);

  useEffect(() => {
    if (!selectedCategoryBudgetEnabled) {
      setBudgetApplied(false);
    }
  }, [selectedCategoryBudgetEnabled]);

  useEffect(() => {
    if (type !== "expense" && budgetExcluded) {
      setBudgetExcluded(false);
    }
  }, [budgetExcluded, type]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !householdId) {
      return;
    }
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const amount = parseAmountValue(amountInput);
    const date = String(formData.get("date") ?? "");
    const note = String(formData.get("note") ?? "");
    const subjectValue = subject || subjects[0]?.name || "우리";
    const paymentValue = paymentMethod || "현금";
    if (!amount || !categoryId || !date) {
      setError("필수 항목을 모두 입력해주세요.");
      setLoading(false);
      return;
    }
    try {
      await addTransaction({
        householdId,
        type,
        amount,
        categoryId,
        paymentMethod: paymentValue,
        subject: subjectValue,
        date: new Date(date),
        note: note.length ? note : undefined,
        budgetApplied,
        budgetExcluded: type === "expense" ? budgetExcluded : false,
        createdBy: user.uid,
      });
      const memoText = note.trim() || "메모 없음";
      if (!selectedCategory?.personalOnly) {
        await addNotification(householdId, {
          title: "내역 추가",
          message: `${typeLabelMap[type]} ${formatKrw(amount)} • ${
            selectedCategoryName || "미분류"
          } • ${memoText} • ${date}`,
          level: "success",
          type: "transaction.create",
        });
      }
      router.replace(`/transactions?date=${date}`);
    } catch (err) {
      setError("저장에 실패했습니다. 입력값을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 ios-no-zoom">
      <form
        className="rounded-3xl border border-[var(--border)] bg-white p-6"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4">
          <label className="text-sm font-medium">
            날짜
            <input
              type="date"
              name="date"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              defaultValue={defaultDate}
            />
          </label>
          <div className="grid grid-cols-[0.3fr_0.7fr] gap-3">
            <label className="text-sm font-medium">
              유형
              <button
                type="button"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm"
                onClick={() => setIsTypeSheetOpen(true)}
              >
                {typeLabelMap[type]}
              </button>
            </label>
            <label className="text-sm font-medium">
              금액
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
                placeholder="0"
                value={amountInput}
                onChange={(event) =>
                  setAmountInput(formatAmountValue(event.target.value))
                }
              />
            </label>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">주체</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex-1 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm disabled:opacity-60"
                onClick={() => setIsSubjectSheetOpen(true)}
                disabled={subjects.length === 0}
              >
                {subject || "선택"}
              </button>
              {type === "expense" ? (
                <label className="flex items-center gap-2 text-sm text-[color:rgba(45,38,34,0.8)]">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-[var(--border)]"
                    checked={budgetExcluded}
                    onChange={(event) => setBudgetExcluded(event.target.checked)}
                  />
                  예산 제외
                </label>
              ) : null}
            </div>
          </div>
          <label className="text-sm font-medium">
            카테고리
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm disabled:opacity-60"
              onClick={() => setIsCategorySheetOpen(true)}
              disabled={!hasCategories}
            >
              {selectedCategoryName || "선택"}
            </button>
            {!hasCategories ? (
              <span className="mt-2 block text-xs text-[color:rgba(45,38,34,0.6)]">
                카테고리를 먼저 추가해주세요.
              </span>
            ) : null}
          </label>
          {selectedCategoryBudgetEnabled && type === "expense" ? (
            <label className="flex items-center gap-2 text-sm text-[color:rgba(45,38,34,0.8)]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[var(--border)]"
                checked={budgetApplied}
                onChange={(event) => setBudgetApplied(event.target.checked)}
              />
              예산으로 처리
            </label>
          ) : null}
          <label className="text-sm font-medium">
            결제수단
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm disabled:opacity-60"
              onClick={() => setIsPaymentSheetOpen(true)}
              disabled={paymentMethods.length === 0}
            >
              {paymentMethod || "선택"}
            </button>
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium">
          메모
          <input
            type="text"
            name="note"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            placeholder="선택 입력"
          />
        </label>
        <button
          type="submit"
          className="mt-6 rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-70"
          disabled={loading}
        >
          {loading ? "저장 중.." : "저장"}
        </button>
      </form>
      {isTypeSheetOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsTypeSheetOpen(false)}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-3xl bg-white p-6">
            <h2 className="text-sm font-semibold">유형 선택</h2>
            <div className="mt-4 grid gap-2">
              {typeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${
                    type === option.value
                      ? "border-[var(--accent)] bg-[color:rgba(145,102,82,0.12)]"
                      : "border-[var(--border)] bg-white"
                  }`}
                  onClick={() => {
                    setType(option.value);
                    setIsTypeSheetOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {isSubjectSheetOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsSubjectSheetOpen(false)}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-3xl bg-white p-6">
            <h2 className="text-sm font-semibold">주체 선택</h2>
            <div className="mt-4 max-h-[55vh] grid gap-2 overflow-y-auto pr-1">
              {subjects.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${
                    subject === item.name
                      ? "border-[var(--accent)] bg-[color:rgba(145,102,82,0.12)]"
                      : "border-[var(--border)] bg-white"
                  }`}
                  onClick={() => {
                    setSubject(item.name);
                    setIsSubjectSheetOpen(false);
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {isCategorySheetOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsCategorySheetOpen(false)}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-3xl bg-white p-6">
            <h2 className="text-sm font-semibold">카테고리 선택</h2>
            <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {categoryParents.map((parent) => {
                const children = categoryChildrenByParent.get(parent.id) ?? [];
                const isExpanded = expandedCategoryParentIds.has(parent.id);
                if (children.length === 0) {
                  return (
                    <button
                      key={parent.id}
                      type="button"
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${
                        categoryId === parent.id
                          ? "border-[var(--accent)] bg-[color:rgba(145,102,82,0.12)]"
                          : "border-[var(--border)] bg-white"
                      }`}
                      onClick={() => {
                        setCategoryId(parent.id);
                        setIsCategorySheetOpen(false);
                      }}
                    >
                      {parent.name}
                    </button>
                  );
                }
                return (
                  <div
                    key={parent.id}
                    className="rounded-2xl border border-[var(--border)] px-4 py-3 text-sm"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left"
                      onClick={() => {
                        setExpandedCategoryParentIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(parent.id)) {
                            next.delete(parent.id);
                          } else {
                            next.add(parent.id);
                          }
                          return next;
                        });
                      }}
                    >
                      <span className="font-medium">{parent.name}</span>
                      <span className="text-xs text-[color:rgba(45,38,34,0.6)]">
                        소분류 {children.length}개{" "}
                        <span className="ml-2 text-sm">
                          {isExpanded ? "-" : "+"}
                        </span>
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="mt-3 space-y-2">
                        {children.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                              categoryId === child.id
                                ? "border-[var(--accent)] bg-[color:rgba(145,102,82,0.12)]"
                                : "border-[var(--border)] bg-white"
                            }`}
                            onClick={() => {
                              setCategoryId(child.id);
                              setIsCategorySheetOpen(false);
                            }}
                          >
                            {child.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {isPaymentSheetOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsPaymentSheetOpen(false)}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-3xl bg-white p-6">
            <h2 className="text-sm font-semibold">결제수단 선택</h2>
            <div className="mt-4 flex items-center justify-center gap-6 border-b border-[var(--border)] text-sm">
              {[
                { key: "husband", label: husbandLabel },
                { key: "wife", label: wifeLabel },
                { key: "our", label: "우리" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`pb-3 ${
                    paymentOwner === tab.key
                      ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                      : "text-[color:rgba(45,38,34,0.5)]"
                  }`}
                  onClick={() => setPaymentOwner(tab.key as PaymentOwner)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {paymentGrouped[paymentOwner].parents.map((parent) => {
                const childItems = paymentGrouped[paymentOwner].children.filter(
                  (child) => child.parentId === parent.id
                );
                const isExpanded = expandedPaymentParentId === parent.id;
                return (
                  <div
                    key={parent.id}
                    className="rounded-2xl border border-[var(--border)] px-4 py-3 text-sm"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between"
                      onClick={() =>
                        setExpandedPaymentParentId((prev) =>
                          prev === parent.id ? null : parent.id
                        )
                      }
                    >
                      <span className="font-medium">{parent.name}</span>
                      <span className="text-xs text-[color:rgba(45,38,34,0.6)]">
                        소분류 {childItems.length}개
                      </span>
                    </button>
                    {childItems.length === 0 ? (
                      <button
                        type="button"
                        className={`mt-2 w-full rounded-xl border px-3 py-2 text-left text-xs ${
                          paymentMethod === parent.name
                            ? "border-[var(--accent)] bg-[color:rgba(145,102,82,0.12)]"
                            : "border-[var(--border)] bg-white"
                        }`}
                        onClick={() => {
                          setPaymentMethod(parent.name);
                          setIsPaymentSheetOpen(false);
                        }}
                      >
                        {parent.name} 선택
                      </button>
                    ) : null}
                    {isExpanded ? (
                      <div className="mt-3 space-y-2">
                        {childItems.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                              paymentMethod === child.name
                                ? "border-[var(--accent)] bg-[color:rgba(145,102,82,0.12)]"
                                : "border-[var(--border)] bg-white"
                            }`}
                            onClick={() => {
                              setPaymentMethod(child.name);
                              setIsPaymentSheetOpen(false);
                            }}
                          >
                            {child.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
