"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { DraggableAttributes } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
import {
  updateTransactionsPaymentMethodName,
  updateTransactionsSubjectName,
} from "@/lib/transactions";

type CategoryType = "income" | "expense" | "transfer";
type TabKey = CategoryType | "subject" | "payment";
type PaymentOwner = "husband" | "wife" | "our";
type DragKind = "category" | "payment" | "subject";
type DragLevel = "parent" | "child";
type DragItem = {
  kind: DragKind;
  level: DragLevel;
  id: string;
  parentId?: string | null;
  owner?: PaymentOwner;
};

function normalizeNumberInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatNumberInput(value: string) {
  const cleaned = normalizeNumberInput(value);
  if (!cleaned) {
    return "";
  }
  return Number(cleaned).toLocaleString("en-US");
}

function makeDragId(item: DragItem) {
  return [
    item.kind,
    item.level,
    item.owner ?? "",
    item.parentId ?? "",
    item.id,
  ].join("|");
}

function parseDragId(rawId: string): DragItem | null {
  const [kind, level, owner, parentId, id] = rawId.split("|");
  if (!kind || !level || !id) {
    return null;
  }
  return {
    kind: kind as DragKind,
    level: level as DragLevel,
    id,
    owner: owner ? (owner as PaymentOwner) : undefined,
    parentId: parentId ? parentId : null,
  };
}

function SortableCard({
  id,
  className,
  children,
  onClick,
}: {
  id: string;
  className: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className} ${isDragging ? "opacity-70" : ""}`}
      onClick={onClick}
    >
      <DragHandleContext.Provider
        value={{ attributes, listeners, setActivatorNodeRef }}
      >
        {children}
      </DragHandleContext.Provider>
    </div>
  );
}

const DragHandleContext = createContext<{
  attributes: DraggableAttributes;
  listeners: Record<string, unknown> | undefined;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
} | null>(null);

function DragHandle({
  className,
  label = "drag",
}: {
  className?: string;
  label?: string;
}) {
  const ctx = useContext(DragHandleContext);
  if (!ctx) {
    return null;
  }
  return (
    <span
      ref={ctx.setActivatorNodeRef}
      {...ctx.attributes}
      {...ctx.listeners}
      className={`cursor-grab touch-none select-none ${className ?? ""}`}
    >
      {label}
    </span>
  );
}

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
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [personalOnly, setPersonalOnly] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingOriginalName, setEditingOriginalName] = useState("");
  const [editingType, setEditingType] = useState<CategoryType>("expense");
  const [editingParentId, setEditingParentId] = useState<string>("none");
  const [editingBudgetEnabled, setEditingBudgetEnabled] = useState(false);
  const [editingPersonalOnly, setEditingPersonalOnly] = useState(false);
  const [editingOwner, setEditingOwner] = useState<PaymentOwner>("our");
  const [editingGoal, setEditingGoal] = useState("");
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
  const isExpenseTab = activeTab === "expense";

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
      const data = snapshot.data() as {
        creatorDisplayName?: string | null;
        partnerDisplayName?: string | null;
      };
      const creatorName = data.creatorDisplayName ?? "";
      const partnerDisplayName = data.partnerDisplayName ?? "";
      const currentName = (displayName ?? "").trim();
      if (currentName && creatorName && currentName === creatorName) {
        setPartnerName(partnerDisplayName);
      } else if (
        currentName &&
        partnerDisplayName &&
        currentName === partnerDisplayName
      ) {
        setPartnerName(creatorName);
      } else {
        setPartnerName(partnerDisplayName);
      }
    });
  }, [displayName, householdId]);

  useEffect(() => {
    if (showAddForm) {
      nameInputRef.current?.focus();
    }
  }, [showAddForm]);

  useEffect(() => {
    setShowAddForm(false);
    setName("");
    setParentId("none");
    setBudgetEnabled(false);
    setPersonalOnly(false);
    setEditingId(null);
    setEditingOriginalName("");
    setEditingBudgetEnabled(false);
    setEditingPersonalOnly(false);
    setEditingOwner("our");
    setEditingGoal("");
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
        budgetEnabled: activeTab === "expense" ? budgetEnabled : false,
        personalOnly: activeTab === "expense" ? personalOnly : false,
      });
    }
    setName("");
    setParentId("none");
    setBudgetEnabled(false);
    setPersonalOnly(false);
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
    currentOwner?: PaymentOwner,
    currentBudgetEnabled?: boolean,
    currentPersonalOnly?: boolean
  ) {
    setEditingId(itemId);
    setEditingName(currentName);
    setEditingOriginalName(currentName);
    if (currentType) {
      setEditingType(currentType);
    }
    if (currentOwner) {
      setEditingOwner(currentOwner);
    }
    const resolvedBudgetEnabled = currentType
      ? currentType === "expense"
        ? currentBudgetEnabled ??
          categories.find((category) => category.id === itemId)?.budgetEnabled
        : false
      : false;
    setEditingBudgetEnabled(Boolean(resolvedBudgetEnabled));
    const resolvedPersonalOnly = currentType
      ? currentType === "expense"
        ? currentPersonalOnly ??
          categories.find((category) => category.id === itemId)?.personalOnly
        : false
      : false;
    setEditingPersonalOnly(Boolean(resolvedPersonalOnly));
    setEditingParentId(currentParentId ?? "none");
    if (activeTab === "payment") {
      const current = paymentMethods.find((method) => method.id === itemId);
      const goalValue =
        typeof current?.goalMonthly === "number"
          ? String(current.goalMonthly)
          : "";
      setEditingGoal(formatNumberInput(goalValue));
    } else {
      setEditingGoal("");
    }
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
      await updateTransactionsSubjectName(
        householdId,
        editingOriginalName,
        trimmed
      );
    } else if (activeTab === "payment") {
      const cleanedGoal = normalizeNumberInput(editingGoal);
      const parsedGoal =
        cleanedGoal === "" ? null : Number(normalizeNumberInput(editingGoal));
      await updatePaymentMethod(householdId, editingId, {
        name: trimmed,
        owner: editingOwner,
        parentId: editingParentId === "none" ? null : editingParentId,
        imported: false,
        goalMonthly: Number.isNaN(parsedGoal ?? NaN) ? null : parsedGoal,
      });
      await updateTransactionsPaymentMethodName(
        householdId,
        editingOriginalName,
        trimmed
      );
    } else {
      await updateCategory(householdId, editingId, {
        name: trimmed,
        type: editingType,
        parentId: editingParentId === "none" ? null : editingParentId,
        imported: false,
        budgetEnabled: editingType === "expense" ? editingBudgetEnabled : false,
        personalOnly: editingType === "expense" ? editingPersonalOnly : false,
      });
    }
    setEditingId(null);
    setEditingName("");
    setEditingOriginalName("");
    setEditingGoal("");
  }

  async function handleDragEnd(event: DragEndEvent) {
    const activeItem = parseDragId(String(event.active.id));
    const overItem = event.over ? parseDragId(String(event.over.id)) : null;
    if (!activeItem || !overItem) {
      return;
    }
    if (activeItem.kind !== overItem.kind) {
      return;
    }
    if (!householdId) {
      return;
    }
    if (activeItem.kind === "category") {
      if (activeItem.level === "parent" && overItem.level === "parent") {
        const list = sortedParents;
        const oldIndex = list.findIndex((item) => item.id === activeItem.id);
        const newIndex = list.findIndex((item) => item.id === overItem.id);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          return;
        }
        const nextList = arrayMove(list, oldIndex, newIndex);
        await Promise.all(
          nextList.map((item, index) =>
            updateCategory(householdId, item.id, { order: index + 1 })
          )
        );
        return;
      }
      if (activeItem.level !== "child") {
        return;
      }
      const activeCategory = categories.find(
        (item) => item.id === activeItem.id
      );
      if (!activeCategory) {
        return;
      }
      const sourceParentId = activeItem.parentId ?? null;
      const targetParentId =
        overItem.level === "parent"
          ? overItem.id
          : overItem.parentId ?? null;
      if (!targetParentId) {
        return;
      }
      if (sourceParentId === targetParentId && overItem.level === "child") {
        const list = children
          .filter((child) => child.parentId === sourceParentId)
          .sort((a, b) => a.order - b.order);
        const oldIndex = list.findIndex((item) => item.id === activeItem.id);
        const newIndex = list.findIndex((item) => item.id === overItem.id);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          return;
        }
        const nextList = arrayMove(list, oldIndex, newIndex);
        await Promise.all(
          nextList.map((item, index) =>
            updateCategory(householdId, item.id, { order: index + 1 })
          )
        );
        return;
      }
      if (sourceParentId === targetParentId) {
        return;
      }
      const sourceList = children
        .filter((child) => child.parentId === sourceParentId)
        .filter((child) => child.id !== activeItem.id)
        .sort((a, b) => a.order - b.order);
      const targetList = children
        .filter((child) => child.parentId === targetParentId)
        .sort((a, b) => a.order - b.order);
      const insertIndex =
        overItem.level === "child"
          ? Math.max(
              0,
              targetList.findIndex((item) => item.id === overItem.id)
            )
          : targetList.length;
      const nextTargetList = [...targetList];
      nextTargetList.splice(insertIndex, 0, {
        ...activeCategory,
        parentId: targetParentId,
      });
      await Promise.all(
        nextTargetList.map((item, index) =>
          updateCategory(householdId, item.id, {
            order: index + 1,
            parentId: targetParentId,
          })
        )
      );
      await Promise.all(
        sourceList.map((item, index) =>
          updateCategory(householdId, item.id, { order: index + 1 })
        )
      );
      return;
    }
    if (activeItem.kind === "payment") {
      if (activeItem.owner !== overItem.owner) {
        return;
      }
      if (activeItem.level === "parent" && overItem.level === "parent") {
        const list = sortedPaymentParents;
        const oldIndex = list.findIndex((item) => item.id === activeItem.id);
        const newIndex = list.findIndex((item) => item.id === overItem.id);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          return;
        }
        const nextList = arrayMove(list, oldIndex, newIndex);
        await Promise.all(
          nextList.map((item, index) =>
            updatePaymentMethod(householdId, item.id, { order: index + 1 })
          )
        );
        return;
      }
      if (activeItem.level !== "child") {
        return;
      }
      const activeMethod = paymentMethods.find(
        (item) => item.id === activeItem.id
      );
      if (!activeMethod) {
        return;
      }
      const sourceParentId = activeItem.parentId ?? null;
      const targetParentId =
        overItem.level === "parent"
          ? overItem.id
          : overItem.parentId ?? null;
      if (!targetParentId) {
        return;
      }
      if (sourceParentId === targetParentId && overItem.level === "child") {
        const list = paymentChildren
          .filter((child) => child.parentId === sourceParentId)
          .sort((a, b) => a.order - b.order);
        const oldIndex = list.findIndex((item) => item.id === activeItem.id);
        const newIndex = list.findIndex((item) => item.id === overItem.id);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          return;
        }
        const nextList = arrayMove(list, oldIndex, newIndex);
        await Promise.all(
          nextList.map((item, index) =>
            updatePaymentMethod(householdId, item.id, { order: index + 1 })
          )
        );
        return;
      }
      if (sourceParentId === targetParentId) {
        return;
      }
      const sourceList = paymentChildren
        .filter((child) => child.parentId === sourceParentId)
        .filter((child) => child.id !== activeItem.id)
        .sort((a, b) => a.order - b.order);
      const targetList = paymentChildren
        .filter((child) => child.parentId === targetParentId)
        .sort((a, b) => a.order - b.order);
      const insertIndex =
        overItem.level === "child"
          ? Math.max(
              0,
              targetList.findIndex((item) => item.id === overItem.id)
            )
          : targetList.length;
      const nextTargetList = [...targetList];
      nextTargetList.splice(insertIndex, 0, {
        ...activeMethod,
        parentId: targetParentId,
      });
      await Promise.all(
        nextTargetList.map((item, index) =>
          updatePaymentMethod(householdId, item.id, {
            order: index + 1,
            parentId: targetParentId,
            owner: overItem.owner,
          })
        )
      );
      await Promise.all(
        sourceList.map((item, index) =>
          updatePaymentMethod(householdId, item.id, { order: index + 1 })
        )
      );
      return;
    }
    if (activeItem.kind === "subject") {
      const list = sortedSubjects;
      const oldIndex = list.findIndex((item) => item.id === activeItem.id);
      const newIndex = list.findIndex((item) => item.id === overItem.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return;
      }
      const nextList = arrayMove(list, oldIndex, newIndex);
      await Promise.all(
        nextList.map((item, index) =>
          updateSubject(householdId, item.id, { order: index + 1 })
        )
      );
    }
  }

  const parents = isCategoryTab ? grouped[activeTab as CategoryType].parents : [];
  const children = isCategoryTab
    ? grouped[activeTab as CategoryType].children
    : [];
  const paymentParents = paymentGrouped[paymentOwner].parents;
  const paymentChildren = paymentGrouped[paymentOwner].children;
  const sortedParents = useMemo(
    () => [...parents].sort((a, b) => a.order - b.order),
    [parents]
  );
  const sortedPaymentParents = useMemo(
    () => [...paymentParents].sort((a, b) => a.order - b.order),
    [paymentParents]
  );
  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.order - b.order),
    [subjects]
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
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
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[var(--text)]">항목 추가</p>
            <input
              ref={nameInputRef}
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="이름 입력"
            />
            {activeTab === "payment" ? (
              <select
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="none">대분류 없음</option>
                {paymentParentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} (대분류)
                  </option>
                ))}
              </select>
            ) : null}
            {isCategoryTab ? (
              <select
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="none">대분류 없음</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} (대분류)
                  </option>
                ))}
              </select>
            ) : null}
            {isExpenseTab ? (
              <label className="flex items-center gap-2 text-xs text-[color:rgba(45,38,34,0.8)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={budgetEnabled}
                  onChange={(event) => setBudgetEnabled(event.target.checked)}
                />
                예산
              </label>
            ) : null}
            {isExpenseTab ? (
              <label className="flex items-center gap-2 text-xs text-[color:rgba(45,38,34,0.8)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={personalOnly}
                  onChange={(event) => setPersonalOnly(event.target.checked)}
                />
                내역 비공개(본인만 보기)
              </label>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs text-white"
                onClick={handleAdd}
              >
                추가
              </button>
              <button
                className="rounded-full border border-[var(--border)] px-4 py-2 text-xs"
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
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">불러오는 중...</p>
        ) : isCategoryTab ? (
          <SortableContext
            items={sortedParents.map((parent) =>
              makeDragId({ kind: "category", level: "parent", id: parent.id })
            )}
            strategy={rectSortingStrategy}
          >
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {sortedParents.map((parent) => {
                const childItems = children
                  .filter((child) => child.parentId === parent.id)
                  .sort((a, b) => a.order - b.order);
                const isExpanded = expandedParentId === parent.id;
                return (
                  <SortableCard
                    key={parent.id}
                    id={makeDragId({
                      kind: "category",
                      level: "parent",
                      id: parent.id,
                    })}
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
                          onChange={(event) => setEditingParentId(event.target.value)}
                        >
                          <option value="none">대분류 없음</option>
                          {grouped[editingType].parents.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name} (대분류)
                            </option>
                          ))}
                        </select>
                        {editingType === "expense" ? (
                          <label className="flex items-center gap-2 text-xs text-[color:rgba(45,38,34,0.8)]">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-[var(--border)]"
                              checked={editingBudgetEnabled}
                              onChange={(event) =>
                                setEditingBudgetEnabled(event.target.checked)
                              }
                            />
                            예산
                          </label>
                        ) : null}
                        {editingType === "expense" ? (
                          <label className="flex items-center gap-2 text-xs text-[color:rgba(45,38,34,0.8)]">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-[var(--border)]"
                              checked={editingPersonalOnly}
                              onChange={(event) =>
                                setEditingPersonalOnly(event.target.checked)
                              }
                            />
                            내역 비공개(본인만 보기)
                          </label>
                        ) : null}
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
                            <DragHandle className="text-xs text-[color:rgba(45,38,34,0.45)]" />
                            <button
                              className="text-xs text-[color:rgba(45,38,34,0.6)]"
                              onClick={() =>
                                startEdit(
                                  parent.id,
                                  parent.name,
                                  parent.type,
                                  parent.parentId,
                                  undefined,
                                  parent.budgetEnabled,
                                  parent.personalOnly
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
                              <SortableContext
                                items={childItems.map((child) =>
                                  makeDragId({
                                    kind: "category",
                                    level: "child",
                                    id: child.id,
                                    parentId: parent.id,
                                  })
                                )}
                                strategy={verticalListSortingStrategy}
                              >
                                {childItems.map((child) => (
                                  <SortableCard
                                    key={child.id}
                                    id={makeDragId({
                                      kind: "category",
                                      level: "child",
                                      id: child.id,
                                      parentId: parent.id,
                                    })}
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
                                        {editingType === "expense" ? (
                                          <label className="flex items-center gap-2 text-[10px] text-[color:rgba(45,38,34,0.8)]">
                                            <input
                                              type="checkbox"
                                              className="h-3 w-3 rounded border-[var(--border)]"
                                              checked={editingBudgetEnabled}
                                              onChange={(event) =>
                                                setEditingBudgetEnabled(
                                                  event.target.checked
                                                )
                                              }
                                            />
                                            예산
                                          </label>
                                        ) : null}
                                        {editingType === "expense" ? (
                                          <label className="flex items-center gap-2 text-[10px] text-[color:rgba(45,38,34,0.8)]">
                                            <input
                                              type="checkbox"
                                              className="h-3 w-3 rounded border-[var(--border)]"
                                              checked={editingPersonalOnly}
                                              onChange={(event) =>
                                                setEditingPersonalOnly(
                                                  event.target.checked
                                                )
                                              }
                                            />
                                            내역 비공개
                                          </label>
                                        ) : null}
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
                                        <span className="font-medium">{child.name}</span>
                                        <div className="flex items-center gap-2">
                                          <DragHandle className="text-[10px] text-[color:rgba(45,38,34,0.45)]" />
                                          <button
                                            className="text-[10px] text-[color:rgba(45,38,34,0.6)]"
                                            onClick={() =>
                                              startEdit(
                                                child.id,
                                                child.name,
                                                child.type,
                                                child.parentId,
                                                undefined,
                                                child.budgetEnabled,
                                                child.personalOnly
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
                                  </SortableCard>
                                ))}
                              </SortableContext>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </SortableCard>
                );
              })}
              {parents.length === 0 ? (
                <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
                  등록된 항목이 없습니다.
                </p>
              ) : null}
            </div>
          </SortableContext>
        ) : activeTab === "payment" ? (
          <SortableContext
            items={sortedPaymentParents.map((parent) =>
              makeDragId({
                kind: "payment",
                level: "parent",
                id: parent.id,
                owner: paymentOwner,
              })
            )}
            strategy={rectSortingStrategy}
          >
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {sortedPaymentParents.map((parent) => {
                const childItems = paymentChildren
                  .filter((child) => child.parentId === parent.id)
                  .sort((a, b) => a.order - b.order);
                const isExpanded = expandedPaymentParentId === parent.id;
                return (
                  <SortableCard
                    key={parent.id}
                    id={makeDragId({
                      kind: "payment",
                      level: "parent",
                      id: parent.id,
                      owner: paymentOwner,
                    })}
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
                          onChange={(event) => setEditingParentId(event.target.value)}
                        >
                          <option value="none">대분류 없음</option>
                          {paymentGrouped[editingOwner].parents.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name} (대분류)
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[color:rgba(45,38,34,0.6)]">
                            월 실적
                          </span>
                          <input
                            className="w-28 rounded-lg border border-[var(--border)] px-2 py-1 text-right text-xs"
                            inputMode="numeric"
                            placeholder="0"
                            value={editingGoal}
                            onChange={(event) =>
                              setEditingGoal(formatNumberInput(event.target.value))
                            }
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white"
                            onClick={handleUpdate}
                          >
                            저장
                          </button>
                          <button
                            className="rounded-full border border-[var(--border)] px-3 py-1 text-xs"
                            onClick={() => {
                              setEditingId(null);
                              setEditingGoal("");
                            }}
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
                            <DragHandle className="text-xs text-[color:rgba(45,38,34,0.45)]" />
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
                              <SortableContext
                                items={childItems.map((child) =>
                                  makeDragId({
                                    kind: "payment",
                                    level: "child",
                                    id: child.id,
                                    parentId: parent.id,
                                    owner: paymentOwner,
                                  })
                                )}
                                strategy={verticalListSortingStrategy}
                              >
                                {childItems.map((child) => (
                                  <SortableCard
                                    key={child.id}
                                    id={makeDragId({
                                      kind: "payment",
                                      level: "child",
                                      id: child.id,
                                      parentId: parent.id,
                                      owner: paymentOwner,
                                    })}
                                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                                      child.imported
                                        ? highlightClass
                                        : "border-[var(--border)] bg-white"
                                    }`}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {editingId === child.id ? (
                                      <div className="w-full space-y-2">
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
                                            onClick={() => {
                                              setEditingId(null);
                                              setEditingGoal("");
                                            }}
                                          >
                                            취소
                                          </button>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px]">
                                          <span className="text-[color:rgba(45,38,34,0.6)]">
                                            월 실적
                                          </span>
                                          <input
                                            className="w-24 rounded-md border border-[var(--border)] px-2 py-1 text-right text-[10px]"
                                            inputMode="numeric"
                                            placeholder="0"
                                            value={editingGoal}
                                            onChange={(event) =>
                                              setEditingGoal(
                                                formatNumberInput(event.target.value)
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <span className="font-medium">{child.name}</span>
                                        <div className="flex items-center gap-2">
                                          <DragHandle className="text-[10px] text-[color:rgba(45,38,34,0.45)]" />
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
                                  </SortableCard>
                                ))}
                              </SortableContext>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </SortableCard>
                );
              })}
              {paymentParents.length === 0 ? (
                <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
                  등록된 항목이 없습니다.
                </p>
              ) : null}
            </div>
          </SortableContext>
        ) : (
          <SortableContext
            items={sortedSubjects.map((item) =>
              makeDragId({ kind: "subject", level: "parent", id: item.id })
            )}
            strategy={rectSortingStrategy}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {sortedSubjects.map((item) => (
                <SortableCard
                  key={item.id}
                  id={makeDragId({
                    kind: "subject",
                    level: "parent",
                    id: item.id,
                  })}
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
                        <DragHandle className="text-xs text-[color:rgba(45,38,34,0.45)]" />
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
                </SortableCard>
              ))}
            </div>
          </SortableContext>
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
    </DndContext>
  );
}



