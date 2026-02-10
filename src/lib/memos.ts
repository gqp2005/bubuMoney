import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type MemoEntry = {
  id: string;
  text: string;
  createdAt?: Timestamp | null;
  createdBy?: string | null;
  visibleFrom?: Timestamp | null;
  visibleUntil?: Timestamp | null;
  monthKey?: string;
};

function toFirestoreEntries(entries: MemoEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    text: entry.text,
    createdAt: entry.createdAt ?? null,
    createdBy: entry.createdBy ?? null,
    visibleFrom: entry.visibleFrom ?? null,
    visibleUntil: entry.visibleUntil ?? null,
  }));
}

function normalizeEntries(data: {
  text?: string;
  entries?: MemoEntry[];
  updatedAt?: Timestamp;
  updatedBy?: string;
}, monthKey?: string) {
  if (Array.isArray(data.entries)) {
    return data.entries
      .filter((entry) => entry && entry.text)
      .map((entry) =>
        monthKey ? { ...entry, monthKey } : { ...entry }
      );
  }
  if (data.text) {
    return [
      {
        id: "legacy",
        text: data.text,
        createdAt: data.updatedAt ?? Timestamp.now(),
        createdBy: data.updatedBy ?? null,
        monthKey: monthKey ?? undefined,
      },
    ];
  }
  return [];
}

function createEntry(text: string, uid: string) {
  const fallbackId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : fallbackId,
    text,
    createdAt: Timestamp.now(),
    createdBy: uid,
    visibleFrom: null,
    visibleUntil: null,
  } as MemoEntry;
}

export async function getMonthlyMemoEntries(
  householdId: string,
  monthKey: string
) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return [];
  }
  const data = snapshot.data() as {
    text?: string;
    entries?: MemoEntry[];
    updatedAt?: Timestamp;
    updatedBy?: string;
  };
  return normalizeEntries(data, monthKey);
}

export async function getLatestMemoEntries(householdId: string) {
  const memosRef = collection(db, "households", householdId, "memos");
  const snapshot = await getDocs(query(memosRef, orderBy("updatedAt", "desc"), limit(20)));
  if (snapshot.empty) {
    return [];
  }
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as {
      text?: string;
      entries?: MemoEntry[];
      updatedAt?: Timestamp;
      updatedBy?: string;
    };
    const entries = normalizeEntries(data, docSnap.id);
    if (entries.length > 0) {
      return entries;
    }
  }
  return [];
}

export async function purgeExpiredMemoEntries(householdId: string, uid?: string) {
  const memosRef = collection(db, "households", householdId, "memos");
  const snapshot = await getDocs(memosRef);
  if (snapshot.empty) {
    return;
  }
  const now = new Date();
  await Promise.all(
    snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data() as {
        text?: string;
        entries?: MemoEntry[];
      };
      const entries = normalizeEntries(data, docSnap.id);
      const nextEntries = entries.filter((entry) => {
        const until = entry.visibleUntil?.toDate?.();
        if (!until) {
          return true;
        }
        return until >= now;
      });
      if (nextEntries.length === entries.length) {
        return;
      }
      await setDoc(
        doc(db, "households", householdId, "memos", docSnap.id),
        {
          entries: toFirestoreEntries(nextEntries),
          updatedBy: uid ?? "system",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    })
  );
}

export async function addMonthlyMemoEntry(
  householdId: string,
  monthKey: string,
  text: string,
  uid: string,
  options?: {
    visibleFrom?: Date | null;
    visibleUntil?: Date | null;
  }
) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists()
    ? normalizeEntries(snapshot.data() as { text?: string; entries?: MemoEntry[] })
    : [];
  const nextEntry = createEntry(text, uid);
  nextEntry.visibleFrom = options?.visibleFrom
    ? Timestamp.fromDate(options.visibleFrom)
    : null;
  nextEntry.visibleUntil = options?.visibleUntil
    ? Timestamp.fromDate(options.visibleUntil)
    : null;
  const next = [...existing, nextEntry];
  await setDoc(
    ref,
    {
      entries: toFirestoreEntries(next),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateMonthlyMemoEntry(
  householdId: string,
  monthKey: string,
  entryId: string,
  text: string,
  uid: string,
  options?: {
    visibleFrom?: Date | null;
    visibleUntil?: Date | null;
  }
) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return;
  }
  const existing = normalizeEntries(snapshot.data() as { text?: string; entries?: MemoEntry[] });
  const next = existing.map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          text,
          visibleFrom: options?.visibleFrom
            ? Timestamp.fromDate(options.visibleFrom)
            : null,
          visibleUntil: options?.visibleUntil
            ? Timestamp.fromDate(options.visibleUntil)
            : null,
        }
      : entry
  );
  await setDoc(
    ref,
    {
      entries: toFirestoreEntries(next),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteMonthlyMemoEntry(
  householdId: string,
  monthKey: string,
  entryId: string,
  uid: string
) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return;
  }
  const existing = normalizeEntries(snapshot.data() as { text?: string; entries?: MemoEntry[] });
  const next = existing.filter((entry) => entry.id !== entryId);
  await setDoc(
    ref,
    {
      entries: toFirestoreEntries(next),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function setMonthlyMemo(
  householdId: string,
  monthKey: string,
  text: string,
  uid: string
) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  await setDoc(
    ref,
    {
      text,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteMonthlyMemo(
  householdId: string,
  monthKey: string
) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  await setDoc(ref, { text: "" }, { merge: true });
}
