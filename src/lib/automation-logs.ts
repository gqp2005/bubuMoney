import {
  type Timestamp,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { automationLogsCol } from "@/lib/firebase/firestore";
import type { AutomationLog } from "@/types/ledger";

export type AutomationLogSnapshot = {
  id: string;
  source: AutomationLog["source"];
  action: AutomationLog["action"];
  status: AutomationLog["status"];
  summary: string;
  details?: AutomationLog["details"];
  createdAt: Date | null;
};

function toDateOrNull(value: Timestamp | null | undefined) {
  return value ? value.toDate() : null;
}

export async function getLatestAutomationLogs(
  householdId: string,
  maxItems = 20
) {
  const snapshot = await getDocs(
    query(
      automationLogsCol(householdId),
      orderBy("createdAt", "desc"),
      limit(maxItems)
    )
  );

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as AutomationLog;
    return {
      id: docSnap.id,
      source: data.source,
      action: data.action,
      status: data.status,
      summary: data.summary,
      details: data.details ?? {},
      createdAt: toDateOrNull(data.createdAt),
    } satisfies AutomationLogSnapshot;
  });
}
