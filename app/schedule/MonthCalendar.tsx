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

export interface CalendarItem {
  date: string;                          // YYYY-MM-DD
  source: "schedule" | "expiry" | "followup";
}

interface Props {
  items: CalendarItem[];
  onSelectDate: (date: string | null) => void;
  selectedDate: string | null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const SOURCE_COLORS = {
  schedule: "bg-blue-500",
  expiry:   "bg-orange-500",
  followup: "bg-purple-500",
};
const SOURCE_LABELS = {
  schedule: "약속",
  expiry:   "만기",
  followup: "후속",
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
    const map: Record<string, { schedule: number; expiry: number; followup: number; total: number }> = {};
    for (const item of items) {
      if (!map[item.date]) map[item.date] = { schedule: 0, expiry: 0, followup: 0, total: 0 };
      map[item.date][item.source]++;
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
              className={`relative aspect-square rounded-xl flex flex-col items-center justify-start pt-1.5 transition-all ${cellCls}`}
              title={info ? `${date} · 일정 ${info.total}건` : date}
            >
              <span className={`text-xs font-semibold ${isSelected ? "text-white" : baseColor}`}>{day}</span>
              {info && (
                <div className="flex gap-0.5 mt-0.5">
                  {info.schedule > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : SOURCE_COLORS.schedule}`}></span>}
                  {info.expiry > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : SOURCE_COLORS.expiry}`}></span>}
                  {info.followup > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : SOURCE_COLORS.followup}`}></span>}
                </div>
              )}
              {info && info.total > 1 && (
                <span className={`absolute bottom-1 text-[8px] font-bold ${isSelected ? "text-white" : "text-gray-500"}`}>
                  {info.total}건
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 범례 + 액션 */}
      <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-3 text-[11px]">
          {(["schedule", "expiry", "followup"] as const).map(s => (
            <div key={s} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${SOURCE_COLORS[s]}`}></span>
              <span className="text-gray-600">{SOURCE_LABELS[s]}</span>
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
