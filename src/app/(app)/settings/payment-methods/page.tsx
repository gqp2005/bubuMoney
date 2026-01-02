"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDoc } from "firebase/firestore";
import { useHousehold } from "@/components/household-provider";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { householdDoc } from "@/lib/firebase/firestore";
import { addNotification } from "@/lib/notifications";
import { updatePaymentMethod } from "@/lib/payment-methods";
import { updateTransactionsPaymentMethodName } from "@/lib/transactions";

type PaymentOwner = "husband" | "wife" | "our";

export default function PaymentMethodsSettingsPage() {
  const router = useRouter();
  const { householdId, displayName, spouseRole } = useHousehold();
  const { paymentMethods } = usePaymentMethods(householdId);
  const [partnerName, setPartnerName] = useState("");
  const [paymentOwner, setPaymentOwner] = useState<PaymentOwner>("our");
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingOriginalName, setEditingOriginalName] = useState("");

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

  const paymentOwnerLabels = useMemo(() => {
    const baseName = displayName?.trim() || "";
    const partnerTrimmed = partnerName.trim();
    const husbandLabel =
      spouseRole === "wife"
        ? partnerTrimmed || "남편"
        : baseName || "남편";
    const wifeLabel =
      spouseRole === "wife" ? baseName || "아내" : partnerTrimmed || "아내";
    return { husbandLabel, wifeLabel };
  }, [displayName, partnerName, spouseRole]);

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

  const highlightClass = "border-amber-300 bg-amber-50";

  function startEdit(paymentId: string, currentName: string) {
    setEditingId(paymentId);
    setEditingName(currentName);
    setEditingOriginalName(currentName);
  }

  async function handleUpdate() {
    if (!householdId || !editingId || !editingName.trim()) {
      return;
    }
    const trimmed = editingName.trim();
    const current = paymentMethods.find((method) => method.id === editingId);
    if (!current) {
      return;
    }
    await updatePaymentMethod(householdId, editingId, {
      name: trimmed,
      owner: current.owner ?? "our",
      parentId: current.parentId ?? null,
      imported: false,
    });
    await updateTransactionsPaymentMethodName(
      householdId,
      editingOriginalName,
      trimmed
    );
    await addNotification(householdId, {
      title: "결제수단 변경",
      message: `${editingOriginalName} → ${trimmed}`,
      level: "info",
      type: "payment.update",
    });
    setEditingId(null);
    setEditingName("");
    setEditingOriginalName("");
  }

  const parents = paymentGrouped[paymentOwner].parents.sort(
    (a, b) => a.order - b.order
  );
  const children = paymentGrouped[paymentOwner].children;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)]"
          onClick={() => router.back()}
          aria-label="뒤로"
        >
          {"<"}
        </button>
        <h1 className="text-lg font-semibold">결제수단 편집</h1>
      </div>

      <div className="flex items-center justify-center gap-6 border-b border-[var(--border)] text-sm">
        {[
          { key: "husband", label: paymentOwnerLabels.husbandLabel },
          { key: "wife", label: paymentOwnerLabels.wifeLabel },
          { key: "our", label: "우리" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`pb-3 ${
              paymentOwner === tab.key
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : "text-[color:rgba(45,38,34,0.5)]"
            }`}
            onClick={() => {
              setPaymentOwner(tab.key as PaymentOwner);
              setExpandedParentId(null);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <div className="space-y-3">
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
              >
                {editingId === parent.id ? (
                  <div className="flex flex-wrap items-center gap-2">
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
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{parent.name}</p>
                        <p className="text-xs text-[color:rgba(45,38,34,0.7)]">
                          소분류 {childItems.length}개
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-[color:rgba(45,38,34,0.6)]"
                          onClick={() => startEdit(parent.id, parent.name)}
                        >
                          편집
                        </button>
                        <button
                          className="text-xl text-[color:rgba(45,38,34,0.4)]"
                          onClick={() =>
                            setExpandedParentId((prev) =>
                              prev === parent.id ? null : parent.id
                            )
                          }
                          aria-label="소분류 보기"
                        >
                          +
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
                                  <button
                                    className="text-[10px] text-[color:rgba(45,38,34,0.6)]"
                                    onClick={() => startEdit(child.id, child.name)}
                                  >
                                    편집
                                  </button>
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
            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
              등록된 결제수단이 없습니다.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
