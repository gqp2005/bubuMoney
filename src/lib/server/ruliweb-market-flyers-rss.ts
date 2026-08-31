import * as cheerio from "cheerio";

export type RuliwebMarketRssItem = {
  title: string;
  linkUrl: string;
  publishedAt: Date;
  timeLabel: string;
};

const RULIWEB_POST_URL_PATTERN =
  /^https?:\/\/bbs\.ruliweb\.com\/market\/board\/1020\/read\/\d+\/?(?:\?.*)?$/;
const READER_HEADING_PATTERN =
  /^### \[(.*)\]\((https?:\/\/bbs\.ruliweb\.com\/market\/board\/1020\/read\/\d+\/?(?:\?.*)?)\)$/;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeReaderTitle(value: string) {
  return normalizeWhitespace(
    value.replace(/\\([\\`*_[\]{}()#+.!|>-])/g, "$1")
  );
}

function toRssItem(params: {
  title: string;
  linkUrl: string;
  timeLabel: string;
}) {
  const title = normalizeWhitespace(params.title);
  const linkUrl = params.linkUrl.trim();
  const timeLabel = normalizeWhitespace(params.timeLabel);
  const publishedAt = new Date(timeLabel);

  if (
    !title ||
    !RULIWEB_POST_URL_PATTERN.test(linkUrl) ||
    !timeLabel ||
    !Number.isFinite(publishedAt.getTime())
  ) {
    return null;
  }

  return {
    title,
    linkUrl,
    publishedAt,
    timeLabel,
  } satisfies RuliwebMarketRssItem;
}

export function parseRuliwebRssXml(xml: string) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: RuliwebMarketRssItem[] = [];

  $("item").each((_, element) => {
    const item = toRssItem({
      title: $(element).find("title").first().text(),
      linkUrl: $(element).find("link").first().text(),
      timeLabel: $(element).find("pubDate").first().text(),
    });
    if (item) {
      items.push(item);
    }
  });

  return items;
}

export function parseRuliwebReaderRssMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const items: RuliwebMarketRssItem[] = [];
  const seenUrls = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].trim().match(READER_HEADING_PATTERN);
    if (!heading) {
      continue;
    }

    const title = normalizeReaderTitle(heading[1]);
    const linkUrl = heading[2];
    if (seenUrls.has(linkUrl)) {
      continue;
    }

    let timeLabel = "";
    for (
      let candidateIndex = index + 1;
      candidateIndex < Math.min(index + 8, lines.length);
      candidateIndex += 1
    ) {
      const candidate = lines[candidateIndex].trim();
      if (candidate && Number.isFinite(new Date(candidate).getTime())) {
        timeLabel = candidate;
        break;
      }
    }

    const item = toRssItem({ title, linkUrl, timeLabel });
    if (item) {
      seenUrls.add(linkUrl);
      items.push(item);
    }
  }

  return items;
}
