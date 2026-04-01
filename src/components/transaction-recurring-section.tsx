"use client";

type TransactionRecurringSectionProps = {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  dayOfMonth: string;
  onDayOfMonthChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  prependMonthToNote: boolean;
  onPrependMonthToNoteChange: (next: boolean) => void;
  disabled?: boolean;
};

function buildSummary(
  dayOfMonth: string,
  startDate: string,
  endDate: string,
  prependMonthToNote: boolean
) {
  if (!dayOfMonth || !startDate) {
    return "자동 등록 설정이 아직 비어 있어요.";
  }
  return `매달 ${dayOfMonth}일 · ${startDate} ~ ${endDate || "계속"}${
    prependMonthToNote ? " · 메모 앞에 월 표시" : ""
  }`;
}

export default function TransactionRecurringSection({
  enabled,
  onEnabledChange,
  dayOfMonth,
  onDayOfMonthChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  prependMonthToNote,
  onPrependMonthToNoteChange,
  disabled = false,
}: TransactionRecurringSectionProps) {
  return (
    <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[color:rgba(45,38,34,0.02)] px-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">추가 기능</p>
        <p className="mt-1 text-xs text-[color:rgba(45,38,34,0.6)]">
          {enabled
            ? buildSummary(dayOfMonth, startDate, endDate, prependMonthToNote)
            : "자동 등록 같은 추가 기능이 꺼져 있어요."}
        </p>
      </div>
      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[var(--border)]"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          매달 자동 내역 등록
        </label>
        <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.6)]">
          설정한 날짜에 같은 내용의 내역을 매달 자동으로 등록합니다.
        </p>
        {enabled ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">
              등록일
              <input
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
                value={dayOfMonth}
                disabled={disabled}
                onChange={(event) => onDayOfMonthChange(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              시작일
              <input
                type="date"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
                value={startDate}
                disabled={disabled}
                onChange={(event) => onStartDateChange(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              종료일
              <input
                type="date"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
                value={endDate}
                disabled={disabled}
                onChange={(event) => onEndDateChange(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        {enabled ? (
          <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.55)]">
            종료일을 비우면 직접 끌 때까지 계속 등록됩니다.
          </p>
        ) : null}
        {enabled ? (
          <label className="mt-4 flex items-start gap-2 text-sm text-[color:rgba(45,38,34,0.8)]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-[var(--border)]"
              checked={prependMonthToNote}
              disabled={disabled}
              onChange={(event) => onPrependMonthToNoteChange(event.target.checked)}
            />
            <span>
              메모 앞에 월 붙이기
              <span className="mt-1 block text-xs text-[color:rgba(45,38,34,0.55)]">
                자동 생성되는 내역 메모를 `4월 경조사비`처럼 저장합니다.
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </div>
  );
}
