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
  const [showPicker, setShowPicker] = useState(false);
  const [yearValue, setYearValue] = useState(() => new Date().getFullYear());
  const [monthValue, setMonthValue] = useState(() => new Date().getMonth());
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

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
      const entry = map.get(key) ?? { income: 0, expense: 0, items: [] };
      entry.items.push(tx);
      if (tx.type === "income") {
        entry.income += tx.amount;
      } else if (tx.type === "expense") {
        entry.expense += tx.amount;
      }
      map.set(key, entry);
    });
    return { days: daysList, dailyMap: map };
  }, [selectedDate, transactions]);

  const selectedKey = toDateKey(selectedDate);
  const selectedDaily = dailyMap.get(selectedKey);
  const selectedItems = selectedDaily?.items ?? [];

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

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, idx) => currentYear - 5 + idx);
  }, []);

  function openMonthPicker() {
    setYearValue(selectedDate.getFullYear());
    setMonthValue(selectedDate.getMonth());
    setShowPicker(true);
  }

  function handlePickerConfirm() {
    setSelectedDate(new Date(yearValue, monthValue, 1));
    setShowPicker(false);
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
        </div>
        <Link
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-white"
          href="/transactions/new"
        >
          새 내역
        </Link>
      </div>
      <section
        className="rounded-3xl border border-[var(--border)] bg-white px-0 py-6"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-[var(--border)] px-3 py-1 text-sm"
              onClick={() =>
                setSelectedDate(addDays(startOfMonth(selectedDate), -1))
              }
            >
              {"<"}
            </button>
            <button className="text-lg font-semibold" onClick={openMonthPicker}>
              {format(selectedDate, "yyyy년 M월")}
            </button>
            <button
              className="rounded-full border border-[var(--border)] px-3 py-1 text-sm"
              onClick={() =>
                setSelectedDate(addDays(endOfMonth(selectedDate), 1))
              }
            >
              {">"}
            </button>
          </div>
          <button
            className="rounded-full border border-[var(--border)] px-3 py-1 text-sm"
            onClick={() => setSelectedDate(new Date())}
          >
            오늘
          </button>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-[color:rgba(45,38,34,0.6)]">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-0 px-0">
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
      {showPicker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-6">
            <h3 className="text-lg font-semibold">월 선택</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                연도
                <select
                  className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2"
                  value={yearValue}
                  onChange={(event) => setYearValue(Number(event.target.value))}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                월
                <select
                  className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2"
                  value={monthValue}
                  onChange={(event) => setMonthValue(Number(event.target.value))}
                >
                  {Array.from({ length: 12 }, (_, idx) => (
                    <option key={idx} value={idx}>
                      {idx + 1}월
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => setShowPicker(false)}
              >
                취소
              </button>
              <button
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white"
                onClick={handlePickerConfirm}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
                    {tx.subject ?? "주체"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
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
