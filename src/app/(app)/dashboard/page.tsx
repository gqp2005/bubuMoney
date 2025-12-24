"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { formatKrw } from "@/lib/format";
import { formatDate, toMonthKey } from "@/lib/time";
import { useMonthlyTransactions } from "@/hooks/use-transactions";
import { getMonthlyMemo, setMonthlyMemo } from "@/lib/memos";

export default function DashboardPage() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const { transactions, summary, loading } = useMonthlyTransactions(householdId);
  const [memo, setMemo] = useState("");
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoStatus, setMemoStatus] = useState<string | null>(null);
  const monthKey = toMonthKey(new Date());

  useEffect(() => {
    if (!householdId) {
      setMemo("");
      return;
    }
    getMonthlyMemo(householdId, monthKey).then((text) => {
      setMemo(text ?? "");
    });
  }, [householdId, monthKey]);

  async function handleMemoSave() {
    if (!householdId || !user) {
      return;
    }
    setMemoLoading(true);
    setMemoStatus(null);
    try {
      await setMonthlyMemo(householdId, monthKey, memo, user.uid);
      setMemoStatus("저장 완료");
    } catch (err) {
      setMemoStatus("저장 실패");
    } finally {
      setMemoLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <h2 className="text-lg font-semibold">메모</h2>
        <p className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
          오늘의 지출/계획을 간단히 기록해두세요.
        </p>
        <textarea
          className="mt-4 min-h-[140px] w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm"
          placeholder="예) 이번 달 식비는 40만원 이하로 유지하기"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
        <div className="mt-3 flex items-center justify-end">
          {memoStatus ? (
            <span className="mr-3 text-xs text-[color:rgba(45,38,34,0.7)]">
              {memoStatus}
            </span>
          ) : null}
          <button
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-70"
            onClick={handleMemoSave}
            disabled={memoLoading || !householdId || !user}
          >
            {memoLoading ? "저장 중..." : "메모 저장"}
          </button>
        </div>
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
                  <p className="text-xs">
                    {formatDate(tx.date.toDate())}
                  </p>
                </div>
                <span className={tx.type === "expense" ? "text-red-600" : "text-emerald-600"}>
                  {tx.type === "expense" ? "-" : "+"}
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
