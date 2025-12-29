"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useSubjects } from "@/hooks/use-subjects";
import { deleteTransaction, updateTransaction } from "@/lib/transactions";
import { toDateKey } from "@/lib/time";
import type { TransactionType } from "@/types/ledger";

export default function EditTransactionPage() {
  const router = useRouter();
  const params = useParams();
  const transactionId = String(params?.id ?? "");
  const { householdId } = useHousehold();
  const { categories } = useCategories(householdId);
  const { subjects } = useSubjects(householdId);
  const { paymentMethods } = usePaymentMethods(householdId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(toDateKey(new Date()));
  const [note, setNote] = useState("");

  const filteredCategories = useMemo(() => {
    const byType = categories.filter((cat) => cat.type === type);
    const leaf = byType.filter((cat) => cat.parentId);
    return leaf.length ? leaf : byType;
  }, [categories, type]);

  const subjectOptions = useMemo(() => {
    const list = subjects.map((item) => item.name);
    if (subject && !list.includes(subject)) {
      return [subject, ...list];
    }
    return list;
  }, [subjects, subject]);

  const paymentOptions = useMemo(() => {
    const list = paymentMethods.map((method) => method.name);
    if (paymentMethod && !list.includes(paymentMethod)) {
      return [paymentMethod, ...list];
    }
    return list;
  }, [paymentMethods, paymentMethod]);

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
        setAmount(String(data.amount));
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
    if (!subject && subjects.length > 0) {
      setSubject(subjects[0].name);
    }
  }, [subjects, subject]);

  useEffect(() => {
    if (!paymentMethod && paymentMethods.length > 0) {
      setPaymentMethod(paymentMethods[0].name);
    }
  }, [paymentMethods, paymentMethod]);

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
        amount: Number(amount),
        categoryId,
        paymentMethod,
        subject,
        date: new Date(date),
        note: note || undefined,
      });
      router.replace("/transactions");
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
            <select
              name="type"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              value={type}
              onChange={(event) =>
                setType(event.target.value as TransactionType)
              }
            >
              <option value="expense">지출</option>
              <option value="income">수입</option>
              <option value="transfer">이체</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            금액
            <input
              type="number"
              name="amount"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            주체
            <select
              name="subject"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={subjects.length === 0}
            >
              {subjectOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            카테고리
            <select
              name="categoryId"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            결제수단
            <select
              name="paymentMethod"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              disabled={paymentMethods.length === 0}
            >
              {paymentOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
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
