"use client";

import { format, isToday, isYesterday } from "date-fns";
import { Fragment, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import {
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from "@/lib/notifications";

function levelStyles(level: "info" | "success" | "error") {
  if (level === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (level === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-[var(--border)] bg-white text-[color:rgba(45,38,34,0.8)]";
}

export default function NotificationsPage() {
  const { householdId } = useHousehold();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { notifications, loading } = useNotifications(householdId, uid);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(40);
  const safeVisibleCount = Math.min(visibleCount, notifications.length);
  const hasUnread =
    uid && notifications.some((item) => !item.readBy?.[uid]);

  useEffect(() => {
    if (!householdId || !uid || !hasUnread) {
      return;
    }
    markAllNotificationsRead(householdId, uid);
  }, [hasUnread, householdId, uid]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">알림</h1>
      </div>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-4">
        {loading ? (
          <p className="text-sm text-[color:rgba(45,38,34,0.6)]">
            불러오는 중...
          </p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-[color:rgba(45,38,34,0.6)]">
            아직 알림이 없습니다.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {(() => {
                let lastBucket: "today" | "yesterday" | "older" | null = null;
                return notifications.slice(0, safeVisibleCount).map((item) => {
                  const createdAt = item.createdAt?.toDate() ?? null;
                  let bucket: "today" | "yesterday" | "older" = "older";
                  if (createdAt && isToday(createdAt)) {
                    bucket = "today";
                  } else if (createdAt && isYesterday(createdAt)) {
                    bucket = "yesterday";
                  }
                  const showHeader = bucket !== lastBucket;
                  lastBucket = bucket;
                  const bucketLabel =
                    bucket === "today"
                      ? "오늘"
                      : bucket === "yesterday"
                      ? "어제"
                      : "이전";
                  const isExpanded = expandedIds.has(item.id);
                  const shouldClamp = item.message.length > 50;
                  return (
                    <Fragment key={item.id}>
                      {showHeader ? (
                        <div className="px-1 pt-2 text-[11px] font-semibold text-[color:rgba(45,38,34,0.6)]">
                          {bucketLabel}
                        </div>
                      ) : null}
                      <div
                        className={`rounded-2xl border px-4 py-3 text-sm ${levelStyles(
                          item.level
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                uid && item.readBy?.[uid]
                                  ? "bg-[color:rgba(45,38,34,0.2)]"
                                  : "bg-[var(--accent)]"
                              }`}
                            />
                            <p
                              className={`font-semibold ${
                                uid && item.readBy?.[uid]
                                  ? "text-[color:rgba(45,38,34,0.6)]"
                                  : "text-[color:rgba(45,38,34,0.9)]"
                              }`}
                            >
                              {item.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[color:rgba(45,38,34,0.5)]">
                              {item.createdAt
                                ? format(item.createdAt.toDate(), "MM.dd HH:mm")
                                : ""}
                            </span>
                            {uid && !item.readBy?.[uid] ? (
                              <button
                                type="button"
                                className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px]"
                                onClick={() => {
                                  if (!householdId || !uid) {
                                    return;
                                  }
                                  markNotificationRead(householdId, item.id, uid);
                                }}
                              >
                                읽음
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <p
                          className={`mt-1 text-xs ${
                            isExpanded ? "whitespace-pre-line" : "truncate"
                          }`}
                          title={item.message}
                        >
                          {item.message}
                        </p>
                        {shouldClamp ? (
                          <button
                            type="button"
                            className="mt-1 text-[11px] text-[color:rgba(45,38,34,0.6)]"
                            onClick={() => {
                              setExpandedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.id)) {
                                  next.delete(item.id);
                                } else {
                                  next.add(item.id);
                                }
                                return next;
                              });
                            }}
                          >
                            {isExpanded ? "접기" : "더보기"}
                          </button>
                        ) : null}
                      </div>
                    </Fragment>
                  );
                });
              })()}
            </div>
            {notifications.length > safeVisibleCount ? (
              <button
                type="button"
                className="mt-3 w-full rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[color:rgba(45,38,34,0.7)]"
                onClick={() =>
                  setVisibleCount((prev) =>
                    Math.min(prev + 40, notifications.length)
                  )
                }
              >
                더보기
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
