"use client";

import { format } from "date-fns";
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
  const hasUnread =
    uid && notifications.some((item) => !item.readBy?.[uid]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">알림</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-[var(--border)] px-3 py-1 text-xs"
            onClick={() => {
              if (!householdId || !uid) {
                return;
              }
              markAllNotificationsRead(householdId, uid);
            }}
            disabled={!hasUnread}
          >
            모두 읽음
          </button>
        </div>
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
          <div className="space-y-2">
            {notifications.map((item) => (
              <div
                key={item.id}
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
                <p className="mt-1 text-xs">{item.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
