import "server-only";

import { toDateKey } from "@/lib/time";

export const RULIWEB_MARKET_RSS_URL = "https://bbs.ruliweb.com/market/board/1020/rss";
export const MARKET_FLYER_REQUIRED_KEYWORD = "전단";
export const MARKET_FLYER_STORE_KEYWORDS = ["홈플러스", "이마트", "롯데마트"] as const;

export type RuliwebMarketRssItem = {
  title: string;
  link: string;
  publishedAt: Date;
};

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTag(block: string, tagName: string) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  if (!match) {
    return "";
  }
  return decodeXmlEntities(stripCdata(match[1].trim()));
}

export function parseRuliwebMarketRss(xml: string) {
  const items: RuliwebMarketRssItem[] = [];
  const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

  for (const match of matches) {
    const block = match[1];
    const title = extractTag(block, "title").trim();
    const link = extractTag(block, "link").trim();
    const pubDate = extractTag(block, "pubDate").trim();
    const publishedAt = new Date(pubDate);

    if (!title || !link || Number.isNaN(publishedAt.getTime())) {
      continue;
    }

    items.push({
      title,
      link,
      publishedAt,
    });
  }

  return items;
}

export function isTodayMarketFlyerItem(item: RuliwebMarketRssItem, now = new Date()) {
  return (
    toDateKey(item.publishedAt) === toDateKey(now) &&
    item.title.includes(MARKET_FLYER_REQUIRED_KEYWORD) &&
    MARKET_FLYER_STORE_KEYWORDS.some((keyword) => item.title.includes(keyword))
  );
}

export function buildMarketFlyerSourceKey(link: string) {
  const postIdMatch = link.match(/\/read\/(\d+)/);
  if (postIdMatch) {
    return `ruliweb-market-flyer:${postIdMatch[1]}`;
  }
  return `ruliweb-market-flyer:${link}`;
}
