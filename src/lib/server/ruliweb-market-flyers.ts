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

async function requestBoardWithAxios(timeoutMs: number) {
  const response = await axios.get<string>(RULIWEB_MARKET_BOARD_URL, {
    responseType: "text",
    timeout: timeoutMs,
    headers: {
      "user-agent": RULIWEB_MARKET_BOARD_USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  return response.data;
}

async function requestBoardWithFetch(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(RULIWEB_MARKET_BOARD_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": RULIWEB_MARKET_BOARD_USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      const error = new Error(`Fetch failed with status ${response.status}`) as Error & {
        code?: string;
        statusCode?: number;
      };
      error.code = `HTTP_${response.status}`;
      error.statusCode = response.status;
      throw error;
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error(
        `fetch timeout after ${timeoutMs}ms`
      ) as Error & {
        code?: string;
      };
      timeoutError.code = "FETCH_ABORT_TIMEOUT";
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchRuliwebMarketBoardHtml() {
  const timeoutMs = getRequestTimeoutMs();
  const maxAttempts = getRequestMaxAttempts();
  const retryDelayMs = getRetryDelayMs();
  const startedAt = Date.now();
  let totalAttempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    totalAttempts += 1;
    try {
      return await requestBoardWithAxios(timeoutMs);
    } catch (error) {
      const isLastAttempt = attempt >= maxAttempts;
      if (!shouldRetryRequest(error)) {
        throw new RuliwebMarketFlyerRequestError(
          buildRequestErrorDetails({
            error,
            attempts: totalAttempts,
            elapsedMs: Date.now() - startedAt,
            timeoutMs,
            url: RULIWEB_MARKET_BOARD_URL,
            transport: "axios",
          }),
          error
        );
      }

      if (!isLastAttempt) {
        await wait(retryDelayMs * attempt);
        continue;
      }
    }
  }

  try {
    totalAttempts += 1;
    return await requestBoardWithFetch(timeoutMs);
  } catch (error) {
    throw new RuliwebMarketFlyerRequestError(
      buildRequestErrorDetails({
        error,
        attempts: totalAttempts,
        elapsedMs: Date.now() - startedAt,
        timeoutMs,
        url: RULIWEB_MARKET_BOARD_URL,
        transport: "fetch",
      }),
      error
    );
  }

  throw new RuliwebMarketFlyerRequestError(
    {
      error: `Request exhausted without response (attempts=${totalAttempts}, timeoutMs=${timeoutMs})`,
      attempts: totalAttempts,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
      url: RULIWEB_MARKET_BOARD_URL,
      transport: "unknown",
    },
    null
  );
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
  const html = await fetchRuliwebMarketBoardHtml();
  const $ = cheerio.load(html);
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
