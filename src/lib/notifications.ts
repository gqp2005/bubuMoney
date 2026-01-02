import {
  addDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { notificationsCol } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/client";

export type NotificationLevel = "info" | "success" | "error";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  level: NotificationLevel;
  createdAt?: { toDate: () => Date } | null;
  readBy?: Record<string, unknown>;
  hiddenBy?: Record<string, boolean>;
};

export async function addNotification(
  householdId: string,
  data: {
    title: string;
    message: string;
    level?: NotificationLevel;
    type?: string;
  }
) {
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return addDoc(notificationsCol(householdId), {
    title: data.title,
    message: data.message,
    level: data.level ?? "info",
    type: data.type ?? "general",
    createdAt: serverTimestamp(),
    expiresAt,
  });
}

export async function markNotificationRead(
  householdId: string,
  notificationId: string,
  uid: string
) {
  return updateDoc(doc(notificationsCol(householdId), notificationId), {
    [`readBy.${uid}`]: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(householdId: string, uid: string) {
  const snapshot = await getDocs(
    query(notificationsCol(householdId), orderBy("createdAt", "desc"), limit(500))
  );
  if (snapshot.empty) {
    return;
  }
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, { [`readBy.${uid}`]: serverTimestamp() });
  });
  await batch.commit();
}

export async function hideNotificationForUser(
  householdId: string,
  notificationId: string,
  uid: string
) {
  return updateDoc(doc(notificationsCol(householdId), notificationId), {
    [`hiddenBy.${uid}`]: true,
  });
}

 

export function useNotifications(
  householdId: string | null,
  uid?: string | null,
  limitCount = 50
) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      notificationsCol(householdId),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<NotificationItem, "id">),
      }));
      const filtered = uid
        ? items.filter((item) => !item.hiddenBy?.[uid])
        : items;
      setNotifications(filtered);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [householdId, uid, limitCount]);

  return { notifications, loading };
}
