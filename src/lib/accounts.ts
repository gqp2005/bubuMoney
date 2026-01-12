import {
  Timestamp,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { accountGroupsCol, accountsCol, transfersCol } from "@/lib/firebase/firestore";
import { toMonthKey } from "@/lib/time";
import type { Account, AccountGroup } from "@/types/ledger";

type AccountInput = Omit<Account, "createdAt">;
type AccountGroupInput = Omit<AccountGroup, "createdAt">;

export async function addAccount(householdId: string, data: AccountInput) {
  const sanitized = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
  return addDoc(accountsCol(householdId), {
    ...sanitized,
    createdAt: serverTimestamp(),
  });
}

export async function addAccountGroup(
  householdId: string,
  data: AccountGroupInput
) {
  return addDoc(accountGroupsCol(householdId), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateAccountGroup(
  householdId: string,
  groupId: string,
  data: Partial<AccountGroup>
) {
  return updateDoc(doc(accountGroupsCol(householdId), groupId), data);
}

export async function deleteAccountGroup(
  householdId: string,
  groupId: string
) {
  const groupRef = doc(accountGroupsCol(householdId), groupId);
  const accountsQuery = query(
    accountsCol(householdId),
    where("groupId", "==", groupId)
  );
  const accountsSnapshot = await getDocs(accountsQuery);
  const batch = writeBatch(db);
  accountsSnapshot.forEach((docSnap) => {
    batch.update(docSnap.ref, { groupId: null });
  });
  batch.delete(groupRef);
  await batch.commit();
}

export async function updateAccount(
  householdId: string,
  accountId: string,
  data: Partial<Account>
) {
  const sanitized = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
  return updateDoc(doc(accountsCol(householdId), accountId), sanitized);
}

export async function deleteAccount(householdId: string, accountId: string) {
  return deleteDoc(doc(accountsCol(householdId), accountId));
}

export async function addTransfer(params: {
  householdId: string;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  amount: number;
  date: Date;
  memo?: string;
  createdBy: string;
}) {
  const {
    householdId,
    fromAccountId,
    toAccountId,
    amount,
    date,
    memo,
    createdBy,
  } = params;

  if (!fromAccountId && !toAccountId) {
    throw new Error("이체 계좌를 선택해주세요.");
  }
  if (fromAccountId && toAccountId && fromAccountId === toAccountId) {
    throw new Error("같은 계좌로는 이체할 수 없습니다.");
  }

  const transferRef = doc(transfersCol(householdId));
  const fromRef = fromAccountId
    ? doc(accountsCol(householdId), fromAccountId)
    : null;
  const toRef = toAccountId ? doc(accountsCol(householdId), toAccountId) : null;

  await runTransaction(db, async (tx) => {
    if (fromRef) {
      const fromSnap = await tx.get(fromRef);
      if (!fromSnap.exists()) {
        throw new Error("출금 계좌를 찾을 수 없습니다.");
      }
      const fromBalance = (fromSnap.data().balance as number) ?? 0;
      tx.update(fromRef, { balance: fromBalance - amount });
    }

    if (toRef) {
      const toSnap = await tx.get(toRef);
      if (!toSnap.exists()) {
        throw new Error("입금 계좌를 찾을 수 없습니다.");
      }
      const toBalance = (toSnap.data().balance as number) ?? 0;
      tx.update(toRef, { balance: toBalance + amount });
    }

    tx.set(transferRef, {
      fromAccountId: fromAccountId ?? null,
      toAccountId: toAccountId ?? null,
      accountIds: [fromAccountId, toAccountId].filter(Boolean),
      amount,
      date: Timestamp.fromDate(date),
      monthKey: toMonthKey(date),
      memo: memo ?? "",
      createdBy,
      createdAt: serverTimestamp(),
    });
  });
}

export async function updateTransfer(params: {
  householdId: string;
  transferId: string;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  amount: number;
  date: Date;
  memo?: string;
}) {
  const {
    householdId,
    transferId,
    fromAccountId,
    toAccountId,
    amount,
    date,
    memo,
  } = params;

  if (!fromAccountId && !toAccountId) {
    throw new Error("이체 계좌를 선택해주세요.");
  }
  if (fromAccountId && toAccountId && fromAccountId === toAccountId) {
    throw new Error("같은 계좌로는 이체할 수 없습니다.");
  }

  const transferRef = doc(transfersCol(householdId), transferId);
  const nextFromRef = fromAccountId
    ? doc(accountsCol(householdId), fromAccountId)
    : null;
  const nextToRef = toAccountId ? doc(accountsCol(householdId), toAccountId) : null;

  await runTransaction(db, async (tx) => {
    const currentSnap = await tx.get(transferRef);
    if (!currentSnap.exists()) {
      throw new Error("이체 내역을 찾을 수 없습니다.");
    }
    const current = currentSnap.data() as {
      fromAccountId?: string | null;
      toAccountId?: string | null;
      amount: number;
    };

    const prevFromRef = current.fromAccountId
      ? doc(accountsCol(householdId), current.fromAccountId)
      : null;
    const prevToRef = current.toAccountId
      ? doc(accountsCol(householdId), current.toAccountId)
      : null;

    const refsToRead = new Map<string, NonNullable<typeof prevFromRef>>();
    const addRef = (ref: typeof prevFromRef | null) => {
      if (ref) {
        refsToRead.set(ref.path, ref);
      }
    };
    addRef(prevFromRef);
    addRef(prevToRef);
    addRef(nextFromRef);
    addRef(nextToRef);

    const snapshots = new Map<string, Awaited<ReturnType<typeof tx.get>>>();
    for (const ref of refsToRead.values()) {
      const snap = await tx.get(ref);
      snapshots.set(ref.path, snap);
    }

    const getBalance = (ref: typeof prevFromRef) => {
      if (!ref) {
        return null;
      }
      const snap = snapshots.get(ref.path);
      if (!snap || !snap.exists()) {
        throw new Error("계좌를 찾을 수 없습니다.");
      }
      return (snap.data().balance as number) ?? 0;
    };

    const deltas = new Map<string, number>();
    const addDelta = (ref: typeof prevFromRef, delta: number) => {
      if (!ref) {
        return;
      }
      deltas.set(ref.path, (deltas.get(ref.path) ?? 0) + delta);
    };

    addDelta(prevFromRef, current.amount);
    addDelta(prevToRef, -current.amount);
    addDelta(nextFromRef, -amount);
    addDelta(nextToRef, amount);

    for (const [path, delta] of deltas.entries()) {
      const ref = refsToRead.get(path);
      if (!ref) {
        continue;
      }
      const balance = getBalance(ref) ?? 0;
      tx.update(ref, { balance: balance + delta });
    }

    tx.update(transferRef, {
      fromAccountId: fromAccountId ?? null,
      toAccountId: toAccountId ?? null,
      accountIds: [fromAccountId, toAccountId].filter(Boolean),
      amount,
      date: Timestamp.fromDate(date),
      monthKey: toMonthKey(date),
      memo: memo ?? "",
    });
  });
}

export async function deleteTransfer(params: {
  householdId: string;
  transferId: string;
}) {
  const { householdId, transferId } = params;
  const transferRef = doc(transfersCol(householdId), transferId);

  await runTransaction(db, async (tx) => {
    const currentSnap = await tx.get(transferRef);
    if (!currentSnap.exists()) {
      throw new Error("이체 내역을 찾을 수 없습니다.");
    }
    const current = currentSnap.data() as {
      fromAccountId?: string | null;
      toAccountId?: string | null;
      amount: number;
    };

    const prevFromRef = current.fromAccountId
      ? doc(accountsCol(householdId), current.fromAccountId)
      : null;
    const prevToRef = current.toAccountId
      ? doc(accountsCol(householdId), current.toAccountId)
      : null;

    const refsToRead = new Map<string, NonNullable<typeof prevFromRef>>();
    const addRef = (ref: typeof prevFromRef | null) => {
      if (ref) {
        refsToRead.set(ref.path, ref);
      }
    };
    addRef(prevFromRef);
    addRef(prevToRef);

    const snapshots = new Map<string, Awaited<ReturnType<typeof tx.get>>>();
    for (const ref of refsToRead.values()) {
      const snap = await tx.get(ref);
      snapshots.set(ref.path, snap);
    }

    const getBalance = (ref: typeof prevFromRef) => {
      if (!ref) {
        return null;
      }
      const snap = snapshots.get(ref.path);
      if (!snap || !snap.exists()) {
        throw new Error("계좌를 찾을 수 없습니다.");
      }
      return (snap.data().balance as number) ?? 0;
    };

    const deltas = new Map<string, number>();
    const addDelta = (ref: typeof prevFromRef, delta: number) => {
      if (!ref) {
        return;
      }
      deltas.set(ref.path, (deltas.get(ref.path) ?? 0) + delta);
    };

    addDelta(prevFromRef, current.amount);
    addDelta(prevToRef, -current.amount);

    for (const [path, delta] of deltas.entries()) {
      const ref = refsToRead.get(path);
      if (!ref) {
        continue;
      }
      const balance = getBalance(ref) ?? 0;
      tx.update(ref, { balance: balance + delta });
    }

    tx.delete(transferRef);
  });
}
