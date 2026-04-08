"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLatestAutomationLogs,
  type AutomationLogSnapshot,
} from "@/lib/automation-logs";
import { formatDate } from "@/lib/time";

type MarketFlyerLogSectionProps = {
  householdId: string | null;
};

function getActionLabel(action: AutomationLogSnapshot["action"]) {
  return action === "collect" ? "수집" : "정리";
}

function getStatusLabel(status: AutomationLogSnapshot["status"]) {
  if (status === "success") {
    return "성공";
  }
  if (status === "error") {
    return "실패";
  }
  return "변경 없음";
}

function getStatusClassName(status: AutomationLogSnapshot["status"]) {
  if (status === "success") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (status === "error") {
    return "bg-red-50 text-red-700 border-red-200";
  }
  return "bg-[color:rgba(45,38,34,0.06)] text-[color:rgba(45,38,34,0.7)] border-[var(--border)]";
}

function buildDetailSummary(log: AutomationLogSnapshot) {
  if (log.action === "collect") {
    return `탐색 ${log.details?.crawled ?? 0}건 · 등록 ${log.details?.inserted ?? 0}건 · 중복/스킵 ${log.details?.skipped ?? 0}건`;
  }

  return `스캔 문서 ${log.details?.scannedDocuments ?? 0}개 · 정리 ${log.details?.removedEntries ?? 0}건`;
}

export default function MarketFlyerLogSection({
  householdId,
}: MarketFlyerLogSectionProps) {
  const [logs, setLogs] = useState<AutomationLogSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!householdId) {
      setLogs([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextLogs = await getLatestAutomationLogs(householdId, 20);
      setLogs(nextLogs);
    } catch (loadError) {
      console.error("[settings/market-flyer-logs] load failed", loadError);
      setError("로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">루리웹 전단 수집 로그</h2>
          <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
            루리웹 전단 글 수집과 만료 메모 정리 결과를 최근 20건까지 보여줍니다.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs disabled:opacity-60"
          onClick={() => void loadLogs()}
          disabled={!householdId || loading}
        >
          {loading ? "새로고침 중.." : "새로고침"}
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <p className="mt-4 text-sm text-[color:rgba(45,38,34,0.65)]">
          로그를 불러오는 중입니다.
        </p>
      ) : null}

      {!loading && !error && logs.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[color:rgba(45,38,34,0.02)] px-4 py-4 text-sm text-[color:rgba(45,38,34,0.65)]">
          아직 저장된 루리웹 수집 로그가 없습니다.
        </div>
      ) : null}

      {logs.length > 0 ? (
        <div className="mt-4 space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-2xl border border-[var(--border)] bg-[color:rgba(45,38,34,0.02)] px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusClassName(
                    log.status
                  )}`}
                >
                  {getStatusLabel(log.status)}
                </span>
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[color:rgba(45,38,34,0.7)]">
                  {getActionLabel(log.action)}
                </span>
                <span className="text-[11px] text-[color:rgba(45,38,34,0.55)]">
                  {log.createdAt
                    ? formatDate(log.createdAt, "yyyy.MM.dd HH:mm")
                    : "시간 정보 없음"}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-[var(--text)]">{log.summary}</p>
              <p className="mt-1 text-xs text-[color:rgba(45,38,34,0.6)]">
                {buildDetailSummary(log)}
                {log.details?.monthKey ? ` · 대상 월 ${log.details.monthKey}` : ""}
              </p>
              {log.details?.titles && log.details.titles.length > 0 ? (
                <div className="mt-2 rounded-xl border border-[var(--border)] bg-white px-3 py-3">
                  <p className="text-[11px] font-medium text-[color:rgba(45,38,34,0.75)]">
                    이번에 메모에 등록한 제목
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-[color:rgba(45,38,34,0.7)]">
                    {log.details.titles.map((title) => (
                      <li key={title}>- {title}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {log.details?.error ? (
                <p className="mt-2 text-xs text-red-600">오류: {log.details.error}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
