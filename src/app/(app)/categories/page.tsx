"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { addCategory, deleteCategory, updateCategory } from "@/lib/categories";

type CategoryType = "income" | "expense" | "transfer";

const TAB_ITEMS: { key: CategoryType; label: string }[] = [
  { key: "income", label: "수입" },
  { key: "expense", label: "지출" },
  { key: "transfer", label: "이체" },
];

export default function CategoriesPage() {
  const { householdId } = useHousehold();
  const { categories, loading } = useCategories(householdId);
  const [activeTab, setActiveTab] = useState<CategoryType>("expense");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState<CategoryType>("expense");
  const [editingParentId, setEditingParentId] = useState<string>("none");
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const grouped = useMemo(() => {
    const byType = {
      expense: { parents: [], children: [] as typeof categories },
      income: { parents: [], children: [] as typeof categories },
      transfer: { parents: [], children: [] as typeof categories },
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

  const parentOptions = useMemo(
    () => grouped[activeTab].parents,
    [grouped, activeTab]
  );

  useEffect(() => {
    if (showAddForm) {
      nameInputRef.current?.focus();
    }
  }, [showAddForm]);

  useEffect(() => {
    if (parentId === "none") {
      return;
    }
    if (!parentOptions.some((parent) => parent.id === parentId)) {
      setParentId("none");
    }
  }, [parentId, parentOptions]);

  async function handleAdd() {
    if (!householdId || !name.trim()) {
      return;
    }
    await addCategory(householdId, {
      name: name.trim(),
      type: activeTab,
      order: categories.length + 1,
      parentId: parentId === "none" ? null : parentId,
    });
    setName("");
    setParentId("none");
    setShowAddForm(false);
  }

  async function handleDelete(categoryId: string) {
    if (!householdId) {
      return;
    }
    await deleteCategory(householdId, categoryId);
  }

  function startEdit(
    categoryId: string,
    currentName: string,
    currentType: CategoryType,
    currentParentId?: string | null
  ) {
    setEditingId(categoryId);
    setEditingName(currentName);
    setEditingType(currentType);
    setEditingParentId(currentParentId ?? "none");
  }

  async function handleUpdate() {
    if (!householdId || !editingId || !editingName.trim()) {
      return;
    }
    await updateCategory(householdId, editingId, {
      name: editingName.trim(),
      type: editingType,
      parentId: editingParentId === "none" ? null : editingParentId,
    });
    setEditingId(null);
    setEditingName("");
  }

  const parents = grouped[activeTab].parents;
  const children = grouped[activeTab].children;

  return (
    <div className="relative flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">카테고리 편집</h1>
        </div>
      </div>

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
          <div className="grid gap-3 md:grid-cols-4">
            <input
              ref={nameInputRef}
              className="w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
              placeholder="카테고리명"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <select
              className="w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
              value={activeTab}
              onChange={(event) =>
                setActiveTab(event.target.value as CategoryType)
              }
            >
              <option value="expense">지출</option>
              <option value="income">수입</option>
              <option value="transfer">이체</option>
            </select>
            <select
              className="w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="none">대분류</option>
              {parentOptions.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name} (소분류)
                </option>
              ))}
            </select>
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
        {loading ? (
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
            불러오는 중...
          </p>
        ) : (
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
                            {option.name} (소분류)
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
                            수정
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
        )}
      </section>

      <button
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-2xl text-white shadow-lg"
        onClick={() => setShowAddForm(true)}
        aria-label="카테고리 추가"
      >
        +
      </button>
    </div>
  );
}
