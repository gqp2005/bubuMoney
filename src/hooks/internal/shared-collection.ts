"use client";

import { onSnapshot, type Query } from "firebase/firestore";
import { useCallback, useSyncExternalStore } from "react";

/**
 * 여러 화면이 같은 컬렉션을 동시에 구독할 때 Firestore 리스너를 하나로 합쳐주는
 * 공유 스토어.
 *
 * useEffect 안에서 setState를 직접 부르는 대신 useSyncExternalStore를 쓴다.
 * 외부 스토어 구독이 정확히 이 훅의 용도이고, 연쇄 렌더와 tearing을 둘 다 막는다.
 */
export type CollectionSnapshot<T> = {
  items: T[];
  loading: boolean;
};

const LOADING = { items: [], loading: true } as CollectionSnapshot<never>;
const IDLE = { items: [], loading: false } as CollectionSnapshot<never>;

type Entry<T> = {
  snapshot: CollectionSnapshot<T>;
  unsubscribe?: () => void;
  listeners: Set<() => void>;
};

export function createSharedCollection<T>(
  buildQuery: (householdId: string) => Query,
  mapDoc: (id: string, data: unknown) => T
) {
  const cache = new Map<string, Entry<T>>();

  function getOrCreate(householdId: string): Entry<T> {
    const existing = cache.get(householdId);
    if (existing) {
      return existing;
    }
    const entry: Entry<T> = {
      snapshot: LOADING as CollectionSnapshot<T>,
      listeners: new Set(),
    };
    cache.set(householdId, entry);
    entry.unsubscribe = onSnapshot(buildQuery(householdId), (snapshot) => {
      // useSyncExternalStore는 Object.is로 비교하므로 반드시 새 객체로 교체한다.
      entry.snapshot = {
        items: snapshot.docs.map((docSnap) =>
          mapDoc(docSnap.id, docSnap.data())
        ),
        loading: false,
      };
      entry.listeners.forEach((listener) => listener());
    });
    return entry;
  }

  return function useSharedCollection(
    householdId: string | null
  ): CollectionSnapshot<T> {
    const subscribe = useCallback(
      (onStoreChange: () => void) => {
        if (!householdId) {
          return () => {};
        }
        const entry = getOrCreate(householdId);
        entry.listeners.add(onStoreChange);
        // 구독 시점에 이미 데이터가 와 있을 수 있으므로 한 번 알린다.
        onStoreChange();
        return () => {
          entry.listeners.delete(onStoreChange);
          if (entry.listeners.size === 0) {
            entry.unsubscribe?.();
            cache.delete(householdId);
          }
        };
      },
      [householdId]
    );

    const getSnapshot = useCallback(() => {
      if (!householdId) {
        return IDLE as CollectionSnapshot<T>;
      }
      return cache.get(householdId)?.snapshot ?? (LOADING as CollectionSnapshot<T>);
    }, [householdId]);

    const getServerSnapshot = useCallback(() => IDLE as CollectionSnapshot<T>, []);

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  };
}
