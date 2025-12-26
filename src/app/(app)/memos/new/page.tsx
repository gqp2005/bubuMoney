"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { getMonthlyMemo, setMonthlyMemo } from "@/lib/memos";
import { toMonthKey } from "@/lib/time";

export default function NewMemoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const monthKey = toMonthKey(new Date());

  useEffect(() => {
    if (!householdId) {
      return;
    }
    setLoading(true);
    getMonthlyMemo(householdId, monthKey)
      .then((text) => setMemo(text ?? ""))
      .finally(() => setLoading(false));
  }, [householdId, monthKey]);

  useEffect(() => {
    if (!householdId || !user) {
      return;
    }
    const timeout = setTimeout(async () => {
      setStatus("자동 저장 중...");
      try {
        await setMonthlyMemo(householdId, monthKey, memo, user.uid);
        setStatus("자동 저장됨");
      } catch (err) {
        setStatus("자동 저장 실패");
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [householdId, memo, monthKey, user]);

  async function handleSave() {
    if (!householdId || !user) {
      return;
    }
    setSaving(true);
    try {
      await setMonthlyMemo(householdId, monthKey, memo, user.uid);
      router.replace("/dashboard");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
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
        <textarea
          className="min-h-[220px] w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm"
          placeholder="예) 이번 달 식비는 40만원 이하로 유지하기"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          disabled={loading}
        />
        <div className="mt-4 flex items-center justify-between text-sm text-[color:rgba(45,38,34,0.7)]">
          <span>{status ?? ""}</span>
          <button
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm text-white disabled:opacity-70"
            onClick={handleSave}
            disabled={saving || !householdId || !user}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </section>
    </div>
  );
}
