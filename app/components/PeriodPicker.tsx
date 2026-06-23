"use client";

/**
 * 공용 기간 선택기 — [월별 / 년도별] 토글 + 데이터 있는 기간 칩
 * 매출·인사이트에서 공유. 선택하면 부모가 아래 내용을 그 기간으로 재계산.
 */

export type PeriodMode = "month" | "year";
export interface Period { mode: PeriodMode; key: string } // key: "2026-06"(월) / "2026"(년)

/** "2026-06" → "26.6월" / "2026" → "2026년" */
export function periodLabel(p: Period): string {
  if (p.mode === "year") return `${p.key}년`;
  const [y, m] = p.key.split("-");
  return `${y.slice(2)}.${parseInt(m, 10)}월`;
}

export default function PeriodPicker({
  months, value, onChange, accent = "#7C5CFC",
}: {
  months: string[];               // 데이터 있는 "YYYY-MM" 목록
  value: Period;
  onChange: (p: Period) => void;
  accent?: string;
}) {
  const monthList = [...new Set(months)].sort().reverse();
  const yearList = [...new Set(months.map(m => m.slice(0, 4)))].sort().reverse();
  const list = value.mode === "year" ? yearList : monthList;

  const setMode = (mode: PeriodMode) => {
    if (mode === value.mode) return;
    const next = (mode === "year" ? yearList : monthList)[0] || "";
    onChange({ mode, key: next });
  };

  const chipLabel = (key: string) =>
    value.mode === "year" ? `${key}년` : `${parseInt(key.slice(5), 10)}월`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 월/년 토글 */}
      <div className="inline-flex rounded-lg border border-[var(--sidebar-bd)] overflow-hidden text-xs font-bold shrink-0">
        {(["month", "year"] as PeriodMode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-3 py-1.5 transition-colors ${value.mode === m ? "text-white" : "bg-white dark:bg-slate-900 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"}`}
            style={value.mode === m ? { background: accent } : undefined}>
            {m === "month" ? "월별" : "년도별"}
          </button>
        ))}
      </div>
      {/* 기간 칩 (가로 스크롤) */}
      <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 pb-0.5">
        {list.length === 0 && <span className="text-[11px] text-gray-400">데이터 없음</span>}
        {list.map(key => {
          const active = value.key === key;
          return (
            <button key={key} onClick={() => onChange({ mode: value.mode, key })}
              className={`px-2.5 py-1 rounded-full text-[12px] font-semibold whitespace-nowrap transition-colors ${active ? "text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700"}`}
              style={active ? { background: accent } : undefined}>
              {chipLabel(key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
