import type { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { safeWriteAutomationLog } from "@/lib/server/automation-logs";
import {
  appendMemoEntriesToMonth,
  buildRuliwebMemoEntry,
  getDuplicateScanMonthKeys,
  RULIWEB_MEMO_CREATED_BY,
} from "@/lib/server/admin-memos";
import { crawlTodayLargeMartFlyers } from "@/lib/server/ruliweb-market-flyers";
import { toMonthKey } from "@/lib/time";

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

  const now = new Date();
  const db = getAdminDb();

  try {
    const posts = await crawlTodayLargeMartFlyers(now);
    if (posts.length === 0) {
      await safeWriteAutomationLog({
        db,
        householdId,
        payload: {
          source: "ruliweb-market-flyers",
          action: "collect",
          status: "noop",
          summary: "오늘 조건에 맞는 루리웹 대형마트 전단 글이 없었습니다.",
          details: {
            crawled: 0,
            matched: 0,
            inserted: 0,
            skipped: 0,
          },
        },
      });

      return Response.json({
        householdId,
        checkedAt: now.toISOString(),
        crawled: 0,
        matched: 0,
        inserted: 0,
        skipped: 0,
      });
    }

    const monthKey = toMonthKey(now);
    const entries = posts.map((post) =>
      buildRuliwebMemoEntry({
        title: post.title,
        linkUrl: post.linkUrl,
        sourceKey: post.sourceKey,
        createdAt: now,
        visibleFrom: now,
      })
    );

    const result = await appendMemoEntriesToMonth({
      db,
      householdId,
      monthKey,
      entries,
      duplicateMonthKeys: getDuplicateScanMonthKeys(now),
      updatedBy: RULIWEB_MEMO_CREATED_BY,
    });

    const insertedTitles = posts
      .filter((post) => result.insertedSourceKeys.includes(post.sourceKey))
      .slice(0, 5)
      .map((post) => post.title);

    await safeWriteAutomationLog({
      db,
      householdId,
      payload: {
        source: "ruliweb-market-flyers",
        action: "collect",
        status: result.insertedCount > 0 ? "success" : "noop",
        summary:
          result.insertedCount > 0
            ? `루리웹 전단 글 ${result.insertedCount}건을 메모에 등록했습니다.`
            : "조건에 맞는 글은 있었지만 모두 이미 등록된 글이라 추가하지 않았습니다.",
        details: {
          crawled: posts.length,
          matched: posts.length,
          inserted: result.insertedCount,
          skipped: result.skippedCount,
          monthKey,
          titles: insertedTitles,
        },
      },
    });

    return Response.json({
      householdId,
      checkedAt: now.toISOString(),
      crawled: posts.length,
      matched: posts.length,
      inserted: result.insertedCount,
      skipped: result.skippedCount,
      monthKey,
    });
  } catch (error) {
    console.error("[cron/market-flyers] collection failed", error);
    await safeWriteAutomationLog({
      db,
      householdId,
      payload: {
        source: "ruliweb-market-flyers",
        action: "collect",
        status: "error",
        summary: "루리웹 전단 글 수집 중 오류가 발생했습니다.",
        details: {
          error: error instanceof Error ? error.message : "unknown error",
        },
      },
    });
    return Response.json(
      {
        error: "Failed to collect Ruliweb market flyers.",
      },
      { status: 500 }
    );
  }
}
