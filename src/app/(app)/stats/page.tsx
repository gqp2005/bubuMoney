"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useHousehold } from "@/components/household-provider";
import { formatKrw } from "@/lib/format";
import { toMonthKey } from "@/lib/time";
import { useCategories } from "@/hooks/use-categories";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useSubjects } from "@/hooks/use-subjects";
import {
  useMonthlyTransactions,
  useTransactionsRange,
} from "@/hooks/use-transactions";

const CATEGORY_COLORS = [
  "#22c55e",
  "#14b8a6",
  "#84cc16",
  "#10b981",
  "#16a34a",
  "#65a30d",
  "#059669",
  "#4ade80",
];
const SUBJECT_COLORS = [
  "#3b82f6",
  "#2563eb",
  "#1d4ed8",
  "#60a5fa",
  "#93c5fd",
  "#0ea5e9",
  "#38bdf8",
  "#7dd3fc",
];
const PAYMENT_COLORS = [
  "#f97316",
  "#ea580c",
  "#f59e0b",
  "#fb7185",
  "#ef4444",
  "#f43f5e",
  "#fb923c",
  "#fbbf24",
];

const STATS_STORAGE_KEY = "couple-ledger.stats.filters";

type ViewType = "income" | "expense";

type BreakdownItem = {
  id: string;
  name: string;
  amount: number;
  percent: number;
};

function buildBreakdown(
  items: { id: string; name: string; amount: number }[],
  total: number
): BreakdownItem[] {
  return items
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({
      ...item,
      percent: total > 0 ? Math.round((item.amount / total) * 100) : 0,
    }));
}

function renderStackBar(items: BreakdownItem[], colors: string[]) {
  if (items.length === 0) {
    return (
      <div className="h-3 w-full rounded-full bg-[color:rgba(45,38,34,0.12)]" />
    );
  }
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-[color:rgba(45,38,34,0.08)]">
      {items.map((item, index) => (
        <span
          key={item.id}
          style={{
            width: `${item.percent}%`,
            backgroundColor: colors[index % colors.length],
          }}
          className="h-full"
        />
      ))}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-xs">
        ◎
      </span>
      <span>{title}</span>
    </div>
  );
}

export default function StatsPage() {
  const router = useRouter();
  const { householdId, displayName, spouseRole } = useHousehold();
  const { categories } = useCategories(householdId);
  const { subjects } = useSubjects(householdId);
  const { paymentMethods } = usePaymentMethods(householdId);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [viewType, setViewType] = useState<ViewType>("expense");
  const [expanded, setExpanded] = useState(false);
  const [isRangeSheetOpen, setIsRangeSheetOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<"monthly" | "custom">("monthly");
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customMonthDate, setCustomMonthDate] = useState(() =>
    startOfMonth(new Date())
  );
  const [appliedRangeMode, setAppliedRangeMode] = useState<
    "monthly" | "custom"
  >("monthly");
  const [appliedMonthDate, setAppliedMonthDate] = useState(() =>
    startOfMonth(new Date())
  );
  const [appliedStart, setAppliedStart] = useState<string | null>(null);
  const [appliedEnd, setAppliedEnd] = useState<string | null>(null);
  const monthKey = toMonthKey(appliedMonthDate);
  const { transactions: monthlyTransactions, loading: monthlyLoading } =
    useMonthlyTransactions(householdId, monthKey);
  const rangeStart = useMemo(
    () => (appliedStart ? startOfDay(new Date(appliedStart)) : null),
    [appliedStart]
  );
  const rangeEnd = useMemo(
    () => (appliedEnd ? endOfDay(new Date(appliedEnd)) : null),
    [appliedEnd]
  );
  const { transactions: rangeTransactions, loading: rangeLoading } =
    useTransactionsRange(householdId, rangeStart, rangeEnd);
  const activeTransactions =
    appliedRangeMode === "custom" && rangeStart && rangeEnd
      ? rangeTransactions
      : monthlyTransactions;
  const activeLoading =
    appliedRangeMode === "custom" ? rangeLoading : monthlyLoading;
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<"category" | "subject" | "payment">(
    "category"
  );
  const [draftCategoryIds, setDraftCategoryIds] = useState<Set<string>>(
    () => new Set()
  );
  const [draftSubjects, setDraftSubjects] = useState<Set<string>>(
    () => new Set()
  );
  const [draftPayments, setDraftPayments] = useState<Set<string>>(
    () => new Set()
  );
  const [appliedCategoryIds, setAppliedCategoryIds] = useState<Set<string>>(
    () => new Set()
  );
  const [appliedSubjects, setAppliedSubjects] = useState<Set<string>>(
    () => new Set()
  );
  const [appliedPayments, setAppliedPayments] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedCategoryParents, setExpandedCategoryParents] = useState<
    Set<string>
  >(() => new Set());
  const [expandedPaymentParents, setExpandedPaymentParents] = useState<
    Set<string>
  >(() => new Set());
  const [paymentOwnerFilter, setPaymentOwnerFilter] = useState<
    "husband" | "wife" | "our"
  >("our");
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        viewType?: ViewType;
        appliedRangeMode?: "monthly" | "custom";
        appliedStart?: string | null;
        appliedEnd?: string | null;
        appliedMonthDate?: string;
        appliedCategoryIds?: string[];
        appliedSubjects?: string[];
        appliedPayments?: string[];
        paymentOwnerFilter?: "husband" | "wife" | "our";
      };
      if (parsed.viewType) {
        setViewType(parsed.viewType);
      }
      if (parsed.appliedRangeMode) {
        setAppliedRangeMode(parsed.appliedRangeMode);
      }
      if (parsed.appliedStart !== undefined) {
        setAppliedStart(parsed.appliedStart);
      }
      if (parsed.appliedEnd !== undefined) {
        setAppliedEnd(parsed.appliedEnd);
      }
      if (parsed.appliedMonthDate) {
        const next = startOfMonth(new Date(parsed.appliedMonthDate));
        setAppliedMonthDate(next);
        setMonthDate(next);
      }
      if (parsed.appliedCategoryIds) {
        setAppliedCategoryIds(new Set(parsed.appliedCategoryIds));
      }
      if (parsed.appliedSubjects) {
        setAppliedSubjects(new Set(parsed.appliedSubjects));
      }
      if (parsed.appliedPayments) {
        setAppliedPayments(new Set(parsed.appliedPayments));
      }
      if (parsed.paymentOwnerFilter) {
        setPaymentOwnerFilter(parsed.paymentOwnerFilter);
      }
    } catch (err) {
      window.localStorage.removeItem(STATS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const payload = {
      viewType,
      appliedRangeMode,
      appliedStart,
      appliedEnd,
      appliedMonthDate: appliedMonthDate.toISOString(),
      appliedCategoryIds: Array.from(appliedCategoryIds),
      appliedSubjects: Array.from(appliedSubjects),
      appliedPayments: Array.from(appliedPayments),
      paymentOwnerFilter,
    };
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    viewType,
    appliedRangeMode,
    appliedStart,
    appliedEnd,
    appliedMonthDate,
    appliedCategoryIds,
    appliedSubjects,
    appliedPayments,
    paymentOwnerFilter,
  ]);

  const categoryMap = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat.name])),
    [categories]
  );

  const filtered = useMemo(
    () => activeTransactions.filter((tx) => tx.type === viewType),
    [activeTransactions, viewType]
  );

  const filteredByApplied = useMemo(() => {
    return filtered.filter((tx) => {
      const categoryOk =
        appliedCategoryIds.size === 0 || appliedCategoryIds.has(tx.categoryId);
      const subjectOk =
        appliedSubjects.size === 0 ||
        appliedSubjects.has(tx.subject ?? "");
      const paymentOk =
        appliedPayments.size === 0 ||
        appliedPayments.has(tx.paymentMethod ?? "");
      return categoryOk && subjectOk && paymentOk;
    });
  }, [filtered, appliedCategoryIds, appliedSubjects, appliedPayments]);

  const totalAmount = filteredByApplied.reduce((acc, tx) => acc + tx.amount, 0);

  const activeSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredByApplied.forEach((tx) => {
      if (tx.type === "income") {
        income += tx.amount;
      } else if (tx.type === "expense") {
        expense += tx.amount;
      }
    });
    return { income, expense, balance: income - expense };
  }, [filteredByApplied]);

  const categoryBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {};
    filteredByApplied.forEach((tx) => {
      byCategory[tx.categoryId] = (byCategory[tx.categoryId] ?? 0) + tx.amount;
    });
    return buildBreakdown(
      Object.entries(byCategory).map(([categoryId, amount]) => ({
        id: categoryId,
        name: categoryMap.get(categoryId) ?? "미분류",
        amount,
      })),
      totalAmount
    );
  }, [filteredByApplied, categoryMap, totalAmount]);

  const subjectBreakdown = useMemo(() => {
    const bySubject: Record<string, number> = {};
    filteredByApplied.forEach((tx) => {
      const key = tx.subject || "미지정";
      bySubject[key] = (bySubject[key] ?? 0) + tx.amount;
    });
    return buildBreakdown(
      Object.entries(bySubject).map(([name, amount]) => ({
        id: name,
        name,
        amount,
      })),
      totalAmount
    );
  }, [filteredByApplied, totalAmount]);

  const paymentBreakdown = useMemo(() => {
    const byPayment: Record<string, number> = {};
    filteredByApplied.forEach((tx) => {
      const key = tx.paymentMethod || "미지정";
      byPayment[key] = (byPayment[key] ?? 0) + tx.amount;
    });
    return buildBreakdown(
      Object.entries(byPayment).map(([name, amount]) => ({
        id: name,
        name,
        amount,
      })),
      totalAmount
    );
  }, [filteredByApplied, totalAmount]);

  const shownCategoryItems = expanded
    ? categoryBreakdown
    : categoryBreakdown.slice(0, 4);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, idx) => currentYear - 5 + idx);
  }, []);

  const categoryParents = useMemo(() => {
    return categories
      .filter((category) => category.type === viewType && !category.parentId)
      .sort((a, b) => a.order - b.order);
  }, [categories, viewType]);

  const categoryChildrenByParent = useMemo(() => {
    const map = new Map<string, typeof categories>();
    categories
      .filter((category) => category.type === viewType && category.parentId)
      .forEach((child) => {
        const bucket = map.get(child.parentId ?? "") ?? [];
        bucket.push(child);
        map.set(child.parentId ?? "", bucket);
      });
    map.forEach((list) => list.sort((a, b) => a.order - b.order));
    return map;
  }, [categories, viewType]);

  const paymentParents = useMemo(() => {
    return paymentMethods
      .filter((method) => !method.parentId)
      .filter((method) => (method.owner ?? "our") === paymentOwnerFilter)
      .sort((a, b) => a.order - b.order);
  }, [paymentMethods, paymentOwnerFilter]);

  const paymentChildrenByParent = useMemo(() => {
    const map = new Map<string, typeof paymentMethods>();
    paymentMethods
      .filter((method) => method.parentId)
      .filter((method) => (method.owner ?? "our") === paymentOwnerFilter)
      .forEach((child) => {
        const bucket = map.get(child.parentId ?? "") ?? [];
        bucket.push(child);
        map.set(child.parentId ?? "", bucket);
      });
    map.forEach((list) => list.sort((a, b) => a.order - b.order));
    return map;
  }, [paymentMethods, paymentOwnerFilter]);

  const paymentOwnerLabels = useMemo(() => {
    const baseName = displayName?.trim() || "";
    const partner = subjects.find((subject) => subject.name !== baseName)?.name;
    const husbandLabel =
      spouseRole === "wife" ? partner || "남편" : baseName || "남편";
    const wifeLabel =
      spouseRole === "wife" ? baseName || "아내" : partner || "아내";
    return { husbandLabel, wifeLabel };
  }, [displayName, spouseRole, subjects]);

  useEffect(() => {
    if (!customStart) {
      return;
    }
    const parsed = new Date(customStart);
    if (!Number.isNaN(parsed.getTime())) {
      setCustomMonthDate(startOfMonth(parsed));
    }
  }, [customStart]);

  function openRangeSheet() {
    if (appliedRangeMode === "custom" && appliedStart && appliedEnd) {
      const appliedStartDate = new Date(appliedStart);
      setCustomStart(appliedStart);
      setCustomEnd(appliedEnd);
      setCustomMonthDate(startOfMonth(appliedStartDate));
      setRangeMode("custom");
    } else {
      setSelectedYear(appliedMonthDate.getFullYear());
      setSelectedMonth(appliedMonthDate.getMonth());
      setCustomStart("");
      setCustomEnd("");
      setRangeMode("monthly");
      setCustomMonthDate(startOfMonth(appliedMonthDate));
    }
    setIsRangeSheetOpen(true);
  }

  function handleRangeConfirm() {
    if (rangeMode === "custom" && customStart) {
      const fallbackEnd = customEnd || customStart;
      setAppliedRangeMode("custom");
      setAppliedStart(customStart);
      setAppliedEnd(fallbackEnd);
      setAppliedMonthDate(startOfMonth(new Date(customStart)));
      setMonthDate(startOfMonth(new Date(customStart)));
    } else {
      const nextMonth = new Date(selectedYear, selectedMonth, 1);
      setAppliedRangeMode("monthly");
      setAppliedStart(null);
      setAppliedEnd(null);
      setAppliedMonthDate(nextMonth);
      setMonthDate(nextMonth);
    }
    setIsRangeSheetOpen(false);
  }

  const headerLabel =
    appliedRangeMode === "custom" && appliedStart && appliedEnd
      ? `${format(new Date(appliedStart), "yy.MM.dd")}~${format(
          new Date(appliedEnd),
          "yy.MM.dd"
        )}`
      : format(appliedMonthDate, "M월");

  function openFilterSheet(tab: "category" | "subject" | "payment") {
    setFilterTab(tab);
    setDraftCategoryIds(new Set(appliedCategoryIds));
    setDraftSubjects(new Set(appliedSubjects));
    setDraftPayments(new Set(appliedPayments));
    setIsFilterSheetOpen(true);
  }

  function resetFilters() {
    setDraftCategoryIds(new Set());
    setDraftSubjects(new Set());
    setDraftPayments(new Set());
    setAppliedCategoryIds(new Set());
    setAppliedSubjects(new Set());
    setAppliedPayments(new Set());
    setExpandedCategoryParents(new Set());
    setExpandedPaymentParents(new Set());
    setIsFilterSheetOpen(false);
  }

  function resetAppliedFilters() {
    setAppliedCategoryIds(new Set());
    setAppliedSubjects(new Set());
    setAppliedPayments(new Set());
    setDraftCategoryIds(new Set());
    setDraftSubjects(new Set());
    setDraftPayments(new Set());
    setExpandedCategoryParents(new Set());
    setExpandedPaymentParents(new Set());
  }

  function applyFilters() {
    setAppliedCategoryIds(new Set(draftCategoryIds));
    setAppliedSubjects(new Set(draftSubjects));
    setAppliedPayments(new Set(draftPayments));
    setIsFilterSheetOpen(false);
  }

  const customCalendarDays = useMemo(() => {
    const monthStart = startOfMonth(customMonthDate);
    const monthEnd = endOfMonth(customMonthDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [customMonthDate]);

  const customStartDate = customStart ? new Date(customStart) : null;
  const customEndDate = customEnd ? new Date(customEnd) : null;

  function moveMonth(direction: "prev" | "next") {
    const delta = direction === "prev" ? -1 : 1;
    const nextMonth = addMonths(monthDate, delta);
    setMonthDate(nextMonth);
    setAppliedRangeMode("monthly");
    setAppliedStart(null);
    setAppliedEnd(null);
    setAppliedMonthDate(startOfMonth(nextMonth));
  }

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
      moveMonth("next");
    } else {
      moveMonth("prev");
    }
  }

  return (
    <div className="flex flex-col gap-6" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)]"
          onClick={() => moveMonth("prev")}
          aria-label="이전 달"
        >
          {"<"}
        </button>
        <button
          type="button"
          className="flex items-center gap-2 text-lg font-semibold"
          onClick={openRangeSheet}
        >
          {headerLabel}
          <span className="text-xs">▼</span>
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)]"
          onClick={() => moveMonth("next")}
          aria-label="다음 달"
        >
          {">"}
        </button>
      </div>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        {activeLoading ? (
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
            불러오는 중...
          </p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  시작일
                </p>
                <p className="text-2xl font-semibold">1일</p>
              </div>
              <div className="flex rounded-full border border-[var(--border)] bg-[color:rgba(45,38,34,0.05)] p-1">
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm ${
                    viewType === "income"
                      ? "bg-white text-[var(--text)] shadow"
                      : "text-[color:rgba(45,38,34,0.5)]"
                  }`}
                  onClick={() => setViewType("income")}
                >
                  입금
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm ${
                    viewType === "expense"
                      ? "bg-white text-[var(--text)] shadow"
                      : "text-[color:rgba(45,38,34,0.5)]"
                  }`}
                  onClick={() => setViewType("expense")}
                >
                  지출
                </button>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  {viewType === "expense" ? "총 지출" : "총 수입"}
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatKrw(
                    viewType === "expense"
                      ? activeSummary.expense
                      : activeSummary.income
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  한 달 예산
                </p>
                <p className="mt-2 text-xl text-[color:rgba(45,38,34,0.4)]">
                  미설정
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                onClick={() => openFilterSheet("category")}
              >
                카테고리 ▼
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                onClick={() => openFilterSheet("subject")}
              >
                구성원 ▼
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                onClick={() => openFilterSheet("payment")}
              >
                자산 ▼
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] text-sm"
                aria-label="필터 초기화"
                onClick={() => setShowResetConfirm(true)}
              >
                ↻
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <SectionHeader title="카테고리별 지출" />
                {renderStackBar(categoryBreakdown, CATEGORY_COLORS)}
              </div>
              {categoryBreakdown.length === 0 ? (
                <p className="text-sm text-[color:rgba(45,38,34,0.6)]">
                  표시할 데이터가 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {shownCategoryItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm text-white"
                          style={{
                            backgroundColor:
                              CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                          }}
                        >
                          {item.name.slice(0, 2)}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-[color:rgba(45,38,34,0.5)]">
                            {item.percent}%
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold">
                        {formatKrw(item.amount)}
                      </p>
                    </div>
                  ))}
                  {categoryBreakdown.length > 4 ? (
                    <button
                      type="button"
                      className="mt-2 w-full text-sm text-[color:rgba(45,38,34,0.6)]"
                      onClick={() => setExpanded((prev) => !prev)}
                    >
                      {expanded ? "접기" : "더보기"} ▼
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <SectionHeader title="구성원별 지출" />
              {renderStackBar(subjectBreakdown, SUBJECT_COLORS)}
              <div className="space-y-2">
                {subjectBreakdown.slice(0, 4).map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-6 w-1 rounded-full"
                        style={{
                          backgroundColor:
                            SUBJECT_COLORS[index % SUBJECT_COLORS.length],
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-[color:rgba(45,38,34,0.5)]">
                          {item.percent}%
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatKrw(item.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <SectionHeader title="자산별 지출" />
              {renderStackBar(paymentBreakdown, PAYMENT_COLORS)}
              <div className="space-y-2">
                {paymentBreakdown.slice(0, 4).map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-6 w-1 rounded-full"
                        style={{
                          backgroundColor:
                            PAYMENT_COLORS[index % PAYMENT_COLORS.length],
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-[color:rgba(45,38,34,0.5)]">
                          {item.percent}%
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatKrw(item.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {isRangeSheetOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsRangeSheetOpen(false)}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[80vh] flex-col rounded-t-3xl bg-white">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-[color:rgba(45,38,34,0.15)]" />
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">조회 기간 선택</h2>
                <div className="flex rounded-full border border-[var(--border)] bg-[color:rgba(45,38,34,0.06)] p-1">
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm ${
                    rangeMode === "monthly"
                      ? "bg-white text-[var(--text)] shadow"
                      : "text-[color:rgba(45,38,34,0.5)]"
                  }`}
                  onClick={() => setRangeMode("monthly")}
                >
                  월간
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm ${
                    rangeMode === "custom"
                      ? "bg-white text-[var(--text)] shadow"
                      : "text-[color:rgba(45,38,34,0.5)]"
                  }`}
                  onClick={() => setRangeMode("custom")}
                >
                  직접 입력
                </button>
              </div>
            </div>

            {rangeMode === "custom" ? (
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="rounded-2xl bg-[color:rgba(45,38,34,0.08)] px-4 py-3 text-center text-sm font-medium text-[color:rgba(45,38,34,0.6)]">
                    <input
                      type="date"
                      className="sr-only"
                      value={customStart}
                      onChange={(event) => setCustomStart(event.target.value)}
                    />
                    {customStart
                      ? format(new Date(customStart), "yyyy.MM.dd") + " 부터"
                      : "시작일 선택"}
                  </label>
                  <label className="rounded-2xl bg-[color:rgba(45,38,34,0.08)] px-4 py-3 text-center text-sm font-medium text-[color:rgba(45,38,34,0.6)]">
                    <input
                      type="date"
                      className="sr-only"
                      value={customEnd}
                      onChange={(event) => setCustomEnd(event.target.value)}
                    />
                    {customEnd
                      ? format(new Date(customEnd), "yyyy.MM.dd") + " 까지"
                      : "종료일 선택"}
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[3, 6, 12].map((months) => (
                    <button
                      key={months}
                      type="button"
                      className="rounded-2xl bg-[color:rgba(45,38,34,0.06)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                      onClick={() => {
                        const end = endOfMonth(monthDate);
                        const start = startOfMonth(addMonths(end, -(months - 1)));
                        setCustomStart(format(start, "yyyy-MM-dd"));
                        setCustomEnd(format(end, "yyyy-MM-dd"));
                        setCustomMonthDate(startOfMonth(end));
                      }}
                    >
                      {months}개월
                    </button>
                  ))}
                </div>
                <div className="rounded-3xl border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between text-base font-semibold">
                    {format(customMonthDate, "yyyy년 M월")}
                    <span className="text-xs text-[color:rgba(45,38,34,0.5)]">▼</span>
                  </div>
                  <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-[color:rgba(45,38,34,0.4)]">
                    {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                      <div key={day}>{day}</div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-2">
                    {customCalendarDays.map((day) => {
                      const isCurrentMonth = isSameMonth(day, customMonthDate);
                      const isStart =
                        customStartDate && isSameDay(day, customStartDate);
                      const isEnd = customEndDate && isSameDay(day, customEndDate);
                      const inRange =
                        customStartDate &&
                        customEndDate &&
                        day >= customStartDate &&
                        day <= customEndDate;
                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          className={`h-9 rounded-full text-sm ${
                            isStart || isEnd
                              ? "bg-[color:rgba(59,186,186,0.35)] text-[color:rgba(20,90,90,1)]"
                              : inRange
                              ? "bg-[color:rgba(59,186,186,0.15)] text-[color:rgba(45,38,34,0.9)]"
                              : "bg-transparent"
                          } ${isCurrentMonth ? "" : "text-[color:rgba(45,38,34,0.3)]"}`}
                          onClick={() => {
                            if (!customStartDate || (customStartDate && customEndDate)) {
                              setCustomStart(format(day, "yyyy-MM-dd"));
                              setCustomEnd("");
                              return;
                            }
                            if (day < customStartDate) {
                              setCustomStart(format(day, "yyyy-MM-dd"));
                              setCustomEnd("");
                            } else {
                              setCustomEnd(format(day, "yyyy-MM-dd"));
                            }
                          }}
                        >
                          {format(day, "d")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    const start = startOfMonth(
                      new Date(selectedYear, selectedMonth, 1)
                    );
                    const end = endOfMonth(start);
                    return (
                      <>
                        <div className="rounded-2xl bg-[color:rgba(45,38,34,0.12)] px-4 py-3 text-center text-sm font-medium text-[color:rgba(45,38,34,0.5)]">
                          {format(start, "yyyy.MM.dd")} 부터
                        </div>
                        <div className="rounded-2xl bg-[color:rgba(45,38,34,0.12)] px-4 py-3 text-center text-sm font-medium text-[color:rgba(45,38,34,0.5)]">
                          {format(end, "yyyy.MM.dd")} 까지
                        </div>
                      </>
                    );
                  })()}
                  </div>
                  <div className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-sm">
                  <div className="text-base font-semibold">
                    {format(new Date(selectedYear, selectedMonth, 1), "yyyy년 M월")}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <select
                      className="appearance-none rounded-2xl border border-[var(--border)] bg-[color:rgba(45,38,34,0.06)] px-3 py-2 text-center text-sm font-medium"
                      value={selectedYear}
                      onChange={(event) =>
                        setSelectedYear(Number(event.target.value))
                      }
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}년
                        </option>
                      ))}
                    </select>
                    <select
                      className="appearance-none rounded-2xl border border-[var(--border)] bg-[color:rgba(45,38,34,0.06)] px-3 py-2 text-center text-sm font-medium"
                      value={selectedMonth}
                      onChange={(event) =>
                        setSelectedMonth(Number(event.target.value))
                      }
                    >
                      {Array.from({ length: 12 }, (_, idx) => idx).map(
                        (month) => (
                          <option key={month} value={month}>
                            {month + 1}월
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-[var(--border)] bg-white p-4">
              <button
                type="button"
                className="w-full rounded-2xl bg-[var(--text)] px-4 py-3 text-sm text-black"
                onClick={handleRangeConfirm}
              >
                완료
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFilterSheetOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsFilterSheetOpen(false)}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[80vh] flex-col rounded-t-3xl bg-white">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-[color:rgba(45,38,34,0.15)]" />
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold">필터 선택</div>
                <button
                  type="button"
                  className="text-sm text-[color:rgba(45,38,34,0.6)]"
                  onClick={() => setIsFilterSheetOpen(false)}
                >
                  취소
                </button>
              </div>
              <div className="mt-6 flex gap-6 text-sm">
                {[
                  { key: "category", label: "카테고리" },
                  { key: "subject", label: "구성원" },
                  { key: "payment", label: "자산" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`pb-2 ${
                      filterTab === tab.key
                        ? "text-[var(--text)]"
                        : "text-[color:rgba(45,38,34,0.4)]"
                    }`}
                    onClick={() =>
                      setFilterTab(tab.key as "category" | "subject" | "payment")
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {filterTab === "category" ? (
                <div className="mt-6 space-y-3">
                  {categoryParents.map((parent) => {
                    const children = categoryChildrenByParent.get(parent.id) ?? [];
                    const childIds = children.map((child) => child.id);
                    const isParentSelected =
                      childIds.length > 0
                        ? childIds.every((id) => draftCategoryIds.has(id))
                        : draftCategoryIds.has(parent.id);
                    const isExpanded = expandedCategoryParents.has(parent.id);
                    return (
                      <div
                        key={parent.id}
                        className={`rounded-2xl border px-4 py-3 ${
                          isParentSelected
                            ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)]"
                            : "border-[var(--border)] bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => {
                              const next = new Set(draftCategoryIds);
                              if (childIds.length === 0) {
                                if (next.has(parent.id)) {
                                  next.delete(parent.id);
                                } else {
                                  next.add(parent.id);
                                }
                              } else if (isParentSelected) {
                                childIds.forEach((id) => next.delete(id));
                              } else {
                                childIds.forEach((id) => next.add(id));
                              }
                              setDraftCategoryIds(next);
                            }}
                          >
                            <p
                              className={`text-sm ${
                                isParentSelected ? "font-semibold" : "font-medium"
                              }`}
                            >
                              {parent.name}
                            </p>
                            <p className="text-xs text-[color:rgba(45,38,34,0.5)]">
                              소분류 {children.length}개
                            </p>
                          </button>
                          <button
                            type="button"
                            className="text-xl text-[color:rgba(45,38,34,0.4)]"
                            onClick={() => {
                              const next = new Set(expandedCategoryParents);
                              if (next.has(parent.id)) {
                                next.delete(parent.id);
                              } else {
                                next.add(parent.id);
                              }
                              setExpandedCategoryParents(next);
                            }}
                          >
                            +
                          </button>
                        </div>
                        {isExpanded ? (
                          <div className="mt-3 space-y-2">
                            {children.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                                  draftCategoryIds.has(child.id)
                                    ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.08)] font-semibold"
                                    : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
                                }`}
                                onClick={() => {
                                  const next = new Set(draftCategoryIds);
                                  if (next.has(child.id)) {
                                    next.delete(child.id);
                                  } else {
                                    next.add(child.id);
                                  }
                                  setDraftCategoryIds(next);
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
              ) : null}

              {filterTab === "subject" ? (
                <div className="mt-6 space-y-2">
                  {subjects.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                        draftSubjects.has(subject.name)
                          ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.08)] font-semibold"
                          : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
                      }`}
                      onClick={() => {
                        const next = new Set(draftSubjects);
                        if (next.has(subject.name)) {
                          next.delete(subject.name);
                        } else {
                          next.add(subject.name);
                        }
                        setDraftSubjects(next);
                      }}
                    >
                      {subject.name}
                    </button>
                  ))}
                </div>
              ) : null}

              {filterTab === "payment" ? (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-2">
                    {[
                      { key: "husband", label: paymentOwnerLabels.husbandLabel },
                      { key: "wife", label: paymentOwnerLabels.wifeLabel },
                      { key: "our", label: "우리" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        className={`rounded-full border px-4 py-2 text-sm ${
                          paymentOwnerFilter === tab.key
                            ? "border-[var(--accent)] bg-[color:rgba(145,102,82,0.12)] font-semibold text-[var(--text)]"
                            : "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
                        }`}
                        onClick={() =>
                          setPaymentOwnerFilter(tab.key as "husband" | "wife" | "our")
                        }
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {paymentParents.map((parent) => {
                    const children = paymentChildrenByParent.get(parent.id) ?? [];
                    const childNames = children.map((child) => child.name);
                    const isParentSelected =
                      childNames.length > 0
                        ? childNames.every((name) => draftPayments.has(name))
                        : draftPayments.has(parent.name);
                    const isExpanded = expandedPaymentParents.has(parent.id);
                    return (
                      <div
                        key={parent.id}
                        className={`rounded-2xl border px-4 py-3 ${
                          isParentSelected
                            ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)]"
                            : "border-[var(--border)] bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => {
                              const next = new Set(draftPayments);
                              if (childNames.length === 0) {
                                if (next.has(parent.name)) {
                                  next.delete(parent.name);
                                } else {
                                  next.add(parent.name);
                                }
                              } else if (isParentSelected) {
                                childNames.forEach((name) => next.delete(name));
                              } else {
                                childNames.forEach((name) => next.add(name));
                              }
                              setDraftPayments(next);
                            }}
                          >
                            <p
                              className={`text-sm ${
                                isParentSelected ? "font-semibold" : "font-medium"
                              }`}
                            >
                              {parent.name}
                            </p>
                            <p className="text-xs text-[color:rgba(45,38,34,0.5)]">
                              소분류 {children.length}개
                            </p>
                          </button>
                          <button
                            type="button"
                            className="text-xl text-[color:rgba(45,38,34,0.4)]"
                            onClick={() => {
                              const next = new Set(expandedPaymentParents);
                              if (next.has(parent.id)) {
                                next.delete(parent.id);
                              } else {
                                next.add(parent.id);
                              }
                              setExpandedPaymentParents(next);
                            }}
                          >
                            +
                          </button>
                        </div>
                        {isExpanded ? (
                          <div className="mt-3 space-y-2">
                            {children.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                                  draftPayments.has(child.name)
                                    ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.08)] font-semibold"
                                    : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
                                }`}
                                onClick={() => {
                                  const next = new Set(draftPayments);
                                  if (next.has(child.name)) {
                                    next.delete(child.name);
                                  } else {
                                    next.add(child.name);
                                  }
                                  setDraftPayments(next);
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
              ) : null}
            </div>
            <div className="border-t border-[var(--border)] bg-white p-4 pb-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex-1 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm text-[color:rgba(45,38,34,0.7)]"
                  onClick={resetFilters}
                >
                  초기화
                </button>
                <button
                  type="button"
                  className="flex-[2] rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm text-white"
                  onClick={applyFilters}
                >
                  필터 적용 완료
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showResetConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-xs rounded-2xl border border-[var(--border)] bg-white p-6">
            <p className="text-sm">필터를 초기화하시겠습니까?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => setShowResetConfirm(false)}
              >
                아니오
              </button>
              <button
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
                onClick={() => {
                  resetAppliedFilters();
                  setShowResetConfirm(false);
                }}
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
