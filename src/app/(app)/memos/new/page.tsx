"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import {
  addMonthlyMemoEntry,
  deleteMonthlyMemoEntry,
  getMonthlyMemoEntries,
  updateMonthlyMemoEntry,
} from "@/lib/memos";
import { toMonthKey } from "@/lib/time";

export default function NewMemoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [visibleFrom, setVisibleFrom] = useState("");
  const [visibleUntil, setVisibleUntil] = useState("");
  const monthKeyFromQuery = searchParams.get("monthKey");
  const monthKey =
    monthKeyFromQuery && /^\d{4}-\d{2}$/.test(monthKeyFromQuery)
      ? monthKeyFromQuery
      : toMonthKey(new Date());
  const isCreateMode = searchParams.get("mode") === "create";
  const entryId = searchParams.get("entryId");

  function parseDateInput(value: string, endOfDay = false): Date | null {
    if (!value) {
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }
    const parsed = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  useEffect(() => {
    if (!householdId) {
      return;
    }
    setLoading(true);
    getMonthlyMemoEntries(householdId, monthKey)
      .then((entries) => {
        if (isCreateMode) {
          setMemo("");
          return;
        }
        const target =
          entryId && entries.length > 0
            ? entries.find((entry) => entry.id === entryId)
            : entries[0];
        setMemo(target?.text ?? "");
        setVisibleFrom(
          target?.visibleFrom ? format(target.visibleFrom.toDate(), "yyyy-MM-dd") : ""
        );
        setVisibleUntil(
          target?.visibleUntil ? format(target.visibleUntil.toDate(), "yyyy-MM-dd") : ""
        );
      })
      .finally(() => setLoading(false));
  }, [householdId, isCreateMode, monthKey, entryId]);

  useEffect(() => {
    if (!householdId || !user || isCreateMode || !entryId) {
      return;
    }
    const timeout = setTimeout(async () => {
      const parsedFrom = parseDateInput(visibleFrom, false);
      const parsedUntil = parseDateInput(visibleUntil, true);
      if ((visibleFrom && !parsedFrom) || (visibleUntil && !parsedUntil)) {
        setStatus("날짜 형식을 확인해주세요.");
        return;
      }
      if (parsedFrom && parsedUntil && parsedFrom > parsedUntil) {
        setStatus("기간 설정 오류");
        return;
      }
      setStatus("자동 저장 중...");
      try {
        await updateMonthlyMemoEntry(householdId, monthKey, entryId, memo, user.uid, {
          visibleFrom: parsedFrom,
          visibleUntil: parsedUntil,
        });
        setStatus("자동 저장됨");
      } catch {
        setStatus("자동 저장 실패");
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [householdId, memo, monthKey, user, isCreateMode, entryId, visibleFrom, visibleUntil]);

  async function handleSave() {
    if (!householdId || !user) {
      return;
    }
    setSaving(true);
    try {
      const trimmed = memo.trim();
      const parsedFrom = parseDateInput(visibleFrom, false);
      const parsedUntil = parseDateInput(visibleUntil, true);
      if ((visibleFrom && !parsedFrom) || (visibleUntil && !parsedUntil)) {
        setStatus("날짜 형식을 확인해주세요.");
        setSaving(false);
        return;
      }
      if (parsedFrom && parsedUntil && parsedFrom > parsedUntil) {
        setStatus("기간 설정 오류: 시작일이 종료일보다 늦을 수 없습니다.");
        setSaving(false);
        return;
      }
      if (!trimmed) {
        setSaving(false);
        return;
      }
      if (isCreateMode) {
        await addMonthlyMemoEntry(
          householdId,
          monthKey,
          trimmed,
          user.uid,
          {
            visibleFrom: parsedFrom,
            visibleUntil: parsedUntil,
          }
        );
      } else if (entryId) {
        await updateMonthlyMemoEntry(householdId, monthKey, entryId, trimmed, user.uid, {
          visibleFrom: parsedFrom,
          visibleUntil: parsedUntil,
        });
      } else {
        await addMonthlyMemoEntry(householdId, monthKey, trimmed, user.uid, {
          visibleFrom: parsedFrom,
          visibleUntil: parsedUntil,
        });
      }
      router.replace("/dashboard");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!householdId || !user || !entryId) {
      return;
    }
    setSaving(true);
    try {
      await deleteMonthlyMemoEntry(householdId, monthKey, entryId, user.uid);
      router.replace("/dashboard");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 ios-no-zoom">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">메모 작성</h1>
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
            오늘의 지출/계획을 기록하세요.
          </p>
        </div>
        <Link
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm"
          href="/dashboard"
        >
          취소
        </Link>
      </div>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            표시 시작일 (선택)
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={visibleFrom}
              onChange={(event) => setVisibleFrom(event.target.value)}
              disabled={loading}
            />
          </label>
          <label className="text-sm font-medium">
            표시 종료일 (선택)
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={visibleUntil}
              onChange={(event) => setVisibleUntil(event.target.value)}
              disabled={loading}
            />
          </label>
        </div>
        <textarea
          className="min-h-[220px] w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm"
          placeholder="예) 이번 달 식비는 40만원 이하로 유지하기"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          disabled={loading}
        />
        <div className="mt-4 flex items-center justify-between text-sm text-[color:rgba(45,38,34,0.7)]">
          <span>{status ?? ""}</span>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-[var(--border)] px-5 py-2 text-sm text-red-600 disabled:opacity-60"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || !entryId}
            >
              삭제
            </button>
            <button
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm text-white disabled:opacity-70"
              onClick={handleSave}
              disabled={saving || !householdId || !user}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </section>
      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-6">
            <h2 className="text-base font-semibold">메모 삭제</h2>
            <p className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
              이 메모를 삭제할까요?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                아니오
              </button>
              <button
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white"
                onClick={handleDelete}
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
