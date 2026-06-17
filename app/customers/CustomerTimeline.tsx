"use client";

/**
 * 손님 가로 타임라인 뷰 (Pipedrive 연락처 타임라인 톤)
 * - 행 = 손님, 가로축 = 시간(월), 점 = 활동(보여준 매물·전화·포기·상태 등)
 * - 행/점 클릭 → 우측 패널 열기
 */

import { mergedCustomerTimeline, eventVisual, type Customer } from "./customer-types";

const LEGEND: { v: ReturnType<typeof eventVisual> }[] = [
  { v: eventVisual({ kind: "shown", reaction: "positive" }) },
  { v: eventVisual({ kind: "shown", reaction: "negative" }) },
  { v: eventVisual({ kind: "call" }) },
  { v: eventVisual({ kind: "visit" }) },
  { v: eventVisual({ kind: "drop" }) },
  { v: eventVisual({ kind: "status" }) },
];

function fmtFull(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function CustomerTimeline({ customers, selectedId, onSelect }: {
  customers: Customer[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const now = Date.now();
  const MONTH = 30 * 86400000;
  const rows = customers.map(c => ({ c, evs: mergedCustomerTimeline(c) }));

  // 시간 창 계산 — 이벤트 최소/최대 + 오늘 포함, 너무 옛날은 6개월로 컷
  let minAt = now, maxAt = now;
  for (const { evs } of rows) for (const e of evs) { if (e.at < minAt) minAt = e.at; if (e.at > maxAt) maxAt = e.at; }
  let startMs = Math.min(minAt, now - 2 * MONTH);
  if (startMs < now - 6 * MONTH) startMs = now - 6 * MONTH;
  const endMs = Math.max(maxAt, now + MONTH / 2);

  const startD = new Date(startMs); startD.setDate(1); startD.setHours(0, 0, 0, 0);
  const endD = new Date(endMs); endD.setMonth(endD.getMonth() + 1, 1); endD.setHours(0, 0, 0, 0);
  const s = startD.getTime();
  const span = Math.max(1, endD.getTime() - s);
  const pct = (at: number) => Math.min(99, Math.max(1, ((at - s) / span) * 100));

  const months: { label: string; left: number }[] = [];
  const it = new Date(startD);
  while (it.getTime() < endD.getTime()) {
    months.push({ label: `${it.getMonth() + 1}월`, left: ((it.getTime() - s) / span) * 100 });
    it.setMonth(it.getMonth() + 1);
  }
  const todayLeft = pct(now);

  return (
    <div className="border border-gray-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
      {/* 헤더 — 월 눈금 */}
      <div className="flex items-stretch bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700">
        <div className="w-[120px] sm:w-[150px] shrink-0 px-3 py-2 text-[11px] font-semibold text-gray-500">손님</div>
        <div className="relative flex-1 h-8">
          {months.map((m, i) => (
            <span key={i} className="absolute top-2 text-[10.5px] text-gray-400" style={{ left: `${m.left}%` }}>{m.label}</span>
          ))}
          <span className="absolute -top-0.5 text-[10px] font-bold text-red-500" style={{ left: `${todayLeft}%`, transform: "translateX(-50%)" }}>오늘</span>
        </div>
      </div>

      {/* 행 — 손님별 */}
      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {rows.map(({ c, evs }) => (
          <div key={c.id} onClick={() => onSelect(c.id)}
            className={`flex items-stretch cursor-pointer transition-colors ${selectedId === c.id ? "bg-[var(--tint-blue-bg)]" : "hover:bg-gray-50 dark:hover:bg-slate-800/40"}`}>
            <div className="w-[120px] sm:w-[150px] shrink-0 px-3 py-3 min-w-0">
              <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                {c.name || "(이름없음)"}{c.vip && <span className="text-amber-400 ml-0.5">★</span>}
              </div>
              <div className="text-[10.5px] text-gray-400 truncate">{evs.length}개 활동</div>
            </div>
            <div className="relative flex-1 min-h-[52px]">
              {/* 기준선 */}
              <div className="absolute left-[1%] right-[1%] top-1/2 h-px bg-gray-200 dark:bg-slate-700" />
              {/* 오늘 선 */}
              <div className="absolute top-1 bottom-1 border-l border-dashed border-red-300" style={{ left: `${todayLeft}%` }} />
              {/* 이벤트 점 */}
              {evs.map((e, i) => {
                const d = eventVisual(e);
                return (
                  <span key={i}
                    title={`${fmtFull(e.at)} · ${e.text}`}
                    onClick={ev => { ev.stopPropagation(); onSelect(c.id); }}
                    className="absolute top-1/2 w-[18px] h-[18px] rounded-full flex items-center justify-center -translate-y-1/2 -translate-x-1/2 ring-2 ring-white dark:ring-slate-900"
                    style={{ left: `${pct(e.at)}%`, background: d.bg }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 11, color: d.fg }}>{d.icon}</span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-3 py-2.5 border-t border-gray-100 dark:border-slate-800 text-[11px] text-gray-500">
        {LEGEND.map((l, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center" style={{ background: l.v.bg }}>
              <span className="material-symbols-outlined" style={{ fontSize: 9, color: l.v.fg }}>{l.v.icon}</span>
            </span>
            {l.v.label}
          </span>
        ))}
      </div>
    </div>
  );
}
