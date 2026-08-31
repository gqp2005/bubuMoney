import "server-only";

import axios from "axios";
import { isSameSeoulDate } from "@/lib/server/ruliweb-market-flyers-date";
import {
  parseRuliwebReaderRssMarkdown,
  parseRuliwebRssXml,
} from "@/lib/server/ruliweb-market-flyers-rss";
import {
  RULIWEB_MARKET_BOARD_URL,
  RULIWEB_MARKET_BOARD_USER_AGENT,
  RULIWEB_MARKET_FLYER_KEYWORDS,
  RULIWEB_MARKET_RSS_READER_URL,
  RULIWEB_MARKET_RSS_URL,
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

export type RuliwebMarketFlyerErrorDetails = {
  error: string;
  code?: string | null;
  statusCode?: number | null;
  attempts: number;
  elapsedMs: number;
  timeoutMs: number;
  url: string;
  transport?: string | null;
};

export type RuliwebMarketFlyerCrawlResult = {
  posts: RuliwebMarketFlyerPost[];
  request: {
    attempts: number;
    elapsedMs: number;
    url: string;
    transport: "jina-reader-rss" | "direct-rss";
  };
};

const DEFAULT_REQUEST_TIMEOUT_MS = 25000;
const DEFAULT_REQUEST_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 2000;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRequestTimeoutMs() {
  return parsePositiveInteger(
    process.env.RULIWEB_MARKET_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS
  );
}

function getRequestMaxAttempts() {
  return parsePositiveInteger(
    process.env.RULIWEB_MARKET_REQUEST_MAX_ATTEMPTS,
    DEFAULT_REQUEST_MAX_ATTEMPTS
  );
}

function getRetryDelayMs() {
  return parsePositiveInteger(
    process.env.RULIWEB_MARKET_REQUEST_RETRY_DELAY_MS,
    DEFAULT_RETRY_DELAY_MS
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractErrorCause(error: unknown) {
  if (error && typeof error === "object" && "cause" in error) {
    return (error as { cause?: unknown }).cause;
  }

  return null;
}

function extractErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === "string" ? value : null;
  }

  const cause = extractErrorCause(error);
  if (cause && typeof cause === "object" && "code" in cause) {
    const value = (cause as { code?: unknown }).code;
    return typeof value === "string" ? value : null;
  }

  return null;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause = extractErrorCause(error);
    if (cause instanceof Error && cause.message && cause.message !== error.message) {
      return `${error.message}: ${cause.message}`;
    }

    return error.message;
  }

  return "unknown error";
}

function extractErrorStatusCode(error: unknown) {
  if (error && typeof error === "object" && "statusCode" in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    return typeof value === "number" ? value : null;
  }

  const cause = extractErrorCause(error);
  if (cause && typeof cause === "object" && "statusCode" in cause) {
    const value = (cause as { statusCode?: unknown }).statusCode;
    return typeof value === "number" ? value : null;
  }

  return null;
}

class RuliwebMarketFlyerRequestError extends Error {
  readonly details: RuliwebMarketFlyerErrorDetails;

  constructor(details: RuliwebMarketFlyerErrorDetails, cause: unknown) {
    super(details.error);
    this.name = "RuliwebMarketFlyerRequestError";
    this.details = details;
    (this as Error & { cause?: unknown }).cause = cause;
  }
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

export function getRuliwebMarketFlyerErrorDetails(error: unknown) {
  if (error instanceof RuliwebMarketFlyerRequestError) {
    return error.details;
  }

  return null;
}

function shouldRetryRequest(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const statusCode = error.response?.status;
  if (statusCode === 408 || statusCode === 429 || (statusCode !== undefined && statusCode >= 500)) {
    return true;
  }

  if (!error.response) {
    return true;
  }

  return ["ECONNABORTED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT"].includes(
    error.code ?? ""
  );
}

function buildRequestErrorDetails(params: {
  error: unknown;
  attempts: number;
  elapsedMs: number;
  timeoutMs: number;
  url: string;
  transport: string;
}) {
  const { error, attempts, elapsedMs, timeoutMs, url, transport } = params;

  if (!axios.isAxiosError(error)) {
    const message = extractErrorMessage(error);
    const code = extractErrorCode(error);
    const statusCode = extractErrorStatusCode(error);
    const detailParts = [
      `transport=${transport}`,
      `attempts=${attempts}`,
      `elapsedMs=${elapsedMs}`,
      `timeoutMs=${timeoutMs}`,
    ];

    if (code) {
      detailParts.push(`code=${code}`);
    }
    if (statusCode !== null) {
      detailParts.push(`status=${statusCode}`);
    }

    return {
      error: `${message} (${detailParts.join(", ")})`,
      code,
      statusCode,
      attempts,
      elapsedMs,
      timeoutMs,
      url,
      transport,
    } satisfies RuliwebMarketFlyerErrorDetails;
  }

  const code = error.code ?? null;
  const statusCode = error.response?.status ?? null;
  const detailParts = [
    `transport=${transport}`,
    `attempts=${attempts}`,
    `elapsedMs=${elapsedMs}`,
    `timeoutMs=${timeoutMs}`,
  ];

  if (code) {
    detailParts.push(`code=${code}`);
  }
  if (statusCode !== null) {
    detailParts.push(`status=${statusCode}`);
  }

  return {
    error: `${error.message} (${detailParts.join(", ")})`,
    code,
    statusCode,
    attempts,
    elapsedMs,
    timeoutMs,
    url,
    transport,
  } satisfies RuliwebMarketFlyerErrorDetails;
}

type JinaReaderResponse = {
  code?: number;
  data?: {
    content?: string;
    httpStatus?: number;
    httpStatusText?: string;
  };
};

type RuliwebMarketFeedResult = {
  items: ReturnType<typeof parseRuliwebRssXml>;
  attempts: number;
  elapsedMs: number;
  url: string;
  transport: "jina-reader-rss" | "direct-rss";
};

function createFeedError(message: string, code: string, statusCode?: number) {
  const error = new Error(message) as Error & {
    code?: string;
    statusCode?: number;
  };
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function requestRssWithJinaReader(timeoutMs: number) {
  const response = await axios.get<JinaReaderResponse>(
    RULIWEB_MARKET_RSS_READER_URL,
    {
      responseType: "json",
      timeout: timeoutMs,
      headers: {
        "user-agent": RULIWEB_MARKET_BOARD_USER_AGENT,
        accept: "application/json",
        "x-timeout": String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        "x-token-budget": "10000",
        "x-no-cache": "true",
      },
    }
  );
  const readerData = response.data?.data;
  if (
    response.data?.code !== 200 ||
    readerData?.httpStatus !== 200 ||
    !readerData.content
  ) {
    throw createFeedError(
      `Jina Reader returned an invalid RSS response (${readerData?.httpStatusText || "unknown status"})`,
      "JINA_READER_INVALID_RESPONSE",
      readerData?.httpStatus
    );
  }

  const items = parseRuliwebReaderRssMarkdown(readerData.content);
  if (items.length === 0) {
    throw createFeedError(
      "Jina Reader RSS response contained no parseable items",
      "JINA_READER_RSS_PARSE_EMPTY"
    );
  }

  return items;
}

async function requestRssDirectly(timeoutMs: number) {
  const response = await axios.get<string>(RULIWEB_MARKET_RSS_URL, {
    responseType: "text",
    timeout: timeoutMs,
    headers: {
      "user-agent": RULIWEB_MARKET_BOARD_USER_AGENT,
      accept: "application/rss+xml,application/xml,text/xml",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });
  const items = parseRuliwebRssXml(response.data);
  if (items.length === 0) {
    throw createFeedError(
      "Direct Ruliweb RSS response contained no parseable items",
      "DIRECT_RSS_PARSE_EMPTY"
    );
  }

  return items;
}

async function fetchRuliwebMarketFeed(): Promise<RuliwebMarketFeedResult> {
  const timeoutMs = getRequestTimeoutMs();
  const maxAttempts = getRequestMaxAttempts();
  const retryDelayMs = getRetryDelayMs();
  const startedAt = Date.now();
  let totalAttempts = 0;
  let readerError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    totalAttempts += 1;
    try {
      const items = await requestRssWithJinaReader(timeoutMs);
      return {
        items,
        attempts: totalAttempts,
        elapsedMs: Date.now() - startedAt,
        url: RULIWEB_MARKET_RSS_READER_URL,
        transport: "jina-reader-rss",
      };
    } catch (error) {
      readerError = error;
      const isLastAttempt = attempt >= maxAttempts;
      if (shouldRetryRequest(error) && !isLastAttempt) {
        await wait(retryDelayMs * attempt);
        continue;
      }
      break;
    }
  }

  try {
    totalAttempts += 1;
    const items = await requestRssDirectly(timeoutMs);
    return {
      items,
      attempts: totalAttempts,
      elapsedMs: Date.now() - startedAt,
      url: RULIWEB_MARKET_RSS_URL,
      transport: "direct-rss",
    };
  } catch (error) {
    const details = buildRequestErrorDetails({
      error,
      attempts: totalAttempts,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
      url: RULIWEB_MARKET_RSS_URL,
      transport: "jina-reader-rss -> direct-rss",
    });
    details.error = `Reader RSS failed: ${extractErrorMessage(readerError)}; direct RSS fallback failed: ${details.error}`;
    throw new RuliwebMarketFlyerRequestError(
      details,
      error
    );
  }
}

export async function crawlTodayLargeMartFlyers(
  now = new Date()
): Promise<RuliwebMarketFlyerCrawlResult> {
  const feed = await fetchRuliwebMarketFeed();
  const seenSourceKeys = new Set<string>();
  const posts: RuliwebMarketFlyerPost[] = [];

  feed.items.forEach((item) => {
    if (!isSameSeoulDate(item.publishedAt, now)) {
      return;
    }

    const matchedKeywords = getMatchedFlyerKeywords(item.title);
    if (matchedKeywords.length < 2) {
      return;
    }

    const linkUrl = toAbsoluteRuliwebUrl(item.linkUrl);
    const sourceKey = buildRuliwebSourceKey(linkUrl);
    if (seenSourceKeys.has(sourceKey)) {
      return;
    }

    seenSourceKeys.add(sourceKey);
    posts.push({
      title: item.title,
      linkUrl,
      sourceKey,
      publishedAt: item.publishedAt,
      matchedKeywords,
      timeLabel: item.timeLabel,
    });
  });

  return {
    posts,
    request: {
      attempts: feed.attempts,
      elapsedMs: feed.elapsedMs,
      url: feed.url,
      transport: feed.transport,
    },
  };
}
