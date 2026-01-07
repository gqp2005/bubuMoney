"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
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
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useAuth } from "@/components/auth-provider";
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

type StoredStatsFilters = {
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

function loadStoredStatsFilters(): StoredStatsFilters | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StoredStatsFilters;
  } catch (err) {
    window.localStorage.removeItem(STATS_STORAGE_KEY);
    return null;
  }
}

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

function parseLocalDate(value: string) {
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSelectionSummary(names: string[]) {
  if (names.length === 0) {
    return "전체";
  }
  if (names.length > 3) {
    return `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}개`;
  }
  return names.join(", ");
}

type RangeMode = "monthly" | "custom";

type RangeSheetProps = {
  open: boolean;
  onClose: () => void;
  rangeMode: RangeMode;
  setRangeMode: (mode: RangeMode) => void;
  customStart: string;
  customEnd: string;
  updateCustomStart: (value: string) => void;
  setCustomEnd: (value: string) => void;
  customMonthDate: Date;
  setCustomMonthDate: (value: Date) => void;
  monthDate: Date;
  customCalendarDays: Date[];
  customStartDate: Date | null;
  customEndDate: Date | null;
  yearOptions: number[];
  selectedYear: number;
  selectedMonth: number;
  setSelectedYear: (value: number) => void;
  setSelectedMonth: (value: number) => void;
  onConfirm: () => void;
};

const RangeSheet = memo(function RangeSheet({
  open,
  onClose,
  rangeMode,
  setRangeMode,
  customStart,
  customEnd,
  updateCustomStart,
  setCustomEnd,
  customMonthDate,
  setCustomMonthDate,
  monthDate,
  customCalendarDays,
  customStartDate,
  customEndDate,
  yearOptions,
  selectedYear,
  selectedMonth,
  setSelectedYear,
  setSelectedMonth,
  onConfirm,
}: RangeSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
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
                    onChange={(event) => updateCustomStart(event.target.value)}
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
                      updateCustomStart(format(start, "yyyy-MM-dd"));
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
                  <span className="text-xs text-[color:rgba(45,38,34,0.5)]">
                    ▼
                  </span>
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
                    const isEnd =
                      customEndDate && isSameDay(day, customEndDate);
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
                        } ${
                          isCurrentMonth
                            ? ""
                            : "text-[color:rgba(45,38,34,0.3)]"
                        }`}
                        onClick={() => {
                          if (
                            !customStartDate ||
                            (customStartDate && customEndDate)
                          ) {
                            updateCustomStart(format(day, "yyyy-MM-dd"));
                            setCustomEnd("");
                            return;
                          }
                          if (day < customStartDate) {
                            updateCustomStart(format(day, "yyyy-MM-dd"));
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
            className="w-full rounded-2xl bg-[var(--text)] px-4 py-3 text-sm text-white"
            onClick={onConfirm}
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
});

type BudgetCategory = { id: string; name: string };

type BudgetSheetProps = {
  open: boolean;
  onClose: () => void;
  budgetCategories: BudgetCategory[];
  budgetScope: "common" | string;
  onSelect: (categoryId: string) => void;
};

const BudgetSheet = memo(function BudgetSheet({
  open,
  onClose,
  budgetCategories,
  budgetScope,
  onSelect,
}: BudgetSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
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
              onClick={onClose}
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
                  budgetScope === category.id
                    ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                    : "border-[var(--border)] text-[color:rgba(45,38,34,0.7)]"
                }`}
                onClick={() => onSelect(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

type CategoryItem = {
  id: string;
  name: string;
  parentId?: string | null;
  order: number;
  type: ViewType | "income" | "expense" | "transfer";
};

type SubjectItem = {
  id: string;
  name: string;
};

type PaymentMethodItem = {
  id: string;
  name: string;
  parentId?: string | null;
  order: number;
  owner?: "husband" | "wife" | "our";
};

type FilterSheetProps = {
  open: boolean;
  onClose: () => void;
  filterTab: "category" | "subject" | "payment";
  setFilterTab: (tab: "category" | "subject" | "payment") => void;
  categoryParents: CategoryItem[];
  categoryChildrenByParent: Map<string, CategoryItem[]>;
  draftCategoryIds: Set<string>;
  setDraftCategoryIds: (next: Set<string>) => void;
  expandedCategoryParents: Set<string>;
  setExpandedCategoryParents: (next: Set<string>) => void;
  subjects: SubjectItem[];
  draftSubjects: Set<string>;
  setDraftSubjects: (next: Set<string>) => void;
  paymentOwnerLabels: { husbandLabel: string; wifeLabel: string };
  paymentOwnerFilter: "husband" | "wife" | "our";
  setPaymentOwnerFilter: (owner: "husband" | "wife" | "our") => void;
  paymentParents: PaymentMethodItem[];
  paymentChildrenByParent: Map<string, PaymentMethodItem[]>;
  draftPayments: Set<string>;
  setDraftPayments: (next: Set<string>) => void;
  expandedPaymentParents: Set<string>;
  setExpandedPaymentParents: (next: Set<string>) => void;
  resetFilters: () => void;
  applyFilters: () => void;
};

const FilterSheet = memo(function FilterSheet({
  open,
  onClose,
  filterTab,
  setFilterTab,
  categoryParents,
  categoryChildrenByParent,
  draftCategoryIds,
  setDraftCategoryIds,
  expandedCategoryParents,
  setExpandedCategoryParents,
  subjects,
  draftSubjects,
  setDraftSubjects,
  paymentOwnerLabels,
  paymentOwnerFilter,
  setPaymentOwnerFilter,
  paymentParents,
  paymentChildrenByParent,
  draftPayments,
  setDraftPayments,
  expandedPaymentParents,
  setExpandedPaymentParents,
  resetFilters,
  applyFilters,
}: FilterSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
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
              onClick={onClose}
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
                      setPaymentOwnerFilter(
                        tab.key as "husband" | "wife" | "our"
                      )
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
  );
});

type ResetConfirmProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const ResetConfirm = memo(function ResetConfirm({
  open,
  onCancel,
  onConfirm,
}: ResetConfirmProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-xs rounded-2xl border border-[var(--border)] bg-white p-6">
        <p className="text-sm">필터를 초기화하시겠습니까?</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
            onClick={onCancel}
          >
            아니오
          </button>
          <button
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
            onClick={onConfirm}
          >
            예
          </button>
        </div>
      </div>
    </div>
  );
});

export default function StatsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { householdId, displayName, spouseRole } = useHousehold();
  const { categories } = useCategories(householdId);
  const { subjects } = useSubjects(householdId);
  const { paymentMethods } = usePaymentMethods(householdId);
  const personalCategoryIdSet = useMemo(() => {
    return new Set(
      categories
        .filter((category) => category.personalOnly)
        .map((category) => category.id)
    );
  }, [categories]);
  const [storedFilters] = useState<StoredStatsFilters | null>(() =>
    loadStoredStatsFilters()
  );
  const initialAppliedMonthDate = storedFilters?.appliedMonthDate
    ? startOfMonth(new Date(storedFilters.appliedMonthDate))
    : startOfMonth(new Date());
  const [monthDate, setMonthDate] = useState(() => initialAppliedMonthDate);
  const [viewType, setViewType] = useState<ViewType>(() =>
    storedFilters?.viewType === "income" || storedFilters?.viewType === "expense"
      ? storedFilters.viewType
      : "expense"
  );
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
  >(() =>
    storedFilters?.appliedRangeMode === "custom" ||
    storedFilters?.appliedRangeMode === "monthly"
      ? storedFilters.appliedRangeMode
      : "monthly"
  );
  const [appliedMonthDate, setAppliedMonthDate] = useState(
    () => initialAppliedMonthDate
  );
  const [appliedStart, setAppliedStart] = useState<string | null>(
    () => storedFilters?.appliedStart ?? null
  );
  const [appliedEnd, setAppliedEnd] = useState<string | null>(
    () => storedFilters?.appliedEnd ?? null
  );
  const monthKey = toMonthKey(appliedMonthDate);
  const { transactions: monthlyTransactions, loading: monthlyLoading } =
    useMonthlyTransactions(householdId, monthKey);
  const rangeStart = useMemo(() => {
    if (!appliedStart) {
      return null;
    }
    const parsed = parseLocalDate(appliedStart);
    return parsed ? startOfDay(parsed) : null;
  }, [appliedStart]);
  const rangeEnd = useMemo(() => {
    if (!appliedEnd) {
      return null;
    }
    const parsed = parseLocalDate(appliedEnd);
    return parsed ? endOfDay(parsed) : null;
  }, [appliedEnd]);
  const shouldUseRange =
    appliedRangeMode === "custom" && rangeStart && rangeEnd;
  const { transactions: rangeTransactions, loading: rangeLoading } =
    useTransactionsRange(
      householdId,
      shouldUseRange ? rangeStart : null,
      shouldUseRange ? rangeEnd : null
    );
  const activeTransactions =
    appliedRangeMode === "custom" && shouldUseRange
      ? rangeTransactions
      : monthlyTransactions;
  const scopedTransactions = useMemo(() => {
    const currentUserId = user?.uid ?? null;
    if (!currentUserId || personalCategoryIdSet.size === 0) {
      return activeTransactions;
    }
    return activeTransactions.filter(
      (tx) =>
        !personalCategoryIdSet.has(tx.categoryId) ||
        tx.createdBy === currentUserId
    );
  }, [activeTransactions, personalCategoryIdSet, user]);
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
    () => new Set(storedFilters?.appliedCategoryIds ?? [])
  );
  const [appliedSubjects, setAppliedSubjects] = useState<Set<string>>(
    () => new Set(storedFilters?.appliedSubjects ?? [])
  );
  const [appliedPayments, setAppliedPayments] = useState<Set<string>>(
    () => new Set(storedFilters?.appliedPayments ?? [])
  );
  const [expandedCategoryParents, setExpandedCategoryParents] = useState<
    Set<string>
  >(() => new Set());
  const [expandedPaymentParents, setExpandedPaymentParents] = useState<
    Set<string>
  >(() => new Set());
  const [paymentOwnerFilter, setPaymentOwnerFilter] = useState<
    "husband" | "wife" | "our"
  >(() =>
    storedFilters?.paymentOwnerFilter === "husband" ||
    storedFilters?.paymentOwnerFilter === "wife" ||
    storedFilters?.paymentOwnerFilter === "our"
      ? storedFilters.paymentOwnerFilter
      : "our"
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [budgetScope, setBudgetScope] = useState<"common" | string>("common");
  const [isBudgetSheetOpen, setIsBudgetSheetOpen] = useState(false);
  const closeRangeSheet = useCallback(() => setIsRangeSheetOpen(false), []);
  const closeBudgetSheet = useCallback(() => setIsBudgetSheetOpen(false), []);
  const closeFilterSheet = useCallback(() => setIsFilterSheetOpen(false), []);
  const handleBudgetSelect = useCallback((categoryId: string) => {
    setBudgetScope(categoryId);
    setIsBudgetSheetOpen(false);
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
  const categoryById = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories]
  );
  const budgetCategoryIdSet = useMemo(() => {
    return new Set(
      categories
        .filter((category) => category.type === "expense" && category.budgetEnabled)
        .map((category) => category.id)
    );
  }, [categories]);
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
  ]);

  const statsData = useMemo(() => {
    const categoryTotals = new Map<string, number>();
    const subjectTotals = new Map<string, number>();
    const paymentTotals = new Map<string, number>();
    let totalAmount = 0;
    let income = 0;
    let expense = 0;

    for (const tx of visibleTransactions) {
      const effectiveType =
        effectiveBudgetScope !== "common" && tx.budgetApplied ? "income" : tx.type;
      if (effectiveType !== viewType) {
        continue;
      }
      if (appliedCategoryIds.size > 0 && !appliedCategoryIds.has(tx.categoryId)) {
        continue;
      }
      const subjectKey = tx.subject ?? "";
      if (appliedSubjects.size > 0 && !appliedSubjects.has(subjectKey)) {
        continue;
      }
      const paymentKey = tx.paymentMethod ?? "";
      if (appliedPayments.size > 0 && !appliedPayments.has(paymentKey)) {
        continue;
      }

      totalAmount += tx.amount;
      if (effectiveType === "income") {
        income += tx.amount;
      } else if (effectiveType === "expense") {
        expense += tx.amount;
      }
      categoryTotals.set(
        tx.categoryId,
        (categoryTotals.get(tx.categoryId) ?? 0) + tx.amount
      );
      const subjectLabel = tx.subject || "미지정";
      subjectTotals.set(
        subjectLabel,
        (subjectTotals.get(subjectLabel) ?? 0) + tx.amount
      );
      const paymentLabel = tx.paymentMethod || "미지정";
      paymentTotals.set(
        paymentLabel,
        (paymentTotals.get(paymentLabel) ?? 0) + tx.amount
      );
    }

    const categoryBreakdown = buildBreakdown(
      Array.from(categoryTotals.entries()).map(([categoryId, amount]) => ({
        id: categoryId,
        name: categoryMap.get(categoryId) ?? "미분류",
        amount,
      })),
      totalAmount
    );
    const subjectBreakdown = buildBreakdown(
      Array.from(subjectTotals.entries()).map(([name, amount]) => ({
        id: name,
        name,
        amount,
      })),
      totalAmount
    );
    const paymentBreakdown = buildBreakdown(
      Array.from(paymentTotals.entries()).map(([name, amount]) => ({
        id: name,
        name,
        amount,
      })),
      totalAmount
    );

    return {
      totalAmount,
      summary: { income, expense, balance: income - expense },
      categoryBreakdown,
      subjectBreakdown,
      paymentBreakdown,
    };
  }, [
    visibleTransactions,
    effectiveBudgetScope,
    viewType,
    appliedCategoryIds,
    appliedSubjects,
    appliedPayments,
    categoryMap,
  ]);

  const {
    totalAmount,
    summary: activeSummary,
    categoryBreakdown,
    subjectBreakdown,
    paymentBreakdown,
  } = statsData;

  const shownCategoryItems = expanded
    ? categoryBreakdown
    : categoryBreakdown.slice(0, 4);
  const appliedCategoryNameList = useMemo(() => {
    return Array.from(appliedCategoryIds)
      .map((id) => categoryMap.get(id) ?? "미분류")
      .filter(Boolean);
  }, [appliedCategoryIds, categoryMap]);
  const appliedSubjectNameList = useMemo(
    () => Array.from(appliedSubjects),
    [appliedSubjects]
  );
  const appliedPaymentNameList = useMemo(
    () => Array.from(appliedPayments),
    [appliedPayments]
  );
  const activeCategoryNames = useMemo(
    () => formatSelectionSummary(appliedCategoryNameList),
    [appliedCategoryNameList]
  );
  const activeSubjectNames = useMemo(
    () => formatSelectionSummary(appliedSubjectNameList),
    [appliedSubjectNameList]
  );
  const activePaymentNames = useMemo(
    () => formatSelectionSummary(appliedPaymentNameList),
    [appliedPaymentNameList]
  );

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

  const updateCustomStart = useCallback((value: string) => {
    setCustomStart(value);
    if (!value) {
      return;
    }
    const parsed = parseLocalDate(value);
    if (parsed) {
      setCustomMonthDate(startOfMonth(parsed));
    }
  }, []);

  const openRangeSheet = useCallback(() => {
    if (appliedRangeMode === "custom" && appliedStart && appliedEnd) {
      const appliedStartDate = parseLocalDate(appliedStart);
      updateCustomStart(appliedStart);
      setCustomEnd(appliedEnd);
      if (appliedStartDate) {
        setCustomMonthDate(startOfMonth(appliedStartDate));
      }
      setRangeMode("custom");
    } else {
      setSelectedYear(appliedMonthDate.getFullYear());
      setSelectedMonth(appliedMonthDate.getMonth());
      updateCustomStart("");
      setCustomEnd("");
      setRangeMode("monthly");
      setCustomMonthDate(startOfMonth(appliedMonthDate));
    }
    setIsRangeSheetOpen(true);
  }, [
    appliedEnd,
    appliedMonthDate,
    appliedRangeMode,
    appliedStart,
    setCustomEnd,
    setCustomMonthDate,
    setRangeMode,
    setSelectedMonth,
    setSelectedYear,
    updateCustomStart,
  ]);

  const handleRangeConfirm = useCallback(() => {
    if (rangeMode === "custom" && customStart) {
      const parsedStart = parseLocalDate(customStart);
      const fallbackEnd = customEnd || customStart;
      const parsedEnd = parseLocalDate(fallbackEnd);
      if (!parsedStart || !parsedEnd) {
        return;
      }
      setAppliedRangeMode("custom");
      setAppliedStart(customStart);
      setAppliedEnd(fallbackEnd);
      setAppliedMonthDate(startOfMonth(parsedStart));
      setMonthDate(startOfMonth(parsedStart));
    } else {
      const nextMonth = new Date(selectedYear, selectedMonth, 1);
      setAppliedRangeMode("monthly");
      setAppliedStart(null);
      setAppliedEnd(null);
      setAppliedMonthDate(nextMonth);
      setMonthDate(nextMonth);
    }
    setIsRangeSheetOpen(false);
  }, [
    customEnd,
    customStart,
    rangeMode,
    selectedMonth,
    selectedYear,
    setAppliedEnd,
    setAppliedMonthDate,
    setAppliedRangeMode,
    setAppliedStart,
    setIsRangeSheetOpen,
    setMonthDate,
  ]);

  const headerLabel = useMemo(() => {
    if (appliedRangeMode === "custom" && appliedStart && appliedEnd) {
      const startLabel = format(
        parseLocalDate(appliedStart) ?? new Date(),
        "yy.MM.dd"
      );
      const endLabel = format(
        parseLocalDate(appliedEnd) ?? new Date(),
        "yy.MM.dd"
      );
      return `${startLabel}~${endLabel}`;
    }
    return format(appliedMonthDate, "M월");
  }, [appliedEnd, appliedMonthDate, appliedRangeMode, appliedStart]);

  const openFilterSheet = useCallback((tab: "category" | "subject" | "payment") => {
    setFilterTab(tab);
    setDraftCategoryIds(new Set(appliedCategoryIds));
    setDraftSubjects(new Set(appliedSubjects));
    setDraftPayments(new Set(appliedPayments));
    setIsFilterSheetOpen(true);
  }, [appliedCategoryIds, appliedPayments, appliedSubjects]);

  const resetFilters = useCallback(() => {
    setDraftCategoryIds(new Set());
    setDraftSubjects(new Set());
    setDraftPayments(new Set());
    setAppliedCategoryIds(new Set());
    setAppliedSubjects(new Set());
    setAppliedPayments(new Set());
    setExpandedCategoryParents(new Set());
    setExpandedPaymentParents(new Set());
    setIsFilterSheetOpen(false);
  }, []);

  const resetAppliedFilters = useCallback(() => {
    setAppliedCategoryIds(new Set());
    setAppliedSubjects(new Set());
    setAppliedPayments(new Set());
    setDraftCategoryIds(new Set());
    setDraftSubjects(new Set());
    setDraftPayments(new Set());
    setExpandedCategoryParents(new Set());
    setExpandedPaymentParents(new Set());
  }, []);

  const handleResetConfirm = useCallback(() => {
    resetAppliedFilters();
    setShowResetConfirm(false);
  }, [resetAppliedFilters]);

  const applyFilters = useCallback(() => {
    setAppliedCategoryIds(new Set(draftCategoryIds));
    setAppliedSubjects(new Set(draftSubjects));
    setAppliedPayments(new Set(draftPayments));
    setIsFilterSheetOpen(false);
  }, [draftCategoryIds, draftPayments, draftSubjects]);

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

  const customStartDate = useMemo(
    () => (customStart ? parseLocalDate(customStart) : null),
    [customStart]
  );
  const customEndDate = useMemo(
    () => (customEnd ? parseLocalDate(customEnd) : null),
    [customEnd]
  );

  const moveMonth = useCallback((direction: "prev" | "next") => {
    const delta = direction === "prev" ? -1 : 1;
    const nextMonth = addMonths(monthDate, delta);
    setMonthDate(nextMonth);
    setAppliedRangeMode("monthly");
    setAppliedStart(null);
    setAppliedEnd(null);
    setAppliedMonthDate(startOfMonth(nextMonth));
  }, [
    monthDate,
    setAppliedEnd,
    setAppliedMonthDate,
    setAppliedRangeMode,
    setAppliedStart,
  ]);

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

  const swipeThreshold = 150;

  const handleTouchEnd = useCallback(() => {
    if (touchStartX === null || touchEndX === null) {
      return;
    }
    const delta = touchStartX - touchEndX;
    if (Math.abs(delta) < swipeThreshold) {
      return;
    }
    if (delta > 0) {
      moveMonth("next");
    } else {
      moveMonth("prev");
    }
  }, [moveMonth, touchEndX, touchStartX]);

  const rangeSheetProps = useMemo(
    () => ({
      open: isRangeSheetOpen,
      onClose: closeRangeSheet,
      rangeMode,
      setRangeMode,
      customStart,
      customEnd,
      updateCustomStart,
      setCustomEnd,
      customMonthDate,
      setCustomMonthDate,
      monthDate,
      customCalendarDays,
      customStartDate,
      customEndDate,
      yearOptions,
      selectedYear,
      selectedMonth,
      setSelectedYear,
      setSelectedMonth,
      onConfirm: handleRangeConfirm,
    }),
    [
      closeRangeSheet,
      customCalendarDays,
      customEnd,
      customEndDate,
      customMonthDate,
      customStart,
      customStartDate,
      handleRangeConfirm,
      isRangeSheetOpen,
      monthDate,
      rangeMode,
      selectedMonth,
      selectedYear,
      setCustomEnd,
      setCustomMonthDate,
      setRangeMode,
      setSelectedMonth,
      setSelectedYear,
      updateCustomStart,
      yearOptions,
    ]
  );

  const budgetSheetProps = useMemo(
    () => ({
      open: isBudgetSheetOpen,
      onClose: closeBudgetSheet,
      budgetCategories,
      budgetScope: effectiveBudgetScope,
      onSelect: handleBudgetSelect,
    }),
    [
      budgetCategories,
      closeBudgetSheet,
      effectiveBudgetScope,
      handleBudgetSelect,
      isBudgetSheetOpen,
    ]
  );

  const filterSheetProps = useMemo(
    () => ({
      open: isFilterSheetOpen,
      onClose: closeFilterSheet,
      filterTab,
      setFilterTab,
      categoryParents,
      categoryChildrenByParent,
      draftCategoryIds,
      setDraftCategoryIds,
      expandedCategoryParents,
      setExpandedCategoryParents,
      subjects,
      draftSubjects,
      setDraftSubjects,
      paymentOwnerLabels,
      paymentOwnerFilter,
      setPaymentOwnerFilter,
      paymentParents,
      paymentChildrenByParent,
      draftPayments,
      setDraftPayments,
      expandedPaymentParents,
      setExpandedPaymentParents,
      resetFilters,
      applyFilters,
    }),
    [
      applyFilters,
      categoryChildrenByParent,
      categoryParents,
      closeFilterSheet,
      draftCategoryIds,
      draftPayments,
      draftSubjects,
      expandedCategoryParents,
      expandedPaymentParents,
      filterTab,
      isFilterSheetOpen,
      paymentChildrenByParent,
      paymentOwnerFilter,
      paymentOwnerLabels,
      paymentParents,
      resetFilters,
      setDraftCategoryIds,
      setDraftPayments,
      setDraftSubjects,
      setExpandedCategoryParents,
      setExpandedPaymentParents,
      setFilterTab,
      setPaymentOwnerFilter,
      subjects,
    ]
  );

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
        <div className="mb-4 flex flex-wrap items-center gap-2">
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
            <div className="text-[11px] text-[color:rgba(45,38,34,0.55)]">
              <span>카테고리: {activeCategoryNames}</span>
              <span className="mx-2">•</span>
              <span>구성원: {activeSubjectNames}</span>
              <span className="mx-2">•</span>
              <span>자산: {activePaymentNames}</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <SectionHeader
                  title={`카테고리별 ${viewType === "income" ? "입금" : "지출"}`}
                />
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
              <SectionHeader
                title={`구성원별 ${viewType === "income" ? "입금" : "지출"}`}
              />
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
              <SectionHeader
                title={`자산별 ${viewType === "income" ? "입금" : "지출"}`}
              />
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

      <RangeSheet {...rangeSheetProps} />

      <BudgetSheet {...budgetSheetProps} />

      <FilterSheet {...filterSheetProps} />
      <ResetConfirm
        open={showResetConfirm}
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={handleResetConfirm}
      />
    </div>
  );
}
