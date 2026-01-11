"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { formatKrw } from "@/lib/format";
import { toMonthKey } from "@/lib/time";
import { toDateKey } from "@/lib/time";
import { useCategories } from "@/hooks/use-categories";
import { useMonthlyTransactions, useTransactionsRange } from "@/hooks/use-transactions";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function parseLocalDate(value: string) {
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateParam(value: string) {
  return parseLocalDate(value);
}

function formatPaymentMethod(value: string) {
  if (value === "cash") {
    return "현금";
  }
  if (value === "card") {
    return "카드";
  }
  if (value === "transfer") {
    return "계좌이체";
  }
  return value || "결제수단";
}

function stripRecorderPrefix(note?: string) {
  if (!note) {
    return "메모 없음";
  }
  return note.replace(/^입력자:[^\s]+\s*/u, "").trim() || "메모 없음";
}

const BUDGET_HIGHLIGHT_CLASSES = [
  "border-slate-200 bg-slate-50",
  "border-stone-200 bg-stone-50",
  "border-neutral-200 bg-neutral-50",
  "border-zinc-200 bg-zinc-50",
  "border-gray-200 bg-gray-50",
  "border-slate-100 bg-slate-50/70",
  "border-stone-100 bg-stone-50/70",
  "border-neutral-100 bg-neutral-50/70",
];

type TransactionListItemProps = {
  id: string;
  title: string;
  subtitle: string;
  amountText: string;
  amountClass: string;
  highlightClass: string;
  onOpen: (id: string) => void;
};

const TransactionListItem = memo(function TransactionListItem({
  id,
  title,
  subtitle,
  amountText,
  amountClass,
  highlightClass,
  onOpen,
}: TransactionListItemProps) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 rounded-2xl border px-4 py-3 ${highlightClass}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onOpen(id);
        }
      }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="text-xs text-[color:rgba(45,38,34,0.65)]">{subtitle}</p>
      </div>
      <div className="flex items-center gap-4 self-center">
        <span className={amountClass}>{amountText}</span>
      </div>
    </div>
  );
});

type SearchResultItemProps = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  amountText: string;
  amountClass: string;
  onOpen: (href: string) => void;
};

const SearchResultItem = memo(function SearchResultItem({
  id,
  href,
  title,
  subtitle,
  amountText,
  amountClass,
  onOpen,
}: SearchResultItemProps) {
  return (
    <button
      key={id}
      type="button"
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[var(--border)] px-4 py-3 text-left text-sm"
      onClick={() => onOpen(href)}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        <p className="mt-1 text-xs text-[color:rgba(45,38,34,0.6)]">
          {subtitle}
        </p>
      </div>
      <span className={amountClass}>{amountText}</span>
    </button>
  );
});

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const { categories } = useCategories(householdId);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const monthStart = useMemo(
    () => startOfMonth(selectedDate),
    [selectedDate]
  );
  const monthEnd = useMemo(() => endOfMonth(selectedDate), [selectedDate]);
  const monthKey = useMemo(() => toMonthKey(selectedDate), [selectedDate]);
  const { transactions, loading } = useMonthlyTransactions(householdId, monthKey);
  const [showPicker, setShowPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<
    "all" | "income" | "expense" | "transfer"
  >("all");
  const [searchStart, setSearchStart] = useState<Date | null>(() =>
    startOfDay(startOfMonth(new Date()))
  );
  const [searchEnd, setSearchEnd] = useState<Date | null>(() =>
    endOfDay(endOfMonth(new Date()))
  );
  const [yearValue, setYearValue] = useState(() => new Date().getFullYear());
  const [monthValue, setMonthValue] = useState(() => new Date().getMonth());
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const searchStartRef = useRef<HTMLInputElement | null>(null);
  const searchEndRef = useRef<HTMLInputElement | null>(null);
  const lastAppliedDateParamRef = useRef<string | null>(null);
  const [listSortMode, setListSortMode] = useState<
    "input" | "alpha" | "category"
  >(() => {
    if (typeof window === "undefined") {
      return "input";
    }
    const stored = window.localStorage.getItem("transactions:listSortMode");
    if (stored === "input" || stored === "alpha" || stored === "category") {
      return stored;
    }
    return "input";
  });
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(30);
  const [searchVisibleCount, setSearchVisibleCount] = useState(50);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("transactions:listSortMode", listSortMode);
  }, [listSortMode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination on filters
    setVisibleCount(30);
  }, [selectedDate, listSortMode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset search pagination on filters
    setSearchVisibleCount(50);
  }, [showSearch, searchQuery, searchType, searchStart, searchEnd]);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
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
  const categoryOrderMap = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category.order]));
  }, [categories]);

  const budgetHighlightByCategory = useMemo(() => {
    const map = new Map<string, string>();
    const source = [...categories].sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.name.localeCompare(b.name);
    });
    source.forEach((category, index) => {
      map.set(
        category.id,
        BUDGET_HIGHLIGHT_CLASSES[index % BUDGET_HIGHLIGHT_CLASSES.length]
      );
    });
    return map;
  }, [categories]);

  const dateParam = searchParams.get("date");

  useEffect(() => {
    if (!dateParam) {
      return;
    }
    if (dateParam === lastAppliedDateParamRef.current) {
      return;
    }
    const parsed = parseDateParam(dateParam);
    if (parsed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL date sync
      setSelectedDate(parsed);
      lastAppliedDateParamRef.current = dateParam;
    }
  }, [dateParam]);

  const shouldSearchRange = Boolean(showSearch && searchStart && searchEnd);
  const { transactions: searchTransactions, loading: searchLoading } =
    useTransactionsRange(
      householdId,
      shouldSearchRange ? searchStart : null,
      shouldSearchRange ? searchEnd : null
    );
  const currentUserId = user?.uid ?? null;
  const visibleSearchTransactions = useMemo(() => {
    if (!shouldSearchRange) {
      return [];
    }
    if (!currentUserId || personalCategoryIdSet.size === 0) {
      return searchTransactions;
    }
    return searchTransactions.filter(
      (tx) =>
        !personalCategoryIdSet.has(tx.categoryId) ||
        tx.createdBy === currentUserId ||
        tx.budgetApplied === true
    );
  }, [currentUserId, personalCategoryIdSet, searchTransactions, shouldSearchRange]);
  const visibleTransactions = useMemo(() => {
    if (!currentUserId || personalCategoryIdSet.size === 0) {
      return transactions;
    }
    return transactions.filter(
      (tx) =>
        !personalCategoryIdSet.has(tx.categoryId) ||
        tx.createdBy === currentUserId ||
        tx.budgetApplied === true
    );
  }, [currentUserId, personalCategoryIdSet, transactions]);

  const { days, calendarDisplayMap, dailyItemsMap } = useMemo(() => {
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const daysList: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      daysList.push(day);
      day = addDays(day, 1);
    }
    const calendarMap = new Map<
      string,
      { income: number; expense: number; items: typeof transactions }
    >();
    const displayMap = new Map<string, { incomeText: string; expenseText: string }>();
    const itemsMap = new Map<string, typeof transactions>();
    visibleTransactions.forEach((tx) => {
      const key = toDateKey(tx.date.toDate());
      const items = itemsMap.get(key) ?? [];
      items.push(tx);
      itemsMap.set(key, items);
      if (
        tx.type === "expense" &&
        budgetCategoryIdSet.has(tx.categoryId) &&
        !tx.budgetApplied
      ) {
        return;
      }
      const entry = calendarMap.get(key) ?? { income: 0, expense: 0, items: [] };
      entry.items.push(tx);
      if (tx.type === "income") {
        entry.income += tx.amount;
      } else if (tx.type === "expense") {
        entry.expense += tx.amount;
      }
      calendarMap.set(key, entry);
    });
    calendarMap.forEach((entry, key) => {
      displayMap.set(key, {
        incomeText: formatKrw(entry.income),
        expenseText: formatKrw(entry.expense),
      });
    });
    return {
      days: daysList,
      calendarDisplayMap: displayMap,
      dailyItemsMap: itemsMap,
    };
  }, [monthEnd, monthStart, visibleTransactions, budgetCategoryIdSet]);

  const zeroAmountText = useMemo(() => formatKrw(0), []);
  const selectedKey = toDateKey(selectedDate);
  const selectedDateParam = useMemo(
    () => format(selectedDate, "yyyy-MM-dd"),
    [selectedDate]
  );
  const selectedItems = useMemo(
    () => dailyItemsMap.get(selectedKey) ?? [],
    [dailyItemsMap, selectedKey]
  );
  const selectedItemNameMap = useMemo(() => {
    const map = new Map<string, { display: string; normalized: string }>();
    selectedItems.forEach((tx) => {
      const display = stripRecorderPrefix(tx.note);
      map.set(tx.id, { display, normalized: display.toLowerCase() });
    });
    return map;
  }, [selectedItems]);
  const selectedItemsSortLabel = useMemo(() => {
    if (listSortMode === "alpha") {
      return "가나다순";
    }
    if (listSortMode === "category") {
      return "카테고리순";
    }
    return "입력순";
  }, [listSortMode]);
  const selectedSortMeta = useMemo(() => {
    const meta = new Map<string, { time: number; categoryOrder: number }>();
    selectedItems.forEach((tx) => {
      meta.set(tx.id, {
        time: tx.createdAt?.toMillis?.() ?? tx.date.toMillis(),
        categoryOrder: categoryOrderMap.get(tx.categoryId) ?? 9999,
      });
    });
    return meta;
  }, [selectedItems, categoryOrderMap]);
  const sortedSelectedItems = useMemo(() => {
    const normalizedName = (tx: typeof selectedItems[number]) =>
      selectedItemNameMap.get(tx.id)?.normalized ??
      stripRecorderPrefix(tx.note).toLowerCase();
    return [...selectedItems].sort((a, b) => {
      if (listSortMode === "alpha") {
        return normalizedName(a).localeCompare(normalizedName(b));
      }
      if (listSortMode === "category") {
        const aOrder = selectedSortMeta.get(a.id)?.categoryOrder ?? 9999;
        const bOrder = selectedSortMeta.get(b.id)?.categoryOrder ?? 9999;
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return normalizedName(a).localeCompare(normalizedName(b));
      }
      const aTime = selectedSortMeta.get(a.id)?.time ?? 0;
      const bTime = selectedSortMeta.get(b.id)?.time ?? 0;
      return aTime - bTime;
    });
  }, [selectedItems, listSortMode, selectedItemNameMap, selectedSortMeta]);

  const swipeThreshold = 150;

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      setTouchEndX(null);
      setTouchStartX(event.touches[0]?.clientX ?? null);
    },
    []
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      setTouchEndX(event.touches[0]?.clientX ?? null);
    },
    []
  );

  const handleTouchEnd = useCallback(() => {
    if (touchStartX === null || touchEndX === null) {
      return;
    }
    const delta = touchStartX - touchEndX;
    if (Math.abs(delta) < swipeThreshold) {
      return;
    }
    if (delta > 0) {
      setSelectedDate(addDays(monthEnd, 1));
    } else {
      setSelectedDate(addDays(monthStart, -1));
    }
  }, [monthEnd, monthStart, touchEndX, touchStartX]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, idx) => currentYear - 5 + idx);
  }, []);

  const openMonthPicker = useCallback(() => {
    setYearValue(selectedDate.getFullYear());
    setMonthValue(selectedDate.getMonth());
    setShowPicker(true);
  }, [selectedDate]);

  const handlePickerConfirm = useCallback(() => {
    setSelectedDate(new Date(yearValue, monthValue, 1));
    setShowPicker(false);
  }, [monthValue, yearValue]);

  const openSearchSheet = useCallback(() => {
    setSearchStart(startOfDay(monthStart));
    setSearchEnd(endOfDay(monthEnd));
    setShowSearch(true);
  }, [monthEnd, monthStart]);

  function toInputDate(value: Date | null) {
    return value ? format(value, "yyyy-MM-dd") : "";
  }

  const handleSearchStart = useCallback(
    (value: string) => {
    if (!value) {
      setSearchStart(null);
      return;
    }
    const parsed = parseLocalDate(value);
    if (!parsed) {
      return;
    }
    const nextStart = startOfDay(parsed);
    setSearchStart(nextStart);
    if (!searchEnd) {
      setSearchEnd(endOfDay(parsed));
    }
    setTimeout(() => {
      searchEndRef.current?.focus();
    }, 0);
    },
    [searchEnd]
  );

  const handleSearchEnd = useCallback((value: string) => {
    if (!value) {
      setSearchEnd(null);
      return;
    }
    const parsed = parseLocalDate(value);
    if (!parsed) {
      return;
    }
    setSearchEnd(endOfDay(parsed));
  }, []);

  const applySearchRange = useCallback((months: number) => {
    const endDate = endOfDay(new Date());
    const startDate = startOfDay(addMonths(endDate, -months));
    setSearchStart(startDate);
    setSearchEnd(endDate);
  }, []);

  const applySearchPreset = useCallback((preset: "week" | "month" | "custom") => {
    const today = new Date();
    if (preset === "week") {
      setSearchStart(startOfDay(startOfWeek(today, { weekStartsOn: 0 })));
      setSearchEnd(endOfDay(today));
      return;
    }
    if (preset === "month") {
      setSearchStart(startOfDay(startOfMonth(today)));
      setSearchEnd(endOfDay(today));
      return;
    }
    setSearchStart(startOfDay(today));
    setSearchEnd(endOfDay(today));
    setTimeout(() => {
      searchStartRef.current?.focus();
    }, 0);
  }, []);

  const filteredSearchItems = useMemo(() => {
    if (!showSearch) {
      return [];
    }
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return visibleSearchTransactions.filter((tx) => {
      if (searchType !== "all" && tx.type !== searchType) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const categoryName = categoryMap.get(tx.categoryId) ?? "";
      const noteText = stripRecorderPrefix(tx.note);
      const haystack = [
        noteText,
        categoryName,
        tx.subject ?? "",
        formatPaymentMethod(tx.paymentMethod),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [
    showSearch,
    visibleSearchTransactions,
    searchType,
    searchQuery,
    categoryMap,
  ]);

  const searchTotal = useMemo(
    () => filteredSearchItems.reduce((sum, tx) => sum + tx.amount, 0),
    [filteredSearchItems]
  );
  const searchRenderItems = useMemo(
    () =>
      filteredSearchItems.map((tx) => {
        const noteText = stripRecorderPrefix(tx.note);
        const categoryName = categoryMap.get(tx.categoryId) ?? "미분류";
        const subtitle = `${format(tx.date.toDate(), "yyyy.MM.dd")} · ${categoryName} · ${
          tx.subject || "주체"
        }`;
        const amountClass =
          tx.type === "expense"
            ? "text-red-600"
            : tx.type === "income"
            ? "text-emerald-600"
            : "text-[color:rgba(45,38,34,0.7)]";
        const sign =
          tx.type === "expense" ? "-" : tx.type === "income" ? "+" : "";
        return {
          id: tx.id,
          href: `/transactions/${tx.id}`,
          title: noteText,
          subtitle,
          amountClass,
          amountText: `${sign}${formatKrw(tx.amount)}`,
        };
      }),
    [filteredSearchItems, categoryMap]
  );

  const visibleSearchItems = useMemo(
    () => searchRenderItems.slice(0, searchVisibleCount),
    [searchRenderItems, searchVisibleCount]
  );

  const handleSortToggle = useCallback(() => {
    setListSortMode((prev) =>
      prev === "input" ? "alpha" : prev === "alpha" ? "category" : "input"
    );
  }, []);

  const openTransaction = useCallback(
    (id: string) => {
      router.push(`/transactions/${id}`);
    },
    [router]
  );
  const openSearchResult = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );
  const transactionCards = useMemo(() => {
    return sortedSelectedItems.map((tx) => {
      const amountClass =
        tx.type === "expense"
          ? "text-red-600"
          : tx.type === "income"
          ? "text-emerald-600"
          : "text-[color:rgba(45,38,34,0.7)]";
      const amountText = `${tx.type === "expense" ? "-" : tx.type === "income" ? "+" : ""}${formatKrw(tx.amount)}`;
      const highlightClass =
        tx.type === "expense" &&
        budgetCategoryIdSet.has(tx.categoryId) &&
        !tx.budgetApplied
          ? budgetHighlightByCategory.get(tx.categoryId) ??
            "border-violet-300 bg-violet-100"
          : "border-[var(--border)]";
      return {
        id: tx.id,
        title: stripRecorderPrefix(tx.note),
        subtitle: `${categoryMap.get(tx.categoryId) ?? "미분류"} · ${
          tx.subject || "주체"
        } · ${formatPaymentMethod(tx.paymentMethod)}`,
        amountClass,
        amountText,
        highlightClass,
      };
    });
  }, [sortedSelectedItems, budgetCategoryIdSet, budgetHighlightByCategory, categoryMap]);

  return (
    <div className="flex flex-col gap-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">내역</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-sm"
            onClick={openSearchSheet}
            aria-label="검색"
            title="검색"
          >
            🔍
          </button>
          <Link
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-sm"
            href="/stats"
            aria-label="통계"
            title="통계"
          >
            📊
          </Link>
          <Link
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white"
            href={`/transactions/new?date=${selectedDateParam}`}
            aria-label="새 내역"
            title="새 내역"
          >
            ➕
          </Link>
        </div>
      </div>
      <section
        className="rounded-t-3xl border border-b-0 border-[var(--border)] bg-white px-0 py-3"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-[var(--border)] px-3 py-1 text-sm"
              onClick={() =>
                setSelectedDate(addDays(monthStart, -1))
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
                setSelectedDate(addDays(monthEnd, 1))
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
        <div className="mt-2 grid grid-cols-7 gap-2 text-center text-xs text-[color:rgba(45,38,34,0.6)]">
          {DAY_LABELS.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="mt-0.5 grid grid-cols-7 gap-0 px-0">
          {days.map((day) => {
            const key = toDateKey(day);
            const display = calendarDisplayMap.get(key);
            const isActive = isSameDay(day, selectedDate);
            return (
              <button
                key={key}
                className={`border px-2 py-2 text-left text-xs ${
                  isActive
                    ? "border-[var(--accent)] bg-[rgba(59,47,47,0.08)]"
                    : "border-[var(--border)]"
                } ${isSameMonth(day, selectedDate) ? "" : "opacity-40"}`}
                onClick={() => setSelectedDate(day)}
              >
                <div className="text-sm font-semibold">{format(day, "d")}</div>
                <div className="mt-1 space-y-0.5 text-[9px] leading-tight text-[color:rgba(45,38,34,0.6)]">
                  <div className="text-blue-600">
                    <span className="block break-all">
                      {display?.incomeText ?? zeroAmountText}
                    </span>
                  </div>
                  <div className="text-red-600">
                    <span className="block break-all">
                      {display?.expenseText ?? zeroAmountText}
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
      {showSearch ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-white p-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => setShowSearch(false)}
              >
                닫기
              </button>
              <h2 className="text-base font-semibold">검색</h2>
              <div className="w-14" />
            </div>
            <div className="mt-4 space-y-4">
              <label className="block text-sm text-[color:rgba(45,38,34,0.6)]">
                검색어
                <input
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm"
                  placeholder="메모, 카테고리, 주체"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <div>
                <p className="text-xs text-[color:rgba(45,38,34,0.6)]">유형</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { key: "all", label: "전체" },
                    { key: "income", label: "입금" },
                    { key: "expense", label: "지출" },
                    { key: "transfer", label: "이체" },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`rounded-full border px-4 py-2 text-sm ${
                        searchType === option.key
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
                      }`}
                      onClick={() =>
                        setSearchType(
                          option.key as "all" | "income" | "expense" | "transfer"
                        )
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  조회 기간
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-[var(--border)] px-3 py-2 text-sm"
                    value={toInputDate(searchStart)}
                    onChange={(event) => handleSearchStart(event.target.value)}
                    ref={searchStartRef}
                  />
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-[var(--border)] px-3 py-2 text-sm"
                    value={toInputDate(searchEnd)}
                    onChange={(event) => handleSearchEnd(event.target.value)}
                    ref={searchEndRef}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { months: 1, label: "1개월" },
                    { months: 3, label: "3개월" },
                    { months: 6, label: "6개월" },
                  ].map((option) => (
                    <button
                      key={option.months}
                      type="button"
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                      onClick={() => applySearchRange(option.months)}
                    >
                      {option.label}
                    </button>
                  ))}
                  {[
                    { key: "week", label: "이번주" },
                    { key: "month", label: "이번달" },
                    { key: "custom", label: "사용자 지정" },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                      onClick={() =>
                        applySearchPreset(
                          option.key as "week" | "month" | "custom"
                        )
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-[color:rgba(45,38,34,0.6)]">
                <span>합계</span>
                <span className="text-[color:rgba(45,38,34,0.9)]">
                  {formatKrw(searchTotal)}
                </span>
              </div>
              <div className="max-h-[45vh] space-y-2 overflow-y-auto pb-2">
                {searchLoading ? (
                  <p className="text-sm text-[color:rgba(45,38,34,0.6)]">
                    검색 중...
                  </p>
                ) : searchRenderItems.length === 0 ? (
                  <p className="text-sm text-[color:rgba(45,38,34,0.6)]">
                    검색 결과가 없습니다.
                  </p>
                ) : (
                  visibleSearchItems.map((item) => (
                    <SearchResultItem
                      key={item.id}
                      id={item.id}
                      href={item.href}
                      title={item.title}
                      subtitle={item.subtitle}
                      amountText={item.amountText}
                      amountClass={item.amountClass}
                      onOpen={openSearchResult}
                    />
                  ))
                )}
              </div>
              {searchRenderItems.length > searchVisibleCount ? (
                <button
                  type="button"
                  className="w-full rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                  onClick={() =>
                    setSearchVisibleCount((prev) =>
                      Math.min(prev + 50, searchRenderItems.length)
                    )
                  }
                >
                  더보기
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <section className="rounded-b-3xl border border-t-0 border-[var(--border)] bg-white p-3">
        {loading ? (
          <div className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
            불러오는 중...
          </div>
        ) : selectedItems.length === 0 ? (
          <div className="mt-2" />
        ) : (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-end">
                <button
                  type="button"
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-[11px] text-[color:rgba(45,38,34,0.7)]"
                  onClick={handleSortToggle}
                >
                  {selectedItemsSortLabel}
                </button>
              </div>
            {transactionCards.slice(0, visibleCount).map((item) => (
              <TransactionListItem
                key={item.id}
                id={item.id}
                title={item.title}
                subtitle={item.subtitle}
                amountText={item.amountText}
                amountClass={item.amountClass}
                highlightClass={item.highlightClass}
                onOpen={openTransaction}
              />
            ))}
            {transactionCards.length > visibleCount ? (
              <button
                type="button"
                className="w-full rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                onClick={() =>
                  setVisibleCount((prev) =>
                    Math.min(prev + 30, transactionCards.length)
                  )
                }
              >
                더보기
              </button>
            ) : null}
          </div>
        )}
        <div className="mt-4 flex justify-center">
          <Link
            className="rounded-full border border-[var(--border)] bg-[var(--card)] px-8 py-3 text-sm text-[var(--text)]"
            href={`/transactions/new?date=${selectedDateParam}`}
          >
            새 내역 등록
          </Link>
        </div>
      </section>
    </div>
  );
}
