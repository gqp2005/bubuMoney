import "server-only";

import { randomUUID } from "crypto";
import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";

type AutomationLogPayload = {
  source: "ruliweb-market-flyers";
  action: "collect" | "cleanup";
  status: "success" | "noop" | "error";
  summary: string;
  details?: {
    crawled?: number;
    matched?: number;
    inserted?: number;
    skipped?: number;
    scannedDocuments?: number;
    touchedDocuments?: number;
    removedEntries?: number;
    monthKey?: string | null;
    titles?: string[];
    error?: string | null;
  };
};

export async function writeAutomationLog(params: {
  db: Firestore;
  householdId: string;
  payload: AutomationLogPayload;
}) {
  const { db, householdId, payload } = params;
  const ref = db
    .collection("households")
    .doc(householdId)
    .collection("automationLogs")
    .doc(randomUUID());

  await ref.set({
    source: payload.source,
    action: payload.action,
    status: payload.status,
    summary: payload.summary,
    details: payload.details ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function safeWriteAutomationLog(params: {
  db: Firestore;
  householdId: string;
  payload: AutomationLogPayload;
}) {
  try {
    await writeAutomationLog(params);
  } catch (error) {
    console.error("[automation-logs] write failed", error);
  }
}
