import "server-only";

export const RULIWEB_MARKET_BOARD_URL = "https://bbs.ruliweb.com/market/board/1020";
export const RULIWEB_MARKET_BOARD_USER_AGENT =
  "couple-ledger-ruliweb-bot/2.0 (+https://bbs.ruliweb.com/market/board/1020)";

export const RULIWEB_MARKET_FLYER_KEYWORDS = [
  "대형마트",
  "전단",
  "홈플러스",
  "이마트",
  "롯데마트",
  "행사",
] as const;

export const RULIWEB_MARKET_BOARD_SELECTORS = {
  row: ".board_list_table tr.table_body.blocktarget",
  titleLink: "td.subject a.subject_link",
  timeCell: "td.time",
  replyCount: ".num_reply",
  inlineIcons: "i",
} as const;
