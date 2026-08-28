import "server-only";

import { randomUUID } from "crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";

export const AUTOMATION_LOG_RETENTION_DAYS = 3;
const AUTOMATION_LOG_RETENTION_MS =
  AUTOMATION_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const AUTOMATION_LOG_DELETE_BATCH_SIZE = 450;

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
    removedAutomationLogs?: number;
    monthKey?: string | null;
    titles?: string[];
    error?: string | null;
    code?: string | null;
    statusCode?: number | null;
    attempts?: number | null;
    elapsedMs?: number | null;
    timeoutMs?: number | null;
    url?: string | null;
    transport?: string | null;
    region?: string | null;
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
    expiresAt: Timestamp.fromDate(
      new Date(Date.now() + AUTOMATION_LOG_RETENTION_MS)
    ),
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

export async function deleteExpiredAutomationLogs(params: {
  db: Firestore;
  householdId: string;
  now?: Date;
}) {
  const { db, householdId, now = new Date() } = params;
  const cutoff = Timestamp.fromDate(
    new Date(now.getTime() - AUTOMATION_LOG_RETENTION_MS)
  );
  const collectionRef = db
    .collection("households")
    .doc(householdId)
    .collection("automationLogs");

  let deletedCount = 0;

  while (true) {
    const snapshot = await collectionRef
      .where("createdAt", "<", cutoff)
      .limit(AUTOMATION_LOG_DELETE_BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    deletedCount += snapshot.size;

    if (snapshot.size < AUTOMATION_LOG_DELETE_BATCH_SIZE) {
      break;
    }
  }

  return { deletedCount };
}
