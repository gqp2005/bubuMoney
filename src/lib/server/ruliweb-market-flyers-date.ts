import "server-only";

import { toDateKey } from "@/lib/time";

const SEOUL_OFFSET = "+09:00";

function isYearMonthDayLabel(value: string) {
  return /^\d{4}\.\d{2}\.\d{2}$/.test(value);
}

function isHourMinuteLabel(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

export function parseRuliwebBoardDateLabel(value: string, now = new Date()) {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  if (isYearMonthDayLabel(normalizedValue)) {
    const isoDate = normalizedValue.replace(/\./g, "-");
    const parsed = new Date(`${isoDate}T00:00:00${SEOUL_OFFSET}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (isHourMinuteLabel(normalizedValue)) {
    const todayKey = toDateKey(now);
    const parsed = new Date(`${todayKey}T${normalizedValue}:00${SEOUL_OFFSET}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function isSameSeoulDate(left: Date, right: Date) {
  return toDateKey(left) === toDateKey(right);
}
