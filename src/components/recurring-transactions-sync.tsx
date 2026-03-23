"use client";

import { useEffect, useRef } from "react";
import { useHousehold } from "@/components/household-provider";
import { syncRecurringTransactionRules } from "@/lib/recurring-transactions";

const SYNC_THROTTLE_MS = 60 * 1000;

export default function RecurringTransactionsSync() {
  const { householdId } = useHousehold();
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    if (!householdId || typeof document === "undefined") {
      return;
    }
    const activeHouseholdId = householdId;

    let disposed = false;

    async function runSync(force = false) {
      if (disposed) {
        return;
      }
      const now = Date.now();
      if (!force && now - lastRunAtRef.current < SYNC_THROTTLE_MS) {
        return;
      }
      lastRunAtRef.current = now;
      try {
        await syncRecurringTransactionRules(activeHouseholdId);
      } catch (error) {
        console.error("Failed to sync recurring transactions", error);
      }
    }

    void runSync(true);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void runSync();
      }
    }

    function handleWindowFocus() {
      void runSync();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [householdId]);

  return null;
}
