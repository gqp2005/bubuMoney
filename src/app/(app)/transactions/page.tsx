"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useHousehold } from "@/components/household-provider";
import { formatKrw } from "@/lib/format";
import { formatDate, toDateKey } from "@/lib/time";
import { useCategories } from "@/hooks/use-categories";
import { useMonthlyTransactions } from "@/hooks/use-transactions";
import { deleteTransaction } from "@/lib/transactions";

export default function TransactionsPage() {
  const { householdId } = useHousehold();
  const { categories } = useCategories(householdId);
  const { transactions, loading } = useMonthlyTransactions(householdId);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const categoryMap = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category.name]));
  }, [categories]);
  const paymentLabel = useMemo(
    () =>
      new Map([
        ["cash", "현금"],
        ["card", "카드"],
        ["transfer", "계좌이체"],
      ]),
    []
  );

  const { days, dailyMap } = useMemo(() => {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const daysList: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      daysList.push(day);
      day = addDays(day, 1);
    }
    const map = new Map<
      string,
      { income: number; expense: number; items: typeof transactions }
    >();
    transactions.forEach((tx) => {
      const key = toDateKey(tx.date.toDate());
      const entry =
        map.get(key) ?? { income: 0, expense: 0, items: [] };
      entry.items.push(tx);
      if (tx.type === "income") {
        entry.income += tx.amount;
      } else {
        entry.expense += tx.amount;
      }
      map.set(key, entry);
    });
    return { days: daysList, dailyMap: map };
  }, [selectedDate, transactions]);

  const selectedKey = toDateKey(selectedDate);
  const selectedDaily = dailyMap.get(selectedKey);
  const selectedItems = selectedDaily?.items ?? [];
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    setTouchEndX(null);
    setTouchStartX(event.touches[0]?.clientX ?? null);
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    setTouchEndX(event.touches[0]?.clientX ?? null);
  }

  function handleTouchEnd() {
    if (touchStartX === null || touchEndX === null) {
      return;
    }
    const delta = touchStartX - touchEndX;
    if (Math.abs(delta) < 50) {
      return;
    }
    if (delta > 0) {
      setSelectedDate(addDays(endOfMonth(selectedDate), 1));
    } else {
      setSelectedDate(addDays(startOfMonth(selectedDate), -1));
    }
  }

  async function handleDelete(transactionId: string) {
    if (!householdId) {
      return;
    }
    await deleteTransaction(householdId, transactionId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">거래 내역</h1>
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
            월별 수입/지출을 관리하세요.
          </p>
        </div>
        <Link
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-white"
          href="/transactions/new"
        >
          새 내역
        </Link>
      </div>
      <section
        className="rounded-3xl border border-[var(--border)] bg-white p-6"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {format(selectedDate, "yyyy년 M월")}
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <button
              className="rounded-full border border-[var(--border)] px-3 py-1"
              onClick={() => setSelectedDate(addDays(startOfMonth(selectedDate), -1))}
            >
              이전 달
            </button>
            <button
              className="rounded-full border border-[var(--border)] px-3 py-1"
              onClick={() => setSelectedDate(new Date())}
            >
              오늘
            </button>
            <button
              className="rounded-full border border-[var(--border)] px-3 py-1"
              onClick={() => setSelectedDate(addDays(endOfMonth(selectedDate), 1))}
            >
              다음 달
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-[color:rgba(45,38,34,0.6)]">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-0">
          {days.map((day) => {
            const key = toDateKey(day);
            const data = dailyMap.get(key);
            const isActive = isSameDay(day, selectedDate);
            return (
              <button
                key={key}
                className={`rounded-md border px-2 py-2 text-left text-xs ${
                  isActive
                    ? "border-[var(--accent)] bg-[rgba(59,47,47,0.08)]"
                    : "border-[var(--border)]"
                } ${isSameMonth(day, selectedDate) ? "" : "opacity-40"}`}
                onClick={() => setSelectedDate(day)}
              >
                <div className="text-sm font-semibold">{format(day, "d")}</div>
                <div className="mt-1 space-y-0.5 text-[10px] leading-tight text-[color:rgba(45,38,34,0.6)]">
                  <div className="text-blue-600">
                    <span className="block break-all">
                      {formatKrw(data?.income ?? 0)}
                    </span>
                  </div>
                  <div className="text-red-600">
                    <span className="block break-all">
                      {formatKrw(data?.expense ?? 0)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <div className="flex items-center justify-end text-sm text-[color:rgba(45,38,34,0.7)]">
          수입 {formatKrw(selectedDaily?.income ?? 0)} · 지출{" "}
          {formatKrw(selectedDaily?.expense ?? 0)}
        </div>
        {loading ? (
          <div className="mt-4 text-sm text-[color:rgba(45,38,34,0.7)]">
            불러오는 중...
          </div>
        ) : selectedItems.length === 0 ? (
          <div className="mt-4 text-sm text-[color:rgba(45,38,34,0.7)]">
            선택한 날짜의 기록이 없습니다.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {selectedItems.map((tx) => (
              <div
                key={tx.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {categoryMap.get(tx.categoryId) ?? "미분류"}
                  </p>
                  <p className="text-xs text-[color:rgba(45,38,34,0.65)]">
                    {formatDate(tx.date.toDate())} · {tx.note ?? "메모 없음"}
                  </p>
                  <p className="text-xs text-[color:rgba(45,38,34,0.65)]">
                    {paymentLabel.get(tx.paymentMethod) ?? "결제수단"} ·{" "}
                    {tx.recorder ?? "입력자"} · {tx.subject ?? "주체"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={
                      tx.type === "expense" ? "text-red-600" : "text-emerald-600"
                    }
                  >
                    {tx.type === "expense" ? "-" : "+"}
                    {formatKrw(tx.amount)}
                  </span>
                  <button
                    className="text-xs text-[color:rgba(45,38,34,0.6)] hover:text-red-600"
                    onClick={() => handleDelete(tx.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
