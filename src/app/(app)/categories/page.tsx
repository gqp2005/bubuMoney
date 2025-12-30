"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDoc } from "firebase/firestore";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useSubjects } from "@/hooks/use-subjects";
import { addCategory, deleteCategory, updateCategory } from "@/lib/categories";
import { householdDoc } from "@/lib/firebase/firestore";
import {
  addPaymentMethod,
  deletePaymentMethod,
  updatePaymentMethod,
} from "@/lib/payment-methods";
import { addSubject, deleteSubject, updateSubject } from "@/lib/subjects";

type CategoryType = "income" | "expense" | "transfer";
type TabKey = CategoryType | "subject" | "payment";
type PaymentOwner = "husband" | "wife" | "our";

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: "income", label: "수입" },
  { key: "expense", label: "지출" },
  { key: "transfer", label: "이체" },
  { key: "subject", label: "주체" },
  { key: "payment", label: "결제수단" },
];

export default function CategoriesPage() {
  const { householdId, displayName, spouseRole } = useHousehold();
  const { categories, loading: categoriesLoading } = useCategories(householdId);
  const { subjects, loading: subjectsLoading } = useSubjects(householdId);
  const { paymentMethods, loading: paymentLoading } =
    usePaymentMethods(householdId);
  const [activeTab, setActiveTab] = useState<TabKey>("expense");
  const [paymentOwner, setPaymentOwner] = useState<PaymentOwner>("our");
  const [partnerName, setPartnerName] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState<CategoryType>("expense");
  const [editingParentId, setEditingParentId] = useState<string>("none");
  const [editingOwner, setEditingOwner] = useState<PaymentOwner>("our");
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const [expandedPaymentParentId, setExpandedPaymentParentId] = useState<
    string | null
  >(null);
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

  const paymentGrouped = useMemo(() => {
    const byOwner: Record<
      PaymentOwner,
      { parents: typeof paymentMethods; children: typeof paymentMethods }
    > = {
      husband: { parents: [], children: [] },
      wife: { parents: [], children: [] },
      our: { parents: [], children: [] },
    };
    paymentMethods.forEach((method) => {
      const owner = method.owner ?? "our";
      if (method.parentId) {
        byOwner[owner].children.push(method);
      } else {
        byOwner[owner].parents.push(method);
      }
    });
    return byOwner;
  }, [paymentMethods]);

  const isCategoryTab = activeTab !== "subject" && activeTab !== "payment";
  const parentOptions = useMemo(() => {
    if (!isCategoryTab) {
      return [];
    }
    return grouped[activeTab as CategoryType].parents;
  }, [grouped, activeTab, isCategoryTab]);

  const paymentParentOptions = useMemo(() => {
    return paymentGrouped[paymentOwner].parents;
  }, [paymentGrouped, paymentOwner]);

  useEffect(() => {
    if (!householdId) {
      setPartnerName("");
      return;
    }
    getDoc(householdDoc(householdId)).then((snapshot) => {
      if (!snapshot.exists()) {
        return;
      }
      const data = snapshot.data() as { partnerDisplayName?: string | null };
      setPartnerName(data.partnerDisplayName ?? "");
    });
  }, [householdId]);

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
    setEditingOwner("our");
    setExpandedParentId(null);
    setExpandedPaymentParentId(null);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "payment") {
      if (parentId === "none") {
        return;
      }
      if (!paymentParentOptions.some((parent) => parent.id === parentId)) {
        setParentId("none");
      }
      return;
    }
    if (!isCategoryTab) {
      return;
    }
    if (parentId === "none") {
      return;
    }
    if (!parentOptions.some((parent) => parent.id === parentId)) {
      setParentId("none");
    }
  }, [activeTab, parentId, parentOptions, paymentParentOptions, isCategoryTab]);

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
      const paymentOrderBase =
        parentId === "none"
          ? paymentGrouped[paymentOwner].parents.length
          : paymentGrouped[paymentOwner].children.filter(
              (method) => method.parentId === parentId
            ).length;
      await addPaymentMethod(householdId, {
        name: trimmed,
        order: paymentOrderBase + 1,
        owner: paymentOwner,
        parentId: parentId === "none" ? null : parentId,
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
    currentParentId?: string | null,
    currentOwner?: PaymentOwner
  ) {
    setEditingId(itemId);
    setEditingName(currentName);
    if (currentType) {
      setEditingType(currentType);
    }
    if (currentOwner) {
      setEditingOwner(currentOwner);
    }
    setEditingParentId(currentParentId ?? "none");
  }

  async function handleUpdate() {
    if (!householdId || !editingId || !editingName.trim()) {
      return;
    }
    const trimmed = editingName.trim();
    if (activeTab === "subject") {
      await updateSubject(householdId, editingId, {
        name: trimmed,
        imported: false,
      });
    } else if (activeTab === "payment") {
      await updatePaymentMethod(householdId, editingId, {
        name: trimmed,
        owner: editingOwner,
        parentId: editingParentId === "none" ? null : editingParentId,
        imported: false,
      });
    } else {
      await updateCategory(householdId, editingId, {
        name: trimmed,
        type: editingType,
        parentId: editingParentId === "none" ? null : editingParentId,
        imported: false,
      });
    }
    setEditingId(null);
    setEditingName("");
  }

  const parents = isCategoryTab ? grouped[activeTab as CategoryType].parents : [];
  const children = isCategoryTab
    ? grouped[activeTab as CategoryType].children
    : [];
  const paymentParents = paymentGrouped[paymentOwner].parents;
  const paymentChildren = paymentGrouped[paymentOwner].children;

  const isLoading = isCategoryTab
    ? categoriesLoading
    : activeTab === "subject"
    ? subjectsLoading
    : paymentLoading;

  const highlightClass = "border-amber-300 bg-amber-50";
  const spouseName = displayName?.trim() || "";
  const partnerTrimmed = partnerName.trim();
  const husbandLabel =
    spouseRole === "wife"
      ? partnerTrimmed || "남편"
      : spouseName || "남편";
  const wifeLabel =
    spouseRole === "wife" ? spouseName || "아내" : partnerTrimmed || "아내";

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

      {activeTab === "payment" ? (
        <div className="flex items-center justify-center gap-6 border-b border-[var(--border)] text-sm">
          {[
            { key: "husband", label: husbandLabel },
            { key: "wife", label: wifeLabel },
            { key: "our", label: "우리" },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`pb-3 ${
                paymentOwner === tab.key
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[color:rgba(45,38,34,0.5)]"
              }`}
              onClick={() => setPaymentOwner(tab.key as PaymentOwner)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {showAddForm ? (
        <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
          <div
            className={`grid gap-3 ${
              isCategoryTab || activeTab === "payment"
                ? "md:grid-cols-4"
                : "sm:grid-cols-[1fr_auto]"
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
            {isCategoryTab || activeTab === "payment" ? (
              <select
                className="w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="none">대분류</option>
                {(activeTab === "payment"
                  ? paymentParentOptions
                  : parentOptions
                ).map((parent) => (
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
              const childItems = children.filter(
                (child) => child.parentId === parent.id
              );
              const isExpanded = expandedParentId === parent.id;
              return (
                <div
                  key={parent.id}
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    parent.imported
                      ? highlightClass
                      : "border-[var(--border)] bg-white"
                  }`}
                  onClick={() =>
                    setExpandedParentId((prev) =>
                      prev === parent.id ? null : parent.id
                    )
                  }
                >
                  {editingId === parent.id ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
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
                            소분류 {childItems.length}개
                          </p>
                        </div>
                        <div
                          className="flex items-center gap-2"
                          onClick={(event) => event.stopPropagation()}
                        >
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
                      {isExpanded ? (
                        <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-white p-3">
                          <p className="text-xs font-medium text-[color:rgba(45,38,34,0.7)]">
                            소분류
                          </p>
                          {childItems.length === 0 ? (
                            <p className="text-xs text-[color:rgba(45,38,34,0.5)]">
                              등록된 소분류가 없습니다.
                            </p>
                          ) : (
                            childItems.map((child) => (
                              <div
                                key={child.id}
                                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                                  child.imported
                                    ? highlightClass
                                    : "border-[var(--border)] bg-white"
                                }`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {editingId === child.id ? (
                                  <div className="flex w-full flex-wrap items-center gap-2">
                                    <input
                                      className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                                      value={editingName}
                                      onChange={(event) =>
                                        setEditingName(event.target.value)
                                      }
                                    />
                                    <button
                                      className="rounded-full bg-[var(--accent)] px-2 py-1 text-[10px] text-white"
                                      onClick={handleUpdate}
                                    >
                                      저장
                                    </button>
                                    <button
                                      className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px]"
                                      onClick={() => setEditingId(null)}
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="font-medium">
                                      {child.name}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        className="text-[10px] text-[color:rgba(45,38,34,0.6)]"
                                        onClick={() =>
                                          startEdit(
                                            child.id,
                                            child.name,
                                            child.type,
                                            child.parentId
                                          )
                                        }
                                      >
                                        편집
                                      </button>
                                      <button
                                        className="text-[10px] text-red-600"
                                        onClick={() => handleDelete(child.id)}
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      ) : null}
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
        ) : activeTab === "payment" ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {paymentParents.map((parent) => {
              const childItems = paymentChildren.filter(
                (child) => child.parentId === parent.id
              );
              const isExpanded = expandedPaymentParentId === parent.id;
              return (
                <div
                  key={parent.id}
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    parent.imported
                      ? highlightClass
                      : "border-[var(--border)] bg-white"
                  }`}
                  onClick={() =>
                    setExpandedPaymentParentId((prev) =>
                      prev === parent.id ? null : parent.id
                    )
                  }
                >
                  {editingId === parent.id ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                      <select
                        className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                        value={editingOwner}
                        onChange={(event) =>
                          setEditingOwner(event.target.value as PaymentOwner)
                        }
                      >
                        <option value="husband">{husbandLabel}</option>
                        <option value="wife">{wifeLabel}</option>
                        <option value="our">우리</option>
                      </select>
                      <select
                        className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                        value={editingParentId}
                        onChange={(event) =>
                          setEditingParentId(event.target.value)
                        }
                      >
                        <option value="none">대분류</option>
                        {paymentGrouped[editingOwner].parents.map((option) => (
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
                            소분류 {childItems.length}개
                          </p>
                        </div>
                        <div
                          className="flex items-center gap-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            className="text-xs text-[color:rgba(45,38,34,0.6)]"
                            onClick={() =>
                              startEdit(
                                parent.id,
                                parent.name,
                                undefined,
                                parent.parentId,
                                (parent.owner ?? "our") as PaymentOwner
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
                      {isExpanded ? (
                        <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-white p-3">
                          <p className="text-xs font-medium text-[color:rgba(45,38,34,0.7)]">
                            소분류
                          </p>
                          {childItems.length === 0 ? (
                            <p className="text-xs text-[color:rgba(45,38,34,0.5)]">
                              등록된 소분류가 없습니다.
                            </p>
                          ) : (
                            childItems.map((child) => (
                              <div
                                key={child.id}
                                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                                  child.imported
                                    ? highlightClass
                                    : "border-[var(--border)] bg-white"
                                }`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {editingId === child.id ? (
                                  <div className="flex w-full flex-wrap items-center gap-2">
                                    <input
                                      className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                                      value={editingName}
                                      onChange={(event) =>
                                        setEditingName(event.target.value)
                                      }
                                    />
                                    <button
                                      className="rounded-full bg-[var(--accent)] px-2 py-1 text-[10px] text-white"
                                      onClick={handleUpdate}
                                    >
                                      저장
                                    </button>
                                    <button
                                      className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px]"
                                      onClick={() => setEditingId(null)}
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="font-medium">
                                      {child.name}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        className="text-[10px] text-[color:rgba(45,38,34,0.6)]"
                                        onClick={() =>
                                          startEdit(
                                            child.id,
                                            child.name,
                                            undefined,
                                            child.parentId,
                                            (child.owner ?? "our") as PaymentOwner
                                          )
                                        }
                                      >
                                        편집
                                      </button>
                                      <button
                                        className="text-[10px] text-red-600"
                                        onClick={() => handleDelete(child.id)}
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
            {paymentParents.length === 0 ? (
              <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
                아직 등록된 결제수단이 없습니다.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {subjects.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                  item.imported
                    ? highlightClass
                    : "border-[var(--border)] bg-white"
                }`}
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
            ))}
            {subjects.length === 0 ? (
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
