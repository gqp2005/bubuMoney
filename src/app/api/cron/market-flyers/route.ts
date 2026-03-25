import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { toMonthKey } from "@/lib/time";
import {
  RULIWEB_MARKET_RSS_URL,
  buildMarketFlyerSourceKey,
  isTodayMarketFlyerItem,
  parseRuliwebMarketRss,
} from "@/lib/server/ruliweb-market-flyers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_CREATED_BY = "system:ruliweb-market-rss";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type AdminMemoEntry = {
  id: string;
  text: string;
  createdAt?: Date | { toDate?: () => Date } | null;
  createdBy?: string | null;
  visibleFrom?: Date | { toDate?: () => Date } | null;
  visibleUntil?: Date | { toDate?: () => Date } | null;
  linkUrl?: string | null;
  sourceKey?: string | null;
};

function toDateOrNull(value: AdminMemoEntry["createdAt"]) {
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

function normalizeEntries(data: { text?: string; entries?: AdminMemoEntry[] }) {
  if (Array.isArray(data.entries)) {
    return data.entries
      .filter((entry) => entry && typeof entry.text === "string" && entry.text.trim())
      .map((entry) => ({
        id: entry.id,
        text: entry.text,
        createdAt: toDateOrNull(entry.createdAt),
        createdBy: entry.createdBy ?? null,
        visibleFrom: toDateOrNull(entry.visibleFrom),
        visibleUntil: toDateOrNull(entry.visibleUntil),
        linkUrl: entry.linkUrl ?? null,
        sourceKey: entry.sourceKey ?? null,
      }));
  }

  if (typeof data.text === "string" && data.text.trim()) {
    return [
      {
        id: "legacy",
        text: data.text,
        createdAt: null,
        createdBy: null,
        visibleFrom: null,
        visibleUntil: null,
        linkUrl: null,
        sourceKey: null,
      },
    ];
  }

  return [];
}

function toFirestoreEntries(entries: ReturnType<typeof normalizeEntries>) {
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

function requireCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

function resolveTargetHouseholdId(request: NextRequest) {
  const queryValue = request.nextUrl.searchParams.get("householdId")?.trim();
  if (queryValue) {
    return queryValue;
  }
  return process.env.RSS_MARKET_MEMO_HOUSEHOLD_ID?.trim() ?? "";
}

async function purgeExpiredMemoEntries(householdId: string) {
  const db = getAdminDb();
  const snapshot = await db.collection("households").doc(householdId).collection("memos").get();
  if (snapshot.empty) {
    return 0;
  }

  const now = new Date();
  const removedCounts = await Promise.all(
    snapshot.docs.map(async (docSnap) => {
      const entries = normalizeEntries(docSnap.data() as { text?: string; entries?: AdminMemoEntry[] });
      const nextEntries = entries.filter((entry) => {
        if (!entry.visibleUntil) {
          return true;
        }
        return entry.visibleUntil >= now;
      });

      if (nextEntries.length === entries.length) {
        return 0;
      }

      await docSnap.ref.set(
        {
          entries: toFirestoreEntries(nextEntries),
          updatedBy: SYSTEM_CREATED_BY,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return entries.length - nextEntries.length;
    })
  );

  return removedCounts.reduce((sum, count) => sum + count, 0);
}

async function upsertMarketFlyerMemo(
  householdId: string,
  item: {
    title: string;
    link: string;
    publishedAt: Date;
  }
) {
  const db = getAdminDb();
  const monthKey = toMonthKey(item.publishedAt);
  const sourceKey = buildMarketFlyerSourceKey(item.link);
  const memoRef = db.collection("households").doc(householdId).collection("memos").doc(monthKey);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(memoRef);
    const existingEntries = snapshot.exists
      ? normalizeEntries(snapshot.data() as { text?: string; entries?: AdminMemoEntry[] })
      : [];

    if (
      existingEntries.some(
        (entry) => entry.sourceKey === sourceKey || entry.linkUrl === item.link
      )
    ) {
      return false;
    }

    const nextEntries = [
      ...existingEntries,
      {
        id: randomUUID(),
        text: item.title,
        createdAt: item.publishedAt,
        createdBy: SYSTEM_CREATED_BY,
        visibleFrom: item.publishedAt,
        visibleUntil: new Date(item.publishedAt.getTime() + SEVEN_DAYS_MS),
        linkUrl: item.link,
        sourceKey,
      },
    ];

    transaction.set(
      memoRef,
      {
        entries: toFirestoreEntries(nextEntries),
        updatedBy: SYSTEM_CREATED_BY,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  });
}

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) {
    return authError;
  }

  const householdId = resolveTargetHouseholdId(request);
  if (!householdId) {
    return Response.json(
      { error: "RSS_MARKET_MEMO_HOUSEHOLD_ID is not configured." },
      { status: 500 }
    );
  }

  const purgeCount = await purgeExpiredMemoEntries(householdId);

  const response = await fetch(RULIWEB_MARKET_RSS_URL, {
    cache: "no-store",
    headers: {
      "user-agent": "couple-ledger-market-flyer-bot/1.0",
    },
  });

  if (!response.ok) {
    return Response.json(
      { error: `Failed to fetch RSS feed: ${response.status}` },
      { status: 502 }
    );
  }

  const xml = await response.text();
  const rssItems = parseRuliwebMarketRss(xml);
  const now = new Date();
  const matchedItems = rssItems.filter((item) => isTodayMarketFlyerItem(item, now));
  const results = await Promise.all(
    matchedItems.map((item) => upsertMarketFlyerMemo(householdId, item))
  );
  const insertedCount = results.filter(Boolean).length;

  return Response.json({
    householdId,
    checkedAt: now.toISOString(),
    fetched: rssItems.length,
    matched: matchedItems.length,
    inserted: insertedCount,
    skipped: matchedItems.length - insertedCount,
    purged: purgeCount,
  });
}
