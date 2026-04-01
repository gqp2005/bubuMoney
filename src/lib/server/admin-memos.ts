import "server-only";

import { randomUUID } from "crypto";
import {
  FieldValue,
  type DocumentData,
  type Firestore,
  type Timestamp,
} from "firebase-admin/firestore";
import { toMonthKey } from "@/lib/time";

export const RULIWEB_MEMO_CREATED_BY = "system:ruliweb-bot";
export const RULIWEB_SOURCE_KEY_PREFIX = "ruliweb:market:1020:";
export const RULIWEB_MEMO_VISIBLE_DAYS = 7;

type TimestampLike = Date | Timestamp | { toDate?: () => Date } | null | undefined;

export type AdminMemoEntry = {
  id: string;
  text: string;
  createdAt?: TimestampLike;
  createdBy?: string | null;
  visibleFrom?: TimestampLike;
  visibleUntil?: TimestampLike;
  linkUrl?: string | null;
  sourceKey?: string | null;
};

export type NormalizedAdminMemoEntry = {
  id: string;
  text: string;
  createdAt: Date | null;
  createdBy: string | null;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  linkUrl: string | null;
  sourceKey: string | null;
};

function toDateOrNull(value: TimestampLike) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

export function normalizeAdminMemoEntries(data: {
  text?: string;
  entries?: AdminMemoEntry[];
}) {
  if (Array.isArray(data.entries)) {
    return data.entries
      .filter((entry) => entry && typeof entry.text === "string" && entry.text.trim())
      .map<NormalizedAdminMemoEntry>((entry) => ({
        id: entry.id,
        text: entry.text.trim(),
        createdAt: toDateOrNull(entry.createdAt),
        createdBy: entry.createdBy ?? null,
        visibleFrom: toDateOrNull(entry.visibleFrom),
        visibleUntil: toDateOrNull(entry.visibleUntil),
        linkUrl: entry.linkUrl?.trim() || null,
        sourceKey: entry.sourceKey?.trim() || null,
      }));
  }

  if (typeof data.text === "string" && data.text.trim()) {
    return [
      {
        id: "legacy",
        text: data.text.trim(),
        createdAt: null,
        createdBy: null,
        visibleFrom: null,
        visibleUntil: null,
        linkUrl: null,
        sourceKey: null,
      },
    ] satisfies NormalizedAdminMemoEntry[];
  }

  return [] as NormalizedAdminMemoEntry[];
}

export function toFirestoreMemoEntries(entries: NormalizedAdminMemoEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    text: entry.text,
    createdAt: entry.createdAt ?? null,
    createdBy: entry.createdBy ?? null,
    visibleFrom: entry.visibleFrom ?? null,
    visibleUntil: entry.visibleUntil ?? null,
    linkUrl: entry.linkUrl ?? null,
    sourceKey: entry.sourceKey ?? null,
  }));
}

export function buildRuliwebMemoEntry(input: {
  title: string;
  linkUrl: string;
  sourceKey: string;
  createdAt?: Date;
  visibleFrom?: Date;
  visibleUntil?: Date;
}) {
  const createdAt = input.createdAt ?? new Date();
  const visibleFrom = input.visibleFrom ?? createdAt;
  const visibleUntil =
    input.visibleUntil ??
    new Date(createdAt.getTime() + RULIWEB_MEMO_VISIBLE_DAYS * 24 * 60 * 60 * 1000);

  return {
    id: randomUUID(),
    text: input.title.trim(),
    createdAt,
    createdBy: RULIWEB_MEMO_CREATED_BY,
    visibleFrom,
    visibleUntil,
    linkUrl: input.linkUrl,
    sourceKey: input.sourceKey,
  } satisfies NormalizedAdminMemoEntry;
}

export function getDuplicateScanMonthKeys(date: Date) {
  const currentMonthKey = toMonthKey(date);
  const previousVisibleWindowMonthKey = toMonthKey(
    new Date(date.getTime() - RULIWEB_MEMO_VISIBLE_DAYS * 24 * 60 * 60 * 1000)
  );

  return Array.from(new Set([currentMonthKey, previousVisibleWindowMonthKey]));
}

export async function appendMemoEntriesToMonth(params: {
  db: Firestore;
  householdId: string;
  monthKey: string;
  entries: NormalizedAdminMemoEntry[];
  duplicateMonthKeys?: string[];
  updatedBy?: string;
}) {
  const {
    db,
    householdId,
    monthKey,
    entries,
    duplicateMonthKeys = [],
    updatedBy = RULIWEB_MEMO_CREATED_BY,
  } = params;

  const memosCollection = db.collection("households").doc(householdId).collection("memos");
  const scanMonthKeys = Array.from(new Set([monthKey, ...duplicateMonthKeys]));

  return db.runTransaction(async (transaction) => {
    const refs = scanMonthKeys.map((scanKey) => memosCollection.doc(scanKey));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const targetIndex = scanMonthKeys.indexOf(monthKey);
    const targetSnapshot = snapshots[targetIndex];
    const targetEntries = targetSnapshot?.exists
      ? normalizeAdminMemoEntries(targetSnapshot.data() as DocumentData)
      : [];

    const seenSourceKeys = new Set<string>();
    const seenLinks = new Set<string>();

    for (const snapshot of snapshots) {
      if (!snapshot.exists) {
        continue;
      }
      const normalizedEntries = normalizeAdminMemoEntries(snapshot.data() as DocumentData);
      for (const entry of normalizedEntries) {
        if (entry.sourceKey) {
          seenSourceKeys.add(entry.sourceKey);
        }
        if (entry.linkUrl) {
          seenLinks.add(entry.linkUrl);
        }
      }
    }

    const nextEntries = [...targetEntries];
    let insertedCount = 0;
    let skippedCount = 0;

    for (const entry of entries) {
      const duplicateBySourceKey = Boolean(entry.sourceKey && seenSourceKeys.has(entry.sourceKey));
      const duplicateByLink = Boolean(entry.linkUrl && seenLinks.has(entry.linkUrl));
      if (duplicateBySourceKey || duplicateByLink) {
        skippedCount += 1;
        continue;
      }

      if (entry.sourceKey) {
        seenSourceKeys.add(entry.sourceKey);
      }
      if (entry.linkUrl) {
        seenLinks.add(entry.linkUrl);
      }
      nextEntries.push(entry);
      insertedCount += 1;
    }

    if (insertedCount > 0) {
      transaction.set(
        memosCollection.doc(monthKey),
        {
          entries: toFirestoreMemoEntries(nextEntries),
          updatedBy,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return {
      insertedCount,
      skippedCount,
    };
  });
}

export async function purgeExpiredRuliwebMemoEntries(params: {
  db: Firestore;
  householdId: string;
  now?: Date;
  updatedBy?: string;
}) {
  const {
    db,
    householdId,
    now = new Date(),
    updatedBy = RULIWEB_MEMO_CREATED_BY,
  } = params;

  const memosCollection = db.collection("households").doc(householdId).collection("memos");
  const snapshot = await memosCollection.get();
  if (snapshot.empty) {
    return {
      scannedDocuments: 0,
      removedEntries: 0,
      touchedDocuments: 0,
    };
  }

  let removedEntries = 0;
  let touchedDocuments = 0;

  for (const docSnap of snapshot.docs) {
    const currentEntries = normalizeAdminMemoEntries(docSnap.data() as DocumentData);
    const nextEntries = currentEntries.filter((entry) => {
      const isBotEntry =
        entry.createdBy === RULIWEB_MEMO_CREATED_BY ||
        (entry.sourceKey?.startsWith(RULIWEB_SOURCE_KEY_PREFIX) ?? false);

      if (!isBotEntry || !entry.visibleUntil) {
        return true;
      }

      return entry.visibleUntil >= now;
    });

    if (nextEntries.length === currentEntries.length) {
      continue;
    }

    removedEntries += currentEntries.length - nextEntries.length;
    touchedDocuments += 1;

    await docSnap.ref.set(
      {
        entries: toFirestoreMemoEntries(nextEntries),
        updatedBy,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    scannedDocuments: snapshot.size,
    removedEntries,
    touchedDocuments,
  };
}
