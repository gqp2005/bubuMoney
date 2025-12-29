"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useSubjects } from "@/hooks/use-subjects";
import { addCategory, deleteCategory, updateCategory } from "@/lib/categories";
import {
  addPaymentMethod,
  deletePaymentMethod,
  updatePaymentMethod,
} from "@/lib/payment-methods";
import { addSubject, deleteSubject, updateSubject } from "@/lib/subjects";

type CategoryType = "income" | "expense" | "transfer";
type TabKey = CategoryType | "subject" | "payment";

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: "income", label: "수입" },
  { key: "expense", label: "지출" },
  { key: "transfer", label: "이체" },
  { key: "subject", label: "주체" },
  { key: "payment", label: "결제수단" },
];

export default function CategoriesPage() {
  const { householdId } = useHousehold();
  const { categories, loading: categoriesLoading } = useCategories(householdId);
  const { subjects, loading: subjectsLoading } = useSubjects(householdId);
  const { paymentMethods, loading: paymentLoading } =
    usePaymentMethods(householdId);
  const [activeTab, setActiveTab] = useState<TabKey>("expense");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState<CategoryType>("expense");
  const [editingParentId, setEditingParentId] = useState<string>("none");
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const grouped = useMemo(() => {
    const byType: Record<
      CategoryType,
      { parents: typeof categories; children: typeof categories }
    > = {
      expense: { parents: [], children: [] },
      income: { parents: [], children: [] },
      transfer: { parents: [], children: [] },
    };
    categories.forEach((category) => {
      if (category.parentId) {
        byType[category.type].children.push(category);
      } else {
        byType[category.type].parents.push(category);
      }
    });
    return byType;
  }, [categories]);

  const isCategoryTab = activeTab !== "subject" && activeTab !== "payment";
  const parentOptions = useMemo(() => {
    if (!isCategoryTab) {
      return [];
    }
    return grouped[activeTab as CategoryType].parents;
  }, [grouped, activeTab, isCategoryTab]);

  useEffect(() => {
    if (showAddForm) {
      nameInputRef.current?.focus();
    }
  }, [showAddForm]);

  useEffect(() => {
    setShowAddForm(false);
    setName("");
    setParentId("none");
    setEditingId(null);
  }, [activeTab]);

  useEffect(() => {
    if (!isCategoryTab) {
      return;
    }
    if (parentId === "none") {
      return;
    }
    if (!parentOptions.some((parent) => parent.id === parentId)) {
      setParentId("none");
    }
  }, [parentId, parentOptions, isCategoryTab]);

  async function handleAdd() {
    if (!householdId || !name.trim()) {
      return;
    }
    const trimmed = name.trim();
    if (activeTab === "subject") {
      await addSubject(householdId, {
        name: trimmed,
        order: subjects.length + 1,
      });
    } else if (activeTab === "payment") {
      await addPaymentMethod(householdId, {
        name: trimmed,
        order: paymentMethods.length + 1,
      });
    } else {
      await addCategory(householdId, {
        name: trimmed,
        type: activeTab,
        order: categories.length + 1,
        parentId: parentId === "none" ? null : parentId,
      });
    }
    setName("");
    setParentId("none");
    setShowAddForm(false);
  }

  async function handleDelete(itemId: string) {
    if (!householdId) {
      return;
    }
    if (activeTab === "subject") {
      await deleteSubject(householdId, itemId);
      return;
    }
    if (activeTab === "payment") {
      await deletePaymentMethod(householdId, itemId);
      return;
    }
    await deleteCategory(householdId, itemId);
  }

  function startEdit(
    itemId: string,
    currentName: string,
    currentType?: CategoryType,
    currentParentId?: string | null
  ) {
    setEditingId(itemId);
    setEditingName(currentName);
    if (currentType) {
      setEditingType(currentType);
    }
    setEditingParentId(currentParentId ?? "none");
  }

  async function handleUpdate() {
    if (!householdId || !editingId || !editingName.trim()) {
      return;
    }
    const trimmed = editingName.trim();
    if (activeTab === "subject") {
      await updateSubject(householdId, editingId, { name: trimmed });
    } else if (activeTab === "payment") {
      await updatePaymentMethod(householdId, editingId, { name: trimmed });
    } else {
      await updateCategory(householdId, editingId, {
        name: trimmed,
        type: editingType,
        parentId: editingParentId === "none" ? null : editingParentId,
      });
    }
    setEditingId(null);
    setEditingName("");
  }

  const parents = isCategoryTab ? grouped[activeTab as CategoryType].parents : [];
  const children = isCategoryTab
    ? grouped[activeTab as CategoryType].children
    : [];

  const isLoading = isCategoryTab
    ? categoriesLoading
    : activeTab === "subject"
    ? subjectsLoading
    : paymentLoading;

  return (
    <div className="relative flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-center gap-6 border-b border-[var(--border)] text-sm">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.key}
            className={`pb-3 ${
              activeTab === tab.key
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : "text-[color:rgba(45,38,34,0.5)]"
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showAddForm ? (
        <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
          <div
            className={`grid gap-3 ${
              isCategoryTab ? "md:grid-cols-4" : "sm:grid-cols-[1fr_auto]"
            }`}
          >
            <input
              ref={nameInputRef}
              className="w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
              placeholder={
                activeTab === "subject"
                  ? "주체 이름"
                  : activeTab === "payment"
                  ? "결제수단 이름"
                  : "카테고리 이름"
              }
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {isCategoryTab ? (
              <select
                className="w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="none">대분류</option>
                {parentOptions.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name} (대분류)
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white"
                onClick={handleAdd}
                disabled={!name.trim()}
              >
                추가
              </button>
              <button
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => setShowAddForm(false)}
              >
                취소
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        {isLoading ? (
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
            불러오는 중...
          </p>
        ) : isCategoryTab ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {parents.map((parent) => {
              const childCount = children.filter(
                (child) => child.parentId === parent.id
              ).length;
              return (
                <div
                  key={parent.id}
                  className="rounded-2xl border border-[var(--border)] px-4 py-3 text-sm"
                >
                  {editingId === parent.id ? (
                    <div className="space-y-2">
                      <input
                        className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                      <select
                        className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                        value={editingType}
                        onChange={(event) =>
                          setEditingType(event.target.value as CategoryType)
                        }
                      >
                        <option value="expense">지출</option>
                        <option value="income">수입</option>
                        <option value="transfer">이체</option>
                      </select>
                      <select
                        className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                        value={editingParentId}
                        onChange={(event) =>
                          setEditingParentId(event.target.value)
                        }
                      >
                        <option value="none">대분류</option>
                        {grouped[editingType].parents.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} (대분류)
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white"
                          onClick={handleUpdate}
                        >
                          저장
                        </button>
                        <button
                          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{parent.name}</p>
                          <p className="text-xs text-[color:rgba(45,38,34,0.7)]">
                            소분류 {childCount}개
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="text-xs text-[color:rgba(45,38,34,0.6)]"
                            onClick={() =>
                              startEdit(
                                parent.id,
                                parent.name,
                                parent.type,
                                parent.parentId
                              )
                            }
                          >
                            편집
                          </button>
                          <button
                            className="text-xs text-red-600"
                            onClick={() => handleDelete(parent.id)}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {parents.length === 0 ? (
              <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
                아직 등록된 카테고리가 없습니다.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(activeTab === "subject" ? subjects : paymentMethods).map(
              (item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-[var(--border)] px-4 py-3 text-sm"
                >
                  {editingId === item.id ? (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <input
                        className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                      <button
                        className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white"
                        onClick={handleUpdate}
                      >
                        저장
                      </button>
                      <button
                        className="rounded-full border border-[var(--border)] px-3 py-1 text-xs"
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-[color:rgba(45,38,34,0.6)]"
                          onClick={() => startEdit(item.id, item.name)}
                        >
                          편집
                        </button>
                        <button
                          className="text-xs text-red-600"
                          onClick={() => handleDelete(item.id)}
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            )}
            {(activeTab === "subject" ? subjects : paymentMethods).length ===
            0 ? (
              <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
                아직 등록된 항목이 없습니다.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <button
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-2xl text-white shadow-lg"
        onClick={() => setShowAddForm(true)}
        aria-label="항목 추가"
      >
        +
      </button>
    </div>
  );
}
