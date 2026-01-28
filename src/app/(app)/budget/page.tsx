"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { Category, Transaction, TransactionType } from "@/types/ledger";

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

type BudgetConfigDoc = {
  selectedCategoryIdsByScope?: Record<string, string[]>;
  updatedAt?: { toDate: () => Date };
};

type CategoryWithId = Category & { id: string };

const BAR_POSITIVE_COLORS = ["#34d399", "#22c55e", "#10b981", "#14b8a6"];
const BAR_NEGATIVE_COLORS = ["#fb7185", "#f87171", "#ef4444", "#f97316"];
const LINE_COLORS = ["#2d2622", "#0f766e", "#2563eb", "#7c3aed"];
const BUDGET_CATEGORY_STORAGE_KEY = "couple-ledger.budget.selected-categories";

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

function formatBudgetCategoryLabel(
  category: { id: string; name: string; parentId?: string | null },
  categoryById: Map<string, { id: string; name: string }>
) {
  if (!category.parentId) {
    return category.name;
  }
  const parentName = categoryById.get(category.parentId)?.name;
  return parentName ? `${parentName} > ${category.name}` : category.name;
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
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showAllTopCategories, setShowAllTopCategories] = useState(false);
  const [budgetScope, setBudgetScope] = useState<"common" | string>("common");
  const [isBudgetSheetOpen, setIsBudgetSheetOpen] = useState(false);
  const [expandedBudgetParents, setExpandedBudgetParents] = useState<Set<string>>(
    () => new Set()
  );
  const [isCategorySelectOpen, setIsCategorySelectOpen] = useState(false);
  const [budgetCategoryConfigLoaded, setBudgetCategoryConfigLoaded] =
    useState(false);
  const [selectedBudgetCategoryIdsByScope, setSelectedBudgetCategoryIdsByScope] =
    useState<Record<string, string[]>>({});
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
  const categoriesWithId = categories as CategoryWithId[];
  const personalCategoryIdSet = useMemo(() => {
    return new Set(
      categoriesWithId
        .filter((category) => category.personalOnly)
        .map((category) => category.id)
    );
  }, [categoriesWithId]);
  const budgetCategoryIdSet = useMemo(() => {
    return new Set(
      categoriesWithId
        .filter((category) => category.type === "expense" && category.budgetEnabled)
        .map((category) => category.id)
    );
  }, [categoriesWithId]);
  const budgetSelectableCategories = useMemo(() => {
    return categoriesWithId
      .filter((category) => category.type === "expense")
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [categoriesWithId]);
  const budgetEnabledCategories = useMemo(() => {
    return categoriesWithId
      .filter((category) => category.type === "expense" && category.budgetEnabled)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [categoriesWithId]);
  const budgetTabCategories = budgetEnabledCategories;
  const activeSelectedCategoryIds =
    selectedBudgetCategoryIdsByScope[budgetScope] ?? [];
  const selectedBudgetCategoryIdSet = useMemo(
    () => new Set(activeSelectedCategoryIds),
    [activeSelectedCategoryIds]
  );
  const categoryById = useMemo(
    () => new Map(categoriesWithId.map((category) => [category.id, category])),
    [categoriesWithId]
  );
  const budgetParentCategories = useMemo(() => {
    return budgetSelectableCategories.filter((category) => !category.parentId);
  }, [budgetSelectableCategories]);
  const budgetParentIdSet = useMemo(() => {
    return new Set(budgetParentCategories.map((category) => category.id));
  }, [budgetParentCategories]);
  const budgetChildrenByParent = useMemo(() => {
    const map = new Map<string, CategoryWithId[]>();
    budgetSelectableCategories.forEach((category) => {
      if (!category.parentId) {
        return;
      }
      const bucket = map.get(category.parentId) ?? [];
      bucket.push(category);
      map.set(category.parentId, bucket);
    });
    map.forEach((list) =>
      list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    );
    return map;
  }, [budgetSelectableCategories]);
  const budgetOrphanCategories = useMemo(() => {
    return budgetSelectableCategories.filter(
      (category) => category.parentId && !categoryById.has(category.parentId)
    );
  }, [budgetSelectableCategories, categoryById]);
  useEffect(() => {
    if (!isCategorySelectOpen) {
      return;
    }
    if (expandedBudgetParents.size > 0) {
      return;
    }
    setExpandedBudgetParents(new Set(budgetParentCategories.map((cat) => cat.id)));
  }, [budgetParentCategories, expandedBudgetParents, isCategorySelectOpen]);
  const budgetCategories = useMemo(() => {
    if (activeSelectedCategoryIds.length === 0) {
      return budgetSelectableCategories;
    }
    return budgetSelectableCategories.filter((category) =>
      selectedBudgetCategoryIdSet.has(category.id)
    );
  }, [
    activeSelectedCategoryIds.length,
    budgetSelectableCategories,
    selectedBudgetCategoryIdSet,
  ]);
  useEffect(() => {
    if (!householdId || typeof window === "undefined") {
      return;
    }
    let active = true;
    setBudgetCategoryConfigLoaded(false);
    const storageKey = `${BUDGET_CATEGORY_STORAGE_KEY}.${householdId}`;
    const enabledIds = budgetSelectableCategories.map((category) => category.id);
    const enabledSet = new Set(enabledIds);
    let stored: Record<string, string[]> = {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      stored = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    } catch {
      stored = {};
    }
    const normalizeSelectionMap = (source: Record<string, string[]>) => {
      const next: Record<string, string[]> = {};
      Object.entries(source).forEach(([scope, ids]) => {
        if (!Array.isArray(ids)) {
          return;
        }
        const filtered = ids.filter(
          (id) => enabledSet.has(id) && budgetParentIdSet.has(id)
        );
        if (filtered.length > 0) {
          next[scope] = filtered;
        }
      });
      return next;
    };

    const initialMap = normalizeSelectionMap(stored);
    setSelectedBudgetCategoryIdsByScope(initialMap);

    const loadConfig = async () => {
      try {
        const ref = doc(budgetsCol(householdId), "config");
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          return;
        }
        const data = snap.data() as BudgetConfigDoc;
        if (!data.selectedCategoryIdsByScope) {
          return;
        }
        const normalized = normalizeSelectionMap(data.selectedCategoryIdsByScope);
        if (active) {
          setSelectedBudgetCategoryIdsByScope(normalized);
        }
      } finally {
        if (active) {
          setBudgetCategoryConfigLoaded(true);
        }
      }
    };

    loadConfig();

    return () => {
      active = false;
    };
  }, [budgetSelectableCategories, budgetParentIdSet, householdId]);
  useEffect(() => {
    if (!householdId || !budgetCategoryConfigLoaded || typeof window === "undefined") {
      return;
    }
    const storageKey = `${BUDGET_CATEGORY_STORAGE_KEY}.${householdId}`;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(selectedBudgetCategoryIdsByScope)
    );
    setDoc(
      doc(budgetsCol(householdId), "config"),
      {
        selectedCategoryIdsByScope: selectedBudgetCategoryIdsByScope,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [
    householdId,
    budgetCategoryConfigLoaded,
    selectedBudgetCategoryIdsByScope,
  ]);
  const maxBudgetTabs = budgetTabCategories.length > 3 ? 2 : 3;
  const budgetTabs = budgetTabCategories.slice(0, maxBudgetTabs);
  const hasMoreBudgetTabs = budgetTabCategories.length > maxBudgetTabs;
  const effectiveBudgetScope = budgetCategoryIdSet.has(budgetScope)
    ? budgetScope
    : "common";
  const budgetScopeLabel =
    effectiveBudgetScope === "common"
      ? "공용"
      : categoryById.get(effectiveBudgetScope)?.name ?? "카테고리";
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
      if (tx.type === "expense" && tx.budgetExcluded) {
        return false;
      }
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

  const budgetInputCategories = useMemo(() => {
    if (effectiveBudgetScope !== "common") {
      const scoped = categoryById.get(effectiveBudgetScope);
      if (!scoped) {
        return [];
      }
      return scoped.parentId ? [] : [scoped];
    }
    return budgetCategories
      .filter((cat) => cat.type === "expense")
      .filter((cat) => !cat.parentId)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [budgetCategories, categoryById, effectiveBudgetScope]);
  const budgetInputCategoryIdSet = useMemo(
    () => new Set(budgetInputCategories.map((category) => category.id)),
    [budgetInputCategories]
  );

  const selectedMonthExpenses = useMemo(() => {
    if (!effectiveSelectedMonthKey) {
      return [];
    }
    return visibleTransactions.filter((tx) => {
      if (tx.type !== "expense") {
        return false;
      }
      if (tx.budgetExcluded) {
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
  const categorySpendById = useMemo(() => {
    const totals: Record<string, number> = {};
    selectedMonthExpenses.forEach((tx) => {
      const category = categoryMap.get(tx.categoryId);
      if (!category) {
        return;
      }
      totals[category.id] = (totals[category.id] ?? 0) + tx.amount;
      if (category.parentId && budgetInputCategoryIdSet.has(category.parentId)) {
        totals[category.parentId] = (totals[category.parentId] ?? 0) + tx.amount;
      }
    });
    return totals;
  }, [budgetInputCategoryIdSet, categoryMap, selectedMonthExpenses]);

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
        setCategoryBudgets({});
      }
    };
    loadBudget();
    return () => {
      active = false;
    };
  }, [householdId, effectiveSelectedMonthKey, user]);

  const totalCategoryBudget = useMemo(() => {
    return budgetInputCategories.reduce((sum, category) => {
      const value = Number(normalizeNumberInput(categoryBudgets[category.id] ?? ""));
      return sum + (Number.isNaN(value) ? 0 : value);
    }, 0);
  }, [budgetInputCategories, categoryBudgets]);
  const scopedBudgetValue =
    effectiveBudgetScope === "common"
      ? totalCategoryBudget
      : Number(normalizeNumberInput(categoryBudgets[effectiveBudgetScope] ?? ""));
  const budgetProgress =
    scopedBudgetValue > 0 && selectedPoint
      ? Math.min(
          100,
          Math.round((selectedPoint.expense / scopedBudgetValue) * 100)
        )
      : 0;

  const handleCategoryBudgetChange = (categoryId: string, value: string) => {
    setCategoryBudgets((prev) => ({ ...prev, [categoryId]: formatNumberInput(value) }));
  };
  const toggleBudgetCategorySelection = useCallback(
    (categoryId: string) => {
      if (!budgetParentIdSet.has(categoryId)) {
        return;
      }
      setSelectedBudgetCategoryIdsByScope((prev) => {
        const next = { ...prev };
        const current = new Set(next[budgetScope] ?? []);
        if (current.has(categoryId)) {
          current.delete(categoryId);
        } else {
          current.add(categoryId);
        }
        if (current.size === 0) {
          delete next[budgetScope];
          return next;
        }
        next[budgetScope] = Array.from(current);
        return next;
      });
    },
    [budgetScope, budgetParentIdSet]
  );
  const handleSelectAllBudgetCategories = useCallback(() => {
    const ids = budgetParentCategories.map((category) => category.id);
    setSelectedBudgetCategoryIdsByScope((prev) => ({
      ...prev,
      [budgetScope]: ids,
    }));
  }, [budgetParentCategories, budgetScope]);
  const handleResetBudgetCategories = useCallback(() => {
    setSelectedBudgetCategoryIdsByScope((prev) => {
      const next = { ...prev };
      delete next[budgetScope];
      return next;
    });
  }, [budgetScope]);
  const toggleBudgetParentExpand = useCallback((categoryId: string) => {
    setExpandedBudgetParents((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

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
    const total = budgetInputCategories.reduce((sum, category) => {
      const raw = categoryBudgets[category.id] ?? "";
      const num = Number(normalizeNumberInput(raw));
      return sum + (Number.isNaN(num) ? 0 : num);
    }, 0);
    await setDoc(
      doc(budgetsCol(householdId), effectiveSelectedMonthKey),
      {
        monthKey: effectiveSelectedMonthKey,
        total,
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
              {formatBudgetCategoryLabel(category, categoryById)}
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
            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">총 예산</p>
            <p className="mt-2 text-2xl font-semibold">
              {formatKrw(totalCategoryBudget)}
            </p>
            {saveMessage ? (
              <div className="mt-2 text-xs text-[color:rgba(45,38,34,0.6)]">
                {saveMessage}
              </div>
            ) : null}
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
                  {format(selectedPoint.month, "yyyy년 M월")} 지출{" "}
                  {formatKrw(selectedPoint.expense)}
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">카테고리별 예산</p>
              <p className="mt-1 text-xs text-[color:rgba(45,38,34,0.6)]">
                선택 월 기준으로 카테고리 예산을 입력하세요.
              </p>
            </div>
            {effectiveBudgetScope === "common" ? (
              <button
                type="button"
                className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[color:rgba(45,38,34,0.7)]"
                onClick={() => setIsCategorySelectOpen(true)}
              >
                카테고리 편집
              </button>
            ) : null}
          </div>
          <div className="mt-3 space-y-3">
            {budgetInputCategories.length === 0 ? (
              <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                지출 카테고리가 없습니다.
              </p>
            ) : (
              budgetInputCategories.map((category) => {
                const raw = categoryBudgets[category.id] ?? "";
                const budget = Number(normalizeNumberInput(raw));
                const spent = categorySpendById[category.id] ?? 0;
                const progress =
                  !Number.isNaN(budget) && budget > 0
                    ? Math.min(100, Math.round((spent / budget) * 100))
                    : 0;
                return (
                  <div key={category.id} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {formatBudgetCategoryLabel(category, categoryById)}
                      </span>
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
              {selectedPoint ? (
                <div
                  className="pointer-events-none absolute rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-[var(--text)] shadow-sm"
                  style={{
                    left: `${Math.round(
                      (monthPoints.findIndex(
                        (point) =>
                          format(point.month, "yyyy-MM") ===
                          effectiveSelectedMonthKey
                      ) /
                        Math.max(monthPoints.length - 1, 1)) *
                        100
                    )}%`,
                    top: "18px",
                    transform: "translateX(-50%)",
                  }}
                >
                  {formatKrw(selectedPoint.net)}
                </div>
              ) : null}
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
                  {budgetTabCategories.map((category) => (
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
                      {formatBudgetCategoryLabel(category, categoryById)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {isCategorySelectOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsCategorySelectOpen(false)}
              aria-label="닫기"
            />
            <div className="absolute bottom-0 left-0 right-0 flex max-h-[70vh] flex-col rounded-t-3xl bg-white">
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-[color:rgba(45,38,34,0.15)]" />
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold">
                    예산 카테고리 선택 · {budgetScopeLabel}
                  </div>
                  <button
                    type="button"
                    className="text-sm text-[color:rgba(45,38,34,0.6)]"
                    onClick={() => setIsCategorySelectOpen(false)}
                  >
                    닫기
                  </button>
                </div>
                <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.6)]">
                  {budgetScopeLabel} 탭에서 사용할 카테고리를 선택하세요.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-full border border-[var(--border)] px-4 py-2 text-sm"
                    onClick={handleSelectAllBudgetCategories}
                  >
                    전체 선택
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                    onClick={handleResetBudgetCategories}
                  >
                    초기화
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {budgetSelectableCategories.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[color:rgba(45,38,34,0.6)]">
                      예산 카테고리가 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {budgetParentCategories.map((category) => {
                        const isSelected = selectedBudgetCategoryIdSet.has(
                          category.id
                        );
                        const children =
                          budgetChildrenByParent.get(category.id) ?? [];
                        const isExpanded = expandedBudgetParents.has(category.id);
                        return (
                          <div
                            key={category.id}
                            className="rounded-2xl border border-[var(--border)] bg-white"
                          >
                            <div
                              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm ${
                                isSelected
                                  ? "border border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                                  : "text-[color:rgba(45,38,34,0.7)]"
                              }`}
                            >
                              <button
                                type="button"
                                className="flex flex-1 items-center justify-between gap-3 text-left"
                                onClick={() =>
                                  toggleBudgetCategorySelection(category.id)
                                }
                              >
                                <span>
                                  {formatBudgetCategoryLabel(
                                    category,
                                    categoryById
                                  )}
                                </span>
                                <span className="text-xs text-[color:rgba(45,38,34,0.5)]">
                                  소분류 {children.length}개
                                </span>
                              </button>
                              {children.length > 0 ? (
                                <button
                                  type="button"
                                  className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs"
                                  onClick={() => toggleBudgetParentExpand(category.id)}
                                  aria-label={
                                    isExpanded ? "소분류 접기" : "소분류 펼치기"
                                  }
                                >
                                  {isExpanded ? "⌃" : "⌄"}
                                </button>
                              ) : null}
                            </div>
                            {children.length > 0 && isExpanded ? (
                              <div className="space-y-2 border-t border-[var(--border)] px-4 py-3">
                                <div className="text-xs text-[color:rgba(45,38,34,0.5)]">
                                  소분류
                                </div>
                                {children.map((child) => (
                                  <div
                                    key={child.id}
                                    className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2 text-left text-sm text-[color:rgba(45,38,34,0.7)]"
                                  >
                                    <span>
                                      {formatBudgetCategoryLabel(child, categoryById)}
                                    </span>
                                    <span className="text-xs text-[color:rgba(45,38,34,0.5)]">
                                      대분류에서 선택
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {budgetOrphanCategories.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-xs text-[color:rgba(45,38,34,0.5)]">
                            기타
                          </div>
                          {budgetOrphanCategories.map((category) => {
                            const isSelected = selectedBudgetCategoryIdSet.has(
                              category.id
                            );
                            return (
                              <button
                                key={category.id}
                                type="button"
                                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${
                                  isSelected
                                    ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                                    : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
                                }`}
                                onClick={() =>
                                  toggleBudgetCategorySelection(category.id)
                                }
                              >
                                <span>
                                  {formatBudgetCategoryLabel(
                                    category,
                                    categoryById
                                  )}
                                </span>
                                <span className="text-xs text-[color:rgba(45,38,34,0.5)]">
                                  {isSelected ? "추가됨" : "미선택"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <button
        type="button"
        onClick={handleSaveBudget}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--text)] text-sm text-white shadow-lg"
        aria-label="예산 저장"
        disabled={saving}
      >
        {saving ? "..." : "저장"}
      </button>
    </div>
  );
}
