"use client";

import { useEffect } from "react";

type UndoToastProps = {
  message: string;
  onUndo: () => void | Promise<void>;
  onDismiss: () => void;
  expiresAt?: number | null;
  undoLabel?: string;
  dismissLabel?: string;
  busy?: boolean;
};

export default function UndoToast({
  message,
  onUndo,
  onDismiss,
  expiresAt,
  undoLabel = "되돌리기",
  dismissLabel = "닫기",
  busy = false,
}: UndoToastProps) {
  useEffect(() => {
    if (!expiresAt) {
      return;
    }
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      onDismiss();
      return;
    }
    const timer = window.setTimeout(() => {
      onDismiss();
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [expiresAt, onDismiss]);

  return (
    <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(420px,92vw)] -translate-x-1/2 rounded-2xl bg-[var(--text)] px-4 py-3 text-white shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm">{message}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-white/30 px-3 py-1 text-xs disabled:opacity-60"
            onClick={() => void onUndo()}
            disabled={busy}
          >
            {busy ? "처리 중..." : undoLabel}
          </button>
          <button
            type="button"
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/75 disabled:opacity-60"
            onClick={onDismiss}
            disabled={busy}
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
