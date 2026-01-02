import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type MemoEntry = {
  id: string;
  text: string;
  createdAt?: Timestamp | null;
  createdBy?: string | null;
};

function normalizeEntries(data: { text?: string; entries?: MemoEntry[]; updatedAt?: Timestamp; updatedBy?: string }) {
  if (Array.isArray(data.entries)) {
    return data.entries.filter((entry) => entry && entry.text);
  }
  if (data.text) {
    return [
      {
        id: "legacy",
        text: data.text,
        createdAt: data.updatedAt ?? Timestamp.now(),
        createdBy: data.updatedBy ?? null,
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
  return normalizeEntries(data);
}

export async function addMonthlyMemoEntry(
  householdId: string,
  monthKey: string,
  text: string,
  uid: string
) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists()
    ? normalizeEntries(snapshot.data() as { text?: string; entries?: MemoEntry[] })
    : [];
  const next = [...existing, createEntry(text, uid)];
  await setDoc(
    ref,
    {
      entries: next,
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
  uid: string
) {
  const ref = doc(db, "households", householdId, "memos", monthKey);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return;
  }
  const existing = normalizeEntries(snapshot.data() as { text?: string; entries?: MemoEntry[] });
  const next = existing.map((entry) =>
    entry.id === entryId ? { ...entry, text } : entry
  );
  await setDoc(
    ref,
    {
      entries: next,
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
      entries: next,
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
