"use client";

import { useMemo } from "react";
import { useHousehold } from "@/components/household-provider";
import { formatKrw } from "@/lib/format";
import { useCategories } from "@/hooks/use-categories";
import { useMonthlyTransactions } from "@/hooks/use-transactions";

export default function StatsPage() {
  const { householdId } = useHousehold();
  const { categories } = useCategories(householdId);
  const { summary, loading } = useMonthlyTransactions(householdId);
  const breakdown = useMemo(() => {
    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));
    return Object.entries(summary.byCategory)
      .map(([categoryId, amount]) => ({
        categoryId,
        name: categoryMap.get(categoryId) ?? "미분류",
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [categories, summary.byCategory]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">통계</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          카테고리별 지출 흐름을 확인하세요.
        </p>
      </div>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        {loading ? (
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
            불러오는 중...
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "수입", value: summary.income },
                { label: "지출", value: summary.expense },
                { label: "잔액", value: summary.balance },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[var(--border)] p-4"
                >
                  <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
                    {item.label}
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {formatKrw(item.value)}
                  </p>
                </div>
              ))}
            </div>
            <div>
              <h2 className="text-sm font-semibold">카테고리별 합계</h2>
              {breakdown.length === 0 ? (
                <p className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
                  통계 데이터가 없습니다.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {breakdown.map((item) => (
                    <div
                      key={item.categoryId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{item.name}</span>
                      <span>{formatKrw(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
