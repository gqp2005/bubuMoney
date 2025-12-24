import { formatInTimeZone } from "date-fns-tz";

export const SEOUL_TZ = "Asia/Seoul";

export function toMonthKey(date: Date) {
  return formatInTimeZone(date, SEOUL_TZ, "yyyy-MM");
}

export function toDateKey(date: Date) {
  return formatInTimeZone(date, SEOUL_TZ, "yyyy-MM-dd");
}

export function formatDate(date: Date, pattern = "yyyy.MM.dd") {
  return formatInTimeZone(date, SEOUL_TZ, pattern);
}
