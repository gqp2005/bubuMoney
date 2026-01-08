"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { useTransactionsRange } from "@/hooks/use-transactions";
import { budgetsCol } from "@/lib/firebase/firestore";
import { formatKrw } from "@/lib/format";
import { addNotification } from "@/lib/notifications";
import type { Transaction, TransactionType } from "@/types/ledger";

type RangeOption = 6 | 12;
type ChartType = "bar" | "line";

type MonthPoint = {
  month: Date;
  net: number;
  income: number;
  expense: number;
};

type BudgetDoc = {
  monthKey: string;
  total: number;
  byCategory?: Record<string, number>;
  createdAt?: { toDate: () => Date };
};

const BAR_POSITIVE_COLORS = ["#34d399", "#22c55e", "#10b981", "#14b8a6"];
const BAR_NEGATIVE_COLORS = ["#fb7185", "#f87171", "#ef4444", "#f97316"];
const LINE_COLORS = ["#2d2622", "#0f766e", "#2563eb", "#7c3aed"];

function normalizeNumberInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatNumberInput(value: string) {
  const cleaned = normalizeNumberInput(value);
  if (!cleaned) {
    return "";
  }
  return new Intl.NumberFormat("ko-KR").format(Number(cleaned));
}

function monthKeyToDate(monthKey: string) {
  return new Date(`${monthKey}-01T00:00:00`);
}

function buildMonthPoints(
  endMonth: Date,
  range: RangeOption,
  transactions: (Transaction & { id: string })[],
  budgetCategoryIdSet: Set<string>,
  budgetScope: "common" | string,
  categoryById: Map<string, { id: string; parentId?: string | null }>
): MonthPoint[] {
  const months: MonthPoint[] = [];
  for (let i = range - 1; i >= 0; i -= 1) {
    const month = startOfMonth(addMonths(endMonth, -i));
    months.push({ month, net: 0, income: 0, expense: 0 });
  }

  const byKey = new Map(
    months.map((item) => [format(item.month, "yyyy-MM"), item])
  );

  transactions.forEach((tx) => {
    const date = tx.date.toDate();
    const key = format(date, "yyyy-MM");
    const target = byKey.get(key);
    if (!target) {
      return;
    }
    if (tx.type === "income") {
      target.income += tx.amount;
      target.net += tx.amount;
    } else if (tx.type === "expense") {
      if (budgetScope === "common") {
        if (budgetCategoryIdSet.has(tx.categoryId)) {
          return;
        }
      } else {
        const category = categoryById.get(tx.categoryId);
        if (!category) {
          return;
        }
        if (category.id !== budgetScope && category.parentId !== budgetScope) {
          return;
        }
      }
      if (budgetScope !== "common" && tx.budgetApplied) {
        target.income += tx.amount;
        target.net += tx.amount;
      } else {
        target.expense += tx.amount;
        target.net -= tx.amount;
      }
    }
  });

  return months;
}

function buildLinePath(points: MonthPoint[], width = 100, height = 160) {
  const maxAbs = Math.max(1, ...points.map((point) => Math.abs(point.net)));
  const mid = height / 2;
  const usable = height / 2 - 12;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  return points
    .map((point, index) => {
      const x = index * step;
      const y = mid - (point.net / maxAbs) * usable;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export default function BudgetPage() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const { categories } = useCategories(householdId);
  const [range, setRange] = useState<RangeOption>(6);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [barPositiveColor, setBarPositiveColor] = useState(BAR_POSITIVE_COLORS[0]);
  const [barNegativeColor, setBarNegativeColor] = useState(BAR_NEGATIVE_COLORS[0]);
  const [lineColor, setLineColor] = useState(LINE_COLORS[0]);
  const [monthlyBudgetCommon, setMonthlyBudgetCommon] = useState<string>("");
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showAllTopCategories, setShowAllTopCategories] = useState(false);
  const [budgetScope, setBudgetScope] = useState<"common" | string>("common");
  const [isBudgetSheetOpen, setIsBudgetSheetOpen] = useState(false);
  const lastNotifiedLoadKey = useRef<string | null>(null);

  const endMonth = useMemo(() => startOfMonth(new Date()), []);
  const rangeStart = useMemo(
    () => startOfMonth(addMonths(endMonth, -(range - 1))),
    [endMonth, range]
  );
  const rangeEnd = useMemo(() => endOfMonth(endMonth), [endMonth]);
  const { transactions, loading } = useTransactionsRange(
    householdId,
    rangeStart,
    rangeEnd
  );
  const personalCategoryIdSet = useMemo(() => {
    return new Set(
      categories
        .filter((category) => category.personalOnly)
        .map((category) => category.id)
    );
  }, [categories]);
  const budgetCategoryIdSet = useMemo(() => {
    return new Set(
      categories
        .filter((category) => category.type === "expense" && category.budgetEnabled)
        .map((category) => category.id)
    );
  }, [categories]);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const budgetCategories = useMemo(() => {
    return categories
      .filter((category) => category.type === "expense" && category.budgetEnabled)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [categories]);
  const maxBudgetTabs = budgetCategories.length > 3 ? 2 : 3;
  const budgetTabs = budgetCategories.slice(0, maxBudgetTabs);
  const hasMoreBudgetTabs = budgetCategories.length > maxBudgetTabs;
  const effectiveBudgetScope = budgetCategoryIdSet.has(budgetScope)
    ? budgetScope
    : "common";
  const scopedTransactions = useMemo(() => {
    const currentUserId = user?.uid ?? null;
    if (!currentUserId || personalCategoryIdSet.size === 0) {
      return transactions;
    }
    return transactions.filter(
      (tx) =>
        !personalCategoryIdSet.has(tx.categoryId) ||
        tx.createdBy === currentUserId ||
        Boolean(tx.budgetApplied)
    );
  }, [personalCategoryIdSet, transactions, user]);
  const visibleTransactions = useMemo(() => {
    return scopedTransactions.filter((tx) => {
      if (effectiveBudgetScope === "common") {
        if (tx.type !== "expense") {
          return true;
        }
        if (!budgetCategoryIdSet.has(tx.categoryId)) {
          return true;
        }
        return Boolean(tx.budgetApplied);
      }
      const scopedCategory = categoryById.get(effectiveBudgetScope);
      if (scopedCategory?.personalOnly) {
        const currentUserId = user?.uid ?? null;
        if (!currentUserId || tx.createdBy !== currentUserId) {
          return false;
        }
      }
      if (tx.type !== "expense") {
        return false;
      }
      const category = categoryById.get(tx.categoryId);
      if (!category) {
        return false;
      }
      return (
        category.id === effectiveBudgetScope ||
        category.parentId === effectiveBudgetScope
      );
    });
  }, [
    scopedTransactions,
    effectiveBudgetScope,
    budgetCategoryIdSet,
    categoryById,
    user,
  ]);

  const monthPoints = useMemo(
    () =>
      buildMonthPoints(
        endMonth,
        range,
        visibleTransactions,
        budgetCategoryIdSet,
        effectiveBudgetScope,
        categoryById
      ),
    [
      endMonth,
      range,
      visibleTransactions,
      budgetCategoryIdSet,
      effectiveBudgetScope,
      categoryById,
    ]
  );

  const initialMonthKey = useMemo(() => format(endMonth, "yyyy-MM"), [endMonth]);
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialMonthKey);
  const effectiveSelectedMonthKey = useMemo(() => {
    if (monthPoints.length === 0) {
      return selectedMonthKey;
    }
    const keys = new Set(monthPoints.map((point) => format(point.month, "yyyy-MM")));
    if (keys.has(selectedMonthKey)) {
      return selectedMonthKey;
    }
    return format(monthPoints[monthPoints.length - 1].month, "yyyy-MM");
  }, [monthPoints, selectedMonthKey]);
  const selectedMonthDate = useMemo(
    () => new Date(`${effectiveSelectedMonthKey}-01T00:00:00`),
    [effectiveSelectedMonthKey]
  );

  const maxAbs = useMemo(
    () => Math.max(1, ...monthPoints.map((point) => Math.abs(point.net))),
    [monthPoints]
  );

  const totalNet = monthPoints.reduce((acc, point) => acc + point.net, 0);
  const selectedPoint =
    monthPoints.find(
      (point) => format(point.month, "yyyy-MM") === effectiveSelectedMonthKey
    ) ??
    monthPoints[monthPoints.length - 1];

  const categoryMap = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories]
  );

  const topCategories = useMemo(
    () =>
      categories
        .filter((cat) => cat.type === "expense" && !cat.parentId)
        .sort((a, b) => a.order - b.order),
    [categories]
  );

  const selectedMonthExpenses = useMemo(() => {
    if (!effectiveSelectedMonthKey) {
      return [];
    }
    return visibleTransactions.filter((tx) => {
      if (tx.type !== "expense") {
        return false;
      }
      if (effectiveBudgetScope !== "common" && tx.budgetApplied) {
        return false;
      }
      if (effectiveBudgetScope === "common") {
        if (budgetCategoryIdSet.has(tx.categoryId) && !tx.budgetApplied) {
          return false;
        }
      } else {
        const category = categoryById.get(tx.categoryId);
        if (!category) {
          return false;
        }
        if (
          category.id !== effectiveBudgetScope &&
          category.parentId !== effectiveBudgetScope
        ) {
          return false;
        }
      }
      const key = format(tx.date.toDate(), "yyyy-MM");
      return key === effectiveSelectedMonthKey;
    });
  }, [
    effectiveSelectedMonthKey,
    visibleTransactions,
    budgetCategoryIdSet,
    effectiveBudgetScope,
    categoryById,
  ]);

  const topCategorySpend = useMemo(() => {
    const totals: Record<string, number> = {};
    selectedMonthExpenses.forEach((tx) => {
      const category = categoryMap.get(tx.categoryId);
      const topId = category?.parentId ?? category?.id ?? tx.categoryId;
      totals[topId] = (totals[topId] ?? 0) + tx.amount;
    });
    return Object.entries(totals)
      .map(([categoryId, amount]) => ({
        categoryId,
        amount,
        name: categoryMap.get(categoryId)?.name ?? "미지정",
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [categoryMap, selectedMonthExpenses]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset UI state on month switch
    setSaveMessage(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset UI state on month switch
    setShowAllTopCategories(false);
  }, [effectiveSelectedMonthKey]);

  useEffect(() => {
    if (!householdId || !effectiveSelectedMonthKey) {
      return;
    }
    let active = true;
    const loadBudget = async () => {
      const ref = doc(budgetsCol(householdId), effectiveSelectedMonthKey);
      const snapshot = await getDoc(ref);
      if (!active) {
        return;
      }
      if (snapshot.exists()) {
        const data = snapshot.data() as BudgetDoc;
        setMonthlyBudgetCommon(
          data.total ? formatNumberInput(String(data.total)) : ""
        );
        const byCategory = data.byCategory ?? {};
        const mapped: Record<string, string> = {};
        Object.entries(byCategory).forEach(([key, value]) => {
          mapped[key] = formatNumberInput(String(value));
        });
        setCategoryBudgets(mapped);
        if (user && lastNotifiedLoadKey.current !== effectiveSelectedMonthKey) {
          lastNotifiedLoadKey.current = effectiveSelectedMonthKey;
        }
      } else {
        setMonthlyBudgetCommon("");
        setCategoryBudgets({});
      }
    };
    loadBudget();
    return () => {
      active = false;
    };
  }, [householdId, effectiveSelectedMonthKey, user]);

  const activeMonthlyBudget =
    effectiveBudgetScope === "common"
      ? monthlyBudgetCommon
      : categoryBudgets[effectiveBudgetScope] ?? "";
  const budgetValue = Number(normalizeNumberInput(activeMonthlyBudget));
  const budgetProgress =
    budgetValue > 0 && selectedPoint
      ? Math.min(100, Math.round((selectedPoint.expense / budgetValue) * 100))
      : 0;

  const handleCategoryBudgetChange = (categoryId: string, value: string) => {
    setCategoryBudgets((prev) => ({ ...prev, [categoryId]: formatNumberInput(value) }));
  };

  const handleSaveBudget = async () => {
    if (!householdId || !effectiveSelectedMonthKey) {
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    const byCategory: Record<string, number> = {};
    Object.entries(categoryBudgets).forEach(([key, value]) => {
      const num = Number(normalizeNumberInput(value));
      if (!Number.isNaN(num) && num > 0) {
        byCategory[key] = num;
      }
    });
    const total = Number(normalizeNumberInput(monthlyBudgetCommon));
    await setDoc(
      doc(budgetsCol(householdId), effectiveSelectedMonthKey),
      {
        monthKey: effectiveSelectedMonthKey,
        total: Number.isNaN(total) ? 0 : total,
        byCategory,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
    setSaving(false);
    setSaveMessage("저장 완료");
    if (user) {
      addNotification(householdId, {
        title: "예산 저장 완료",
        message: `${format(monthKeyToDate(effectiveSelectedMonthKey), "yyyy년 M월")} 예산을 저장했습니다.`,
        level: "success",
        type: "budget",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)]"
          onClick={() =>
            setSelectedMonthKey(
              format(addMonths(selectedMonthDate, -1), "yyyy-MM")
            )
          }
          aria-label="이전 달"
        >
          {"<"}
        </button>
        <button
          type="button"
          className="flex items-center gap-2 text-lg font-semibold"
          onClick={() => setSelectedMonthKey(format(new Date(), "yyyy-MM"))}
        >
          {format(selectedMonthDate, "M월")}
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)]"
          onClick={() =>
            setSelectedMonthKey(
              format(addMonths(selectedMonthDate, 1), "yyyy-MM")
            )
          }
          aria-label="다음 달"
        >
          {">"}
        </button>
      </div>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">예산</h1>
            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
              최근 {range}개월 자산 증감 추이
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[6, 12].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value as RangeOption)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  range === value
                    ? "border-[var(--text)] bg-[var(--text)] text-white"
                    : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
                }`}
              >
                {value}개월
              </button>
            ))}
            {(["bar", "line"] as ChartType[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setChartType(value)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  chartType === value
                    ? "border-[var(--text)] bg-[var(--text)] text-white"
                    : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
                }`}
              >
                {value === "bar" ? "막대" : "라인"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`rounded-full border px-4 py-2 text-sm ${
              effectiveBudgetScope === "common"
                ? "border-[var(--text)] bg-[var(--text)] text-white"
                : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
            }`}
            onClick={() => setBudgetScope("common")}
          >
            공용
          </button>
          {budgetTabs.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`rounded-full border px-4 py-2 text-sm ${
                effectiveBudgetScope === category.id
                  ? "border-[var(--text)] bg-[var(--text)] text-white"
                  : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
              }`}
              onClick={() => setBudgetScope(category.id)}
            >
              {category.name}
            </button>
          ))}
          {hasMoreBudgetTabs ? (
            <button
              type="button"
              className={`rounded-full border px-4 py-2 text-sm ${
                effectiveBudgetScope !== "common" &&
                !budgetTabs.some((tab) => tab.id === effectiveBudgetScope)
                  ? "border-[var(--text)] bg-[var(--text)] text-white"
                  : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
              }`}
              onClick={() => setIsBudgetSheetOpen(true)}
              aria-label="예산 카테고리 더보기"
            >
              ...
            </button>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[color:rgba(45,38,34,0.03)] p-4">
          <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
            누적 자산 변화
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {formatKrw(totalNet)}
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">월 예산 입력</p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="월 지출 예산을 입력"
              value={activeMonthlyBudget}
              onChange={(event) => {
                const nextValue = formatNumberInput(event.target.value);
                if (effectiveBudgetScope === "common") {
                  setMonthlyBudgetCommon(nextValue);
                } else {
                  setCategoryBudgets((prev) => ({
                    ...prev,
                    [effectiveBudgetScope]: nextValue,
                  }));
                }
              }}
              className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleSaveBudget}
                className="rounded-full bg-[var(--text)] px-4 py-2 text-xs text-white"
                disabled={saving}
              >
                {saving ? "저장 중..." : "예산 저장"}
              </button>
              {saveMessage ? (
                <span className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  {saveMessage}
                </span>
              ) : null}
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-[color:rgba(45,38,34,0.6)]">
                <span>예산 대비</span>
                <span>{budgetProgress}%</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-[color:rgba(45,38,34,0.1)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${budgetProgress}%` }}
                />
              </div>
              {selectedPoint ? (
                <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.6)]">
                  {format(selectedPoint.month, "yyyy년 M월")} 지출 {formatKrw(selectedPoint.expense)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
              선택 월 상세
            </p>
            {selectedPoint ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="font-semibold">{format(selectedPoint.month, "yyyy년 M월")}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[color:rgba(45,38,34,0.6)]">수입</span>
                  <span className="font-semibold text-emerald-600">
                    {formatKrw(selectedPoint.income)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[color:rgba(45,38,34,0.6)]">지출</span>
                  <span className="font-semibold text-rose-600">
                    {formatKrw(selectedPoint.expense)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[color:rgba(45,38,34,0.6)]">증감</span>
                  <span className="font-semibold">
                    {formatKrw(selectedPoint.net)}
                  </span>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                    상위 카테고리 지출
                  </p>
                  {topCategorySpend.length === 0 ? (
                    <p className="mt-1 text-xs text-[color:rgba(45,38,34,0.5)]">
                      지출 내역이 없습니다.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1 text-xs">
                      {(showAllTopCategories
                        ? topCategorySpend
                        : topCategorySpend.slice(0, 4)
                      ).map((item) => (
                        <div key={item.categoryId} className="flex items-center justify-between">
                          <span>{item.name}</span>
                          <span className="font-semibold text-rose-600">
                            {formatKrw(item.amount)}
                          </span>
                        </div>
                      ))}
                      {topCategorySpend.length > 4 ? (
                        <button
                          type="button"
                          className="mt-2 text-[11px] text-[color:rgba(45,38,34,0.6)]"
                          onClick={() => setShowAllTopCategories((prev) => !prev)}
                        >
                          {showAllTopCategories ? "접기" : "더보기"}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.6)]">
                선택된 월이 없습니다.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-sm font-semibold">카테고리별 예산</p>
          <p className="mt-1 text-xs text-[color:rgba(45,38,34,0.6)]">
            선택 월 기준으로 상위 카테고리 예산을 입력하세요.
          </p>
          <div className="mt-3 space-y-3">
            {topCategories.length === 0 ? (
              <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                지출 카테고리가 없습니다.
              </p>
            ) : (
              topCategories.map((category) => {
                const raw = categoryBudgets[category.id] ?? "";
                const budget = Number(raw);
                const spent =
                  topCategorySpend.find((item) => item.categoryId === category.id)
                    ?.amount ?? 0;
                const progress =
                  !Number.isNaN(budget) && budget > 0
                    ? Math.min(100, Math.round((spent / budget) * 100))
                    : 0;
                return (
                  <div key={category.id} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{category.name}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="예산"
                        value={raw}
                        onChange={(event) =>
                          handleCategoryBudgetChange(category.id, event.target.value)
                        }
                        className="w-24 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-right"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-[color:rgba(45,38,34,0.6)]">
                      <span>지출 {formatKrw(spent)}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-[color:rgba(45,38,34,0.1)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[color:rgba(45,38,34,0.6)]">양수 색상</span>
            {BAR_POSITIVE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setBarPositiveColor(color)}
                className={`h-5 w-5 rounded-full border ${
                  barPositiveColor === color
                    ? "border-[var(--text)]"
                    : "border-[var(--border)]"
                }`}
                style={{ backgroundColor: color }}
                aria-label="양수 색상 선택"
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[color:rgba(45,38,34,0.6)]">음수 색상</span>
            {BAR_NEGATIVE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setBarNegativeColor(color)}
                className={`h-5 w-5 rounded-full border ${
                  barNegativeColor === color
                    ? "border-[var(--text)]"
                    : "border-[var(--border)]"
                }`}
                style={{ backgroundColor: color }}
                aria-label="음수 색상 선택"
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[color:rgba(45,38,34,0.6)]">라인 색상</span>
            {LINE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setLineColor(color)}
                className={`h-5 w-5 rounded-full border ${
                  lineColor === color
                    ? "border-[var(--text)]"
                    : "border-[var(--border)]"
                }`}
                style={{ backgroundColor: color }}
                aria-label="라인 색상 선택"
              />
            ))}
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-[color:rgba(45,38,34,0.6)]">
              불러오는 중...
            </p>
          ) : chartType === "bar" ? (
            <div className="relative h-44">
              <div className="absolute left-0 right-0 top-1/2 h-px bg-[color:rgba(45,38,34,0.2)]" />
              <div className="flex h-full items-end gap-2">
                {monthPoints.map((point) => {
                  const height = Math.round((Math.abs(point.net) / maxAbs) * 100);
                  const isPositive = point.net >= 0;
                  const monthKey = format(point.month, "yyyy-MM");
                  return (
                    <button
                      key={point.month.toISOString()}
                      type="button"
                      onClick={() => setSelectedMonthKey(monthKey)}
                      className="flex flex-1 flex-col items-center justify-end"
                    >
                      <div className="relative h-full w-full">
                        <div
                          className="absolute left-1/2 w-3 -translate-x-1/2 rounded-full"
                          style={{
                            height: `${height}%`,
                            backgroundColor: isPositive
                              ? barPositiveColor
                              : barNegativeColor,
                            bottom: isPositive ? "50%" : undefined,
                            top: isPositive ? undefined : "50%",
                          }}
                        />
                      </div>
                      <span
                        className={`mt-2 text-[10px] ${
                          monthKey === effectiveSelectedMonthKey
                            ? "font-semibold text-[var(--text)]"
                            : "text-[color:rgba(45,38,34,0.6)]"
                        }`}
                      >
                        {format(point.month, "M월")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="relative h-44">
              <svg
                viewBox="0 0 100 160"
                className="h-full w-full"
                preserveAspectRatio="none"
              >
                <line
                  x1="0"
                  y1="80"
                  x2="100"
                  y2="80"
                  stroke="rgba(45,38,34,0.2)"
                  strokeWidth="1"
                />
                <path
                  d={buildLinePath(monthPoints)}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth="2"
                />
              </svg>
              <div className="mt-2 flex items-center gap-2">
                {monthPoints.map((point) => {
                  const monthKey = format(point.month, "yyyy-MM");
                  return (
                    <button
                      key={point.month.toISOString()}
                      type="button"
                      onClick={() => setSelectedMonthKey(monthKey)}
                      className={`flex-1 text-center text-[10px] ${
                        monthKey === effectiveSelectedMonthKey
                          ? "font-semibold text-[var(--text)]"
                          : "text-[color:rgba(45,38,34,0.6)]"
                      }`}
                    >
                      {format(point.month, "M월")}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {isBudgetSheetOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsBudgetSheetOpen(false)}
              aria-label="닫기"
            />
            <div className="absolute bottom-0 left-0 right-0 flex max-h-[70vh] flex-col rounded-t-3xl bg-white">
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-[color:rgba(45,38,34,0.15)]" />
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold">카테고리 선택</div>
                  <button
                    type="button"
                    className="text-sm text-[color:rgba(45,38,34,0.6)]"
                    onClick={() => setIsBudgetSheetOpen(false)}
                  >
                    닫기
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {budgetCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                        effectiveBudgetScope === category.id
                          ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                          : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
                      }`}
                      onClick={() => {
                        setBudgetScope(category.id);
                        setIsBudgetSheetOpen(false);
                      }}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
