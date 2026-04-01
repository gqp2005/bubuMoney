import type { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  purgeExpiredRuliwebMemoEntries,
  RULIWEB_MEMO_CREATED_BY,
} from "@/lib/server/admin-memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireCronSecret(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization")?.trim();

  if (!configuredSecret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  if (authHeader !== `Bearer ${configuredSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

function resolveTargetHouseholdId(request: NextRequest) {
  const householdIdFromQuery = request.nextUrl.searchParams.get("householdId")?.trim();
  if (householdIdFromQuery) {
    return householdIdFromQuery;
  }

  return (
    process.env.RULIWEB_MARKET_MEMO_HOUSEHOLD_ID?.trim() ||
    process.env.RSS_MARKET_MEMO_HOUSEHOLD_ID?.trim() ||
    ""
  );
}

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) {
    return authError;
  }

  const householdId = resolveTargetHouseholdId(request);
  if (!householdId) {
    return Response.json(
      {
        error: "RULIWEB_MARKET_MEMO_HOUSEHOLD_ID is not configured.",
      },
      { status: 500 }
    );
  }

  try {
    const result = await purgeExpiredRuliwebMemoEntries({
      db: getAdminDb(),
      householdId,
      updatedBy: RULIWEB_MEMO_CREATED_BY,
    });

    return Response.json({
      householdId,
      cleanedAt: new Date().toISOString(),
      scannedDocuments: result.scannedDocuments,
      touchedDocuments: result.touchedDocuments,
      removedEntries: result.removedEntries,
    });
  } catch (error) {
    console.error("[cron/market-flyers/cleanup] cleanup failed", error);
    return Response.json(
      {
        error: "Failed to purge expired Ruliweb memo entries.",
      },
      { status: 500 }
    );
  }
}
