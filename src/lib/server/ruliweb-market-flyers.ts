import "server-only";

import axios from "axios";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { isSameSeoulDate, parseRuliwebBoardDateLabel } from "@/lib/server/ruliweb-market-flyers-date";
import {
  RULIWEB_MARKET_BOARD_SELECTORS,
  RULIWEB_MARKET_BOARD_URL,
  RULIWEB_MARKET_BOARD_USER_AGENT,
  RULIWEB_MARKET_FLYER_KEYWORDS,
} from "@/lib/server/ruliweb-market-flyers-selectors";
import { RULIWEB_SOURCE_KEY_PREFIX } from "@/lib/server/admin-memos";

export type RuliwebMarketFlyerPost = {
  title: string;
  linkUrl: string;
  sourceKey: string;
  publishedAt: Date;
  matchedKeywords: string[];
  timeLabel: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toAbsoluteRuliwebUrl(value: string) {
  const url = new URL(value, RULIWEB_MARKET_BOARD_URL);
  url.hash = "";
  if (url.search === "?") {
    url.search = "";
  }
  return url.toString().replace(/\?$/, "");
}

export function buildRuliwebSourceKey(linkUrl: string) {
  const normalizedUrl = toAbsoluteRuliwebUrl(linkUrl);
  const postId = normalizedUrl.match(/\/read\/(\d+)/)?.[1];
  return postId
    ? `${RULIWEB_SOURCE_KEY_PREFIX}${postId}`
    : `${RULIWEB_SOURCE_KEY_PREFIX}${normalizedUrl}`;
}

export function getMatchedFlyerKeywords(title: string) {
  return RULIWEB_MARKET_FLYER_KEYWORDS.filter((keyword) => title.includes(keyword));
}

function extractRowTitle($row: cheerio.Cheerio<Element>) {
  const $link = $row.find(RULIWEB_MARKET_BOARD_SELECTORS.titleLink).first();
  if ($link.length === 0) {
    return "";
  }

  const $clone = $link.clone();
  $clone.find(RULIWEB_MARKET_BOARD_SELECTORS.replyCount).remove();
  $clone.find(RULIWEB_MARKET_BOARD_SELECTORS.inlineIcons).remove();
  return normalizeWhitespace($clone.text());
}

export async function crawlTodayLargeMartFlyers(now = new Date()) {
  const response = await axios.get<string>(RULIWEB_MARKET_BOARD_URL, {
    responseType: "text",
    timeout: 15000,
    headers: {
      "user-agent": RULIWEB_MARKET_BOARD_USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  const $ = cheerio.load(response.data);
  const seenSourceKeys = new Set<string>();
  const posts: RuliwebMarketFlyerPost[] = [];

  $(RULIWEB_MARKET_BOARD_SELECTORS.row).each((_, element) => {
    const $row = $(element);
    const title = extractRowTitle($row);
    const href = $row.find(RULIWEB_MARKET_BOARD_SELECTORS.titleLink).first().attr("href")?.trim();
    const timeLabel = normalizeWhitespace(
      $row.find(RULIWEB_MARKET_BOARD_SELECTORS.timeCell).first().text()
    );

    if (!title || !href || !timeLabel) {
      return;
    }

    const publishedAt = parseRuliwebBoardDateLabel(timeLabel, now);
    if (!publishedAt || !isSameSeoulDate(publishedAt, now)) {
      return;
    }

    const matchedKeywords = getMatchedFlyerKeywords(title);
    if (matchedKeywords.length < 2) {
      return;
    }

    const linkUrl = toAbsoluteRuliwebUrl(href);
    const sourceKey = buildRuliwebSourceKey(linkUrl);
    if (seenSourceKeys.has(sourceKey)) {
      return;
    }

    seenSourceKeys.add(sourceKey);
    posts.push({
      title,
      linkUrl,
      sourceKey,
      publishedAt,
      matchedKeywords,
      timeLabel,
    });
  });

  return posts;
}
