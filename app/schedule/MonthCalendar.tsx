"use client";

/**
 * 월별 캘린더 — 스케줄 통합 뷰 상단에 표시
 *
 * - 일자 그리드에 일정 종류별 색상 도트 표시
 * - 클릭하면 해당 날짜로 스크롤/필터
 * - 오늘 표시
 * - 이전·다음 달 이동
 */

import { useMemo, useState } from "react";

export type CalendarSource = "appointment" | "contractDate" | "downPaymentDate" | "balanceDate";

export interface CalendarItem {
  date: string;                          // YYYY-MM-DD
  source: CalendarSource;
}

interface Props {
  items: CalendarItem[];
  onSelectDate: (date: string | null) => void;
  selectedDate: string | null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export const SOURCE_COLORS: Record<CalendarSource, string> = {
  appointment:     "bg-blue-500",
  contractDate:    "bg-purple-500",
  downPaymentDate: "bg-pink-500",
  balanceDate:     "bg-amber-500",
};
export const SOURCE_LABELS: Record<CalendarSource, string> = {
  appointment:     "약속",
  contractDate:    "계약일",
  downPaymentDate: "중도금일",
  balanceDate:     "잔금일",
};
/** 캘린더 셀 안에 표시할 짧은 라벨 — 1글자 (작은 셀에 들어가도록) */
export const SOURCE_SHORT_LABELS: Record<CalendarSource, string> = {
  appointment:     "약",
  contractDate:    "계",
  downPaymentDate: "중",
  balanceDate:     "잔",
};
/** 글자까지 덮는 알약 형태 범례용 — 배경+텍스트+테두리 일체형 */
export const SOURCE_PILL_CLASSES: Record<CalendarSource, string> = {
  appointment:     "bg-blue-100   text-blue-700   border-blue-200",
  contractDate:    "bg-purple-100 text-purple-700 border-purple-200",
  downPaymentDate: "bg-pink-100   text-pink-700   border-pink-200",
  balanceDate:     "bg-amber-100  text-amber-700  border-amber-200",
};
/** 캘린더 셀 안 미니 알약용 — 테두리 없이 배경+텍스트만 (좁은 공간) */
export const SOURCE_CELL_CLASSES: Record<CalendarSource, string> = {
  appointment:     "bg-blue-100   text-blue-700",
  contractDate:    "bg-purple-100 text-purple-700",
  downPaymentDate: "bg-pink-100   text-pink-700",
  balanceDate:     "bg-amber-100  text-amber-700",
};

function pad(n: number): string { return String(n).padStart(2, "0"); }
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function MonthCalendar({ items, onSelectDate, selectedDate }: Props) {
  const today = todayStr();
  const initial = selectedDate || today;
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const d = new Date(initial);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // 해당 월의 그리드 생성 (6주, 42칸)
  const grid = useMemo(() => {
    const firstDay = new Date(cursor.y, cursor.m, 1);
    const startWeekday = firstDay.getDay(); // 0=일
    const lastDate = new Date(cursor.y, cursor.m + 1, 0).getDate();

    const cells: { date: string; inMonth: boolean; day: number }[] = [];

    // 이전 달 마지막 일부
    const prevLastDate = new Date(cursor.y, cursor.m, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const day = prevLastDate - i;
      const m = cursor.m === 0 ? 12 : cursor.m;
      const y = cursor.m === 0 ? cursor.y - 1 : cursor.y;
      cells.push({ date: `${y}-${pad(m)}-${pad(day)}`, inMonth: false, day });
    }
    // 이번 달
    for (let day = 1; day <= lastDate; day++) {
      cells.push({ date: `${cursor.y}-${pad(cursor.m + 1)}-${pad(day)}`, inMonth: true, day });
    }
    // 다음 달
    const remain = 42 - cells.length;
    for (let day = 1; day <= remain; day++) {
      const m = cursor.m === 11 ? 1 : cursor.m + 2;
      const y = cursor.m === 11 ? cursor.y + 1 : cursor.y;
      cells.push({ date: `${y}-${pad(m)}-${pad(day)}`, inMonth: false, day });
    }
    return cells;
  }, [cursor]);

  // 날짜별 소스 카운트
  const dateMap = useMemo(() => {
    const map: Record<string, Partial<Record<CalendarSource, number>> & { total: number }> = {};
    for (const item of items) {
      if (!map[item.date]) map[item.date] = { total: 0 };
      map[item.date][item.source] = (map[item.date][item.source] || 0) + 1;
      map[item.date].total++;
    }
    return map;
  }, [items]);

  const monthCount = useMemo(() => {
    const prefix = `${cursor.y}-${pad(cursor.m + 1)}`;
    return items.filter(i => i.date.startsWith(prefix)).length;
  }, [items, cursor]);

  const prevMonth = () => setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 });
  const nextMonth = () => setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 });
  const goToday = () => {
    const t = new Date();
    setCursor({ y: t.getFullYear(), m: t.getMonth() });
    onSelectDate(todayStr());
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-3 sm:p-4 mb-4">
      {/* 월 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">‹</button>
        <div className="flex flex-col items-center">
          <button onClick={goToday} className="text-base font-bold text-gray-900 hover:text-blue-600 transition-colors">
            {cursor.y}년 {cursor.m + 1}월
          </button>
          <div className="text-[10px] text-gray-500">이번 달 일정 {monthCount}건</div>
        </div>
        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">›</button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`text-center text-[10px] font-semibold py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-0.5">
        {grid.map(({ date, inMonth, day }, idx) => {
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const info = dateMap[date];
          const weekday = idx % 7;

          const baseColor = !inMonth
            ? "text-gray-300"
            : weekday === 0 ? "text-red-500"
            : weekday === 6 ? "text-blue-500"
            : "text-gray-700";

          const cellCls = isSelected
            ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-300"
            : isToday
              ? "bg-blue-50 border border-blue-200"
              : "hover:bg-gray-50 border border-transparent";

          return (
            <button
              key={`${date}-${idx}`}
              onClick={() => onSelectDate(isSelected ? null : date)}
              className={`relative min-h-[3.5rem] rounded-xl flex flex-col items-center justify-start pt-1.5 pb-1 transition-all ${cellCls}`}
              title={info ? `${date} · 일정 ${info.total}건` : date}
            >
              <span className={`text-xs font-semibold ${isSelected ? "text-white" : baseColor}`}>{day}</span>
              {info && (
                <div className="flex flex-col gap-0.5 mt-1 items-stretch w-full px-1">
                  {(Object.keys(SOURCE_COLORS) as CalendarSource[]).map(src => {
                    const cnt = info[src] || 0;
                    if (cnt === 0) return null;
                    return (
                      <span
                        key={src}
                        className={`text-[9px] leading-tight font-semibold px-1 py-0.5 rounded text-center truncate ${
                          isSelected
                            ? "bg-white/30 text-white"
                            : SOURCE_CELL_CLASSES[src]
                        }`}
                        title={`${SOURCE_LABELS[src]} ${cnt}건`}
                      >
                        {SOURCE_LABELS[src]}{cnt > 1 ? ` ${cnt}` : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 범례 + 액션 — 알약 형태로 색상 구분감 강화 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 pt-3 border-t border-gray-100">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {(Object.keys(SOURCE_COLORS) as CalendarSource[]).map(s => (
            <div key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${SOURCE_PILL_CLASSES[s]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${SOURCE_COLORS[s]}`}></span>
              {SOURCE_LABELS[s]}
            </div>
          ))}
        </div>
        <div className="flex-1" />
        {selectedDate && (
          <button onClick={() => onSelectDate(null)} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600">
            전체 보기
          </button>
        )}
        <button onClick={goToday} className="text-[11px] px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 font-medium hover:bg-blue-100">
          오늘
        </button>
      </div>
    </div>
  );
}
