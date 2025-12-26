"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useHousehold } from "@/components/household-provider";
import { formatKrw } from "@/lib/format";
import { formatDate, toMonthKey } from "@/lib/time";
import { useMonthlyTransactions } from "@/hooks/use-transactions";
import { deleteMonthlyMemo, getMonthlyMemo } from "@/lib/memos";

export default function DashboardPage() {
  const { householdId } = useHousehold();
  const { transactions, summary, loading } = useMonthlyTransactions(householdId);
  const [memo, setMemo] = useState("");
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const monthKey = toMonthKey(new Date());

  useEffect(() => {
    if (!householdId) {
      setMemo("");
      return;
    }
    setMemoLoading(true);
    setMemoError(null);
    getMonthlyMemo(householdId, monthKey)
      .then((text) => setMemo(text ?? ""))
      .catch(() => setMemoError("메모를 불러오지 못했습니다."))
      .finally(() => setMemoLoading(false));
  }, [householdId, monthKey]);

  async function handleDeleteMemo() {
    if (!householdId) {
      return;
    }
    setMemoLoading(true);
    setMemoError(null);
    try {
      await deleteMonthlyMemo(householdId, monthKey);
      setMemo("");
    } catch (err) {
      setMemoError("메모 삭제에 실패했습니다.");
    } finally {
      setMemoLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <div className="relative min-h-[96px]">
          <h2 className="text-lg font-semibold">메모</h2>
          <Link
            className="absolute right-0 top-0 rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white"
            href="/memos/new?mode=create"
          >
            글쓰기
          </Link>
        </div>
        {memoLoading ? (
          <p className="mt-4 text-sm text-[color:rgba(45,38,34,0.7)]">
            불러오는 중...
          </p>
        ) : memo ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm">
            <Link className="flex-1 whitespace-pre-line" href="/memos/new">
              {memo}
            </Link>
            <button
              className="text-xs text-red-600"
              onClick={handleDeleteMemo}
            >
              삭제
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[color:rgba(45,38,34,0.7)]">
            아직 저장된 메모가 없습니다.
          </p>
        )}
        {memoError ? (
          <p className="mt-2 text-sm text-red-600">{memoError}</p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">이번 달 요약</h1>
        <p className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
          수입, 지출, 잔액을 한눈에 확인하세요.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { label: "수입", value: formatKrw(summary.income) },
            { label: "지출", value: formatKrw(summary.expense) },
            { label: "잔액", value: formatKrw(summary.balance) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-center justify-between text-sm text-[color:rgba(45,38,34,0.7)]">
                <span>{item.label}</span>
                <span className="text-base font-semibold text-[var(--foreground)]">
                  {item.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <h2 className="text-lg font-semibold">최근 내역</h2>
        {loading ? (
          <div className="mt-4 text-sm text-[color:rgba(45,38,34,0.7)]">
            불러오는 중...
          </div>
        ) : transactions.length === 0 ? (
          <div className="mt-4 text-sm text-[color:rgba(45,38,34,0.7)]">
            아직 입력된 내역이 없습니다.
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm text-[color:rgba(45,38,34,0.7)]">
            {transactions.slice(0, 5).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {tx.note ?? "메모 없음"}
                  </p>
                  <p className="text-xs">{formatDate(tx.date.toDate())}</p>
                </div>
                <span
                  className={
                    tx.type === "expense"
                      ? "text-red-600"
                      : tx.type === "income"
                      ? "text-emerald-600"
                      : "text-[color:rgba(45,38,34,0.7)]"
                  }
                >
                  {tx.type === "expense"
                    ? "-"
                    : tx.type === "income"
                    ? "+"
                    : ""}
                  {formatKrw(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
