"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { addTransaction } from "@/lib/transactions";
import { toDateKey } from "@/lib/time";
import type { TransactionType } from "@/types/ledger";

const PAYMENT_METHODS = [
  { value: "cash", label: "현금" },
  { value: "card", label: "카드" },
  { value: "transfer", label: "계좌이체" },
] as const;

const SUBJECTS = ["우리", "남편", "아내", "처가댁", "시댁"] as const;

export default function NewTransactionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const { categories } = useCategories(householdId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TransactionType>("expense");
  const today = toDateKey(new Date());
  const hasCategories = categories.length > 0;

  const filteredCategories = useMemo(() => {
    const byType = categories.filter((cat) => cat.type === type);
    const leaf = byType.filter((cat) => cat.parentId);
    return leaf.length ? leaf : byType;
  }, [categories, type]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !householdId) {
      return;
    }
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const type = String(formData.get("type") ?? "expense") as TransactionType;
    const amount = Number(formData.get("amount") ?? 0);
    const categoryId = String(formData.get("categoryId") ?? "");
    const paymentMethod = String(formData.get("paymentMethod") ?? "cash");
    const subject = String(formData.get("subject") ?? "");
    const date = String(formData.get("date") ?? "");
    const note = String(formData.get("note") ?? "");
    if (!amount || !categoryId || !date || !subject) {
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
        paymentMethod: paymentMethod as "cash" | "card" | "transfer",
        subject: subject as "우리" | "남편" | "아내" | "처가댁" | "시댁",
        date: new Date(date),
        note: note.length ? note : undefined,
        createdBy: user.uid,
      });
      router.replace("/transactions");
    } catch (err) {
      setError("저장에 실패했습니다. 입력값을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">새 내역 입력</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          수입 또는 지출을 등록하세요.
        </p>
      </div>
      <form
        className="rounded-3xl border border-[var(--border)] bg-white p-6"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">
            날짜
            <input
              type="date"
              name="date"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              defaultValue={today}
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
            금액 (₩)
            <input
              type="number"
              name="amount"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              placeholder="0"
            />
          </label>
          <label className="text-sm font-medium">
            주체
            <select
              name="subject"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              defaultValue={SUBJECTS[0]}
            >
              {SUBJECTS.map((name) => (
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
              disabled={!hasCategories}
            >
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {!hasCategories ? (
              <span className="mt-2 block text-xs text-[color:rgba(45,38,34,0.6)]">
                카테고리를 먼저 추가해주세요.
              </span>
            ) : null}
          </label>
          <label className="text-sm font-medium">
            결제수단
            <select
              name="paymentMethod"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              defaultValue={PAYMENT_METHODS[0].value}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
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
            placeholder="선택 사항"
          />
        </label>
        <button
          type="submit"
          className="mt-6 rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-70"
          disabled={loading}
        >
          {loading ? "저장 중..." : "저장"}
        </button>
      </form>
      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
