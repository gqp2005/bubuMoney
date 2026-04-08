import type { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { safeWriteAutomationLog } from "@/lib/server/automation-logs";
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
    const db = getAdminDb();
    const result = await purgeExpiredRuliwebMemoEntries({
      db,
      householdId,
      updatedBy: RULIWEB_MEMO_CREATED_BY,
    });

    await safeWriteAutomationLog({
      db,
      householdId,
      payload: {
        source: "ruliweb-market-flyers",
        action: "cleanup",
        status: result.removedEntries > 0 ? "success" : "noop",
        summary:
          result.removedEntries > 0
            ? `만료된 루리웹 전단 메모 ${result.removedEntries}건을 정리했습니다.`
            : "정리할 만료 루리웹 전단 메모가 없었습니다.",
        details: {
          scannedDocuments: result.scannedDocuments,
          touchedDocuments: result.touchedDocuments,
          removedEntries: result.removedEntries,
        },
      },
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
    const db = getAdminDb();
    await safeWriteAutomationLog({
      db,
      householdId,
      payload: {
        source: "ruliweb-market-flyers",
        action: "cleanup",
        status: "error",
        summary: "루리웹 전단 메모 정리 중 오류가 발생했습니다.",
        details: {
          error: error instanceof Error ? error.message : "unknown error",
        },
      },
    });
    return Response.json(
      {
        error: "Failed to purge expired Ruliweb memo entries.",
      },
      { status: 500 }
    );
  }
}
