"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useSubjects } from "@/hooks/use-subjects";
import { formatKrw } from "@/lib/format";
import { householdDoc } from "@/lib/firebase/firestore";
import { addNotification } from "@/lib/notifications";
import { deleteTransaction, updateTransaction } from "@/lib/transactions";
import { toDateKey } from "@/lib/time";
import type { TransactionType } from "@/types/ledger";

type PaymentOwner = "husband" | "wife" | "our";

export default function EditTransactionPage() {
  const router = useRouter();
  const params = useParams();
  const transactionId = String(params?.id ?? "");
  const { householdId, displayName, spouseRole } = useHousehold();
  const { categories } = useCategories(householdId);
  const { subjects } = useSubjects(householdId);
  const { paymentMethods } = usePaymentMethods(householdId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [paymentOwner, setPaymentOwner] = useState<PaymentOwner>("our");
  const [isTypeSheetOpen, setIsTypeSheetOpen] = useState(false);
  const [isSubjectSheetOpen, setIsSubjectSheetOpen] = useState(false);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);
  const [expandedPaymentParentId, setExpandedPaymentParentId] = useState<
    string | null
  >(null);

  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(toDateKey(new Date()));
  const [note, setNote] = useState("");
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

  const filteredCategories = useMemo(() => {
    const byType = categories.filter((cat) => cat.type === type);
    const leaf = byType.filter((cat) => cat.parentId);
    return leaf.length ? leaf : byType;
  }, [categories, type]);

  const selectedCategoryName = useMemo(() => {
    return categories.find((category) => category.id === categoryId)?.name ?? "";
  }, [categories, categoryId]);

  const subjectOptions = useMemo(() => {
    const list = subjects.map((item) => item.name);
    if (subject && !list.includes(subject)) {
      return [subject, ...list];
    }
    return list;
  }, [subjects, subject]);

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

  const spouseName = displayName?.trim() || "";
  const partnerTrimmed = partnerName.trim();
  const husbandLabel =
    spouseRole === "wife"
      ? partnerTrimmed || "남편"
      : spouseName || "남편";
  const wifeLabel =
    spouseRole === "wife" ? spouseName || "아내" : partnerTrimmed || "아내";

  useEffect(() => {
    if (!householdId || !transactionId) {
      return;
    }
    setLoading(true);
    getDoc(doc(db, "households", householdId, "transactions", transactionId))
      .then((snapshot) => {
        if (!snapshot.exists()) {
          setError("거래 내역을 찾을 수 없습니다.");
          return;
        }
        const data = snapshot.data() as {
          type: TransactionType;
          amount: number;
          categoryId: string;
          paymentMethod: string;
          subject: string;
          date: { toDate: () => Date };
          note?: string;
        };
        setType(data.type);
        setAmount(formatAmountValue(String(data.amount)));
        setCategoryId(data.categoryId);
        setPaymentMethod(data.paymentMethod);
        setSubject(data.subject);
        setDate(toDateKey(data.date.toDate()));
        setNote(data.note ?? "");
      })
      .catch(() => setError("거래 내역을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [householdId, transactionId]);

  useEffect(() => {
    if (!householdId) {
      setPartnerName("");
      return;
    }
    getDoc(householdDoc(householdId)).then((snapshot) => {
      if (!snapshot.exists()) {
        return;
      }
      const data = snapshot.data() as { partnerDisplayName?: string | null };
      setPartnerName(data.partnerDisplayName ?? "");
    });
  }, [householdId]);

  useEffect(() => {
    if (!subject && subjects.length > 0) {
      setSubject(subjects[0].name);
    }
  }, [subjects, subject]);

  useEffect(() => {
    if (!paymentMethod && paymentMethods.length > 0) {
      setPaymentMethod(paymentMethods[0].name);
    }
  }, [paymentMethods, paymentMethod]);

  useEffect(() => {
    if (!paymentMethod) {
      return;
    }
    const candidates = paymentMethods.filter(
      (method) => method.name === paymentMethod
    );
    if (candidates.length === 0) {
      return;
    }
    const preferredOwner =
      spouseRole === "wife" ? "wife" : spouseRole === "husband" ? "husband" : null;
    const preferredMatch = preferredOwner
      ? candidates.find((method) => method.owner === preferredOwner)
      : null;
    const ownerMatch =
      preferredMatch ??
      candidates.find((method) => method.owner) ??
      candidates[0];
    if (ownerMatch?.owner) {
      setPaymentOwner(ownerMatch.owner);
    }
  }, [paymentMethod, paymentMethods, spouseRole]);

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

  async function handleSave() {
    if (!householdId || !transactionId) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateTransaction({
        householdId,
        transactionId,
        type,
        amount: parseAmountValue(amount),
        categoryId,
        paymentMethod,
        subject,
        date: new Date(date),
        note: note || undefined,
      });
      await addNotification(householdId, {
        title: "내역 수정",
        message: `${typeLabelMap[type]} ${formatKrw(parseAmountValue(amount))} · ${date}`,
        level: "info",
        type: "transaction.update",
      });
      router.replace(`/transactions?date=${date}`);
    } catch (err) {
      setError("수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!householdId || !transactionId) {
      return;
    }
    setSaving(true);
    try {
      await deleteTransaction(householdId, transactionId);
      await addNotification(householdId, {
        title: "내역 삭제",
        message: `${typeLabelMap[type]} ${formatKrw(parseAmountValue(amount))} · ${date}`,
        level: "error",
        type: "transaction.delete",
      });
      router.replace("/transactions");
    } catch (err) {
      setError("삭제에 실패했습니다.");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6 text-sm">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="rounded-3xl border border-[var(--border)] bg-white p-6"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">
            날짜
            <input
              type="date"
              name="date"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            유형
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left"
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
              name="amount"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              value={amount}
              onChange={(event) => setAmount(formatAmountValue(event.target.value))}
            />
          </label>
          <label className="text-sm font-medium">
            주체
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left disabled:opacity-60"
              onClick={() => setIsSubjectSheetOpen(true)}
              disabled={subjects.length === 0}
            >
              {subject || "선택"}
            </button>
          </label>
          <label className="text-sm font-medium">
            카테고리
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left"
              onClick={() => setIsCategorySheetOpen(true)}
            >
              {selectedCategoryName || "선택"}
            </button>
          </label>
          <label className="text-sm font-medium">
            결제수단
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left disabled:opacity-60"
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
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            className="mr-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[color:rgba(45,38,34,0.7)] hover:text-red-600"
            onClick={() => setConfirmDelete(true)}
            aria-label="삭제"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M6 6l1 14h10l1-14" />
            </svg>
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
            onClick={() => router.back()}
          >
            취소
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-70"
            disabled={saving}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
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
              {subjectOptions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${
                    subject === name
                      ? "border-[var(--accent)] bg-[color:rgba(145,102,82,0.12)]"
                      : "border-[var(--border)] bg-white"
                  }`}
                  onClick={() => {
                    setSubject(name);
                    setIsSubjectSheetOpen(false);
                  }}
                >
                  {name}
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
            <div className="mt-4 max-h-[55vh] grid gap-2 overflow-y-auto pr-1">
              {filteredCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${
                    categoryId === category.id
                      ? "border-[var(--accent)] bg-[color:rgba(145,102,82,0.12)]"
                      : "border-[var(--border)] bg-white"
                  }`}
                  onClick={() => {
                    setCategoryId(category.id);
                    setIsCategorySheetOpen(false);
                  }}
                >
                  {category.name}
                </button>
              ))}
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
      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-xs rounded-2xl border border-[var(--border)] bg-white p-6">
            <p className="text-sm">삭제하시겠습니까?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => setConfirmDelete(false)}
                disabled={saving}
              >
                아니오
              </button>
              <button
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-70"
                onClick={handleDelete}
                disabled={saving}
              >
                예
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
