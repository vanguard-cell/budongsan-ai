"use client";

/**
 * 손님 파이프라인 보드 (Pipedrive식 칸반)
 * - 칼럼 = 거래 단계(문의→연락→보여줌→협상→계약 / 실패)
 * - 카드 = 손님, 드래그로 단계 이동, 카드 클릭 → 우측 패널
 */

import { useState } from "react";
import {
  effectiveStage, STAGE_FLOW, STAGE_META, SIDE_LABELS, followUpDDay, followUpDDayLabel, followUpSeverity,
  type Customer, type CustomerStage,
} from "./customer-types";

const COLUMNS: CustomerStage[] = [...STAGE_FLOW, "lost"];

export default function CustomerBoard({ customers, selectedId, onSelect, onMoveStage }: {
  customers: Customer[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onMoveStage: (c: Customer, stage: CustomerStage) => void;
}) {
  const [dragOver, setDragOver] = useState<CustomerStage | null>(null);
  const byStage = (s: CustomerStage) => customers.filter(c => effectiveStage(c) === s);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {COLUMNS.map(stage => {
          const meta = STAGE_META[stage];
          const list = byStage(stage);
          return (
            <div
              key={stage}
              onDragOver={e => { e.preventDefault(); setDragOver(stage); }}
              onDragLeave={() => setDragOver(d => d === stage ? null : d)}
              onDrop={e => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setDragOver(null);
                const c = customers.find(x => x.id === id);
                if (c && effectiveStage(c) !== stage) onMoveStage(c, stage);
              }}
              className={`w-[210px] shrink-0 rounded-2xl p-2 transition-colors ${dragOver === stage ? "bg-blue-50 ring-2 ring-blue-300" : "bg-gray-50/70 dark:bg-slate-800/40"}`}
            >
              <div className="flex items-center gap-1.5 px-1.5 py-1 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: meta.fg }} />
                <span className="text-xs font-bold" style={{ color: meta.fg }}>{meta.label}</span>
                <span className="text-gray-400 text-xs font-medium">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map(c => {
                  const dd = c.nextFollowUp ? followUpDDay(c.nextFollowUp) : null;
                  const sev = dd !== null ? followUpSeverity(dd) : "none";
                  const urgent = sev === "overdue" || sev === "today";
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; }}
                      onClick={() => onSelect(c.id)}
                      className={`bg-white dark:bg-slate-900 rounded-xl border p-2.5 cursor-pointer hover:shadow-sm transition-all ${selectedId === c.id ? "border-blue-400 ring-1 ring-blue-300" : "border-gray-200 dark:border-slate-700 hover:border-blue-300"}`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">{c.name || "(이름없음)"}</span>
                        {c.vip && <span className="text-amber-400 text-xs">★</span>}
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-500 shrink-0">{SIDE_LABELS[c.side]}</span>
                      </div>
                      {c.budget && <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">💰 {c.budget}</div>}
                      {c.preferredArea && <div className="text-[11px] text-gray-400 truncate">📍 {c.preferredArea}</div>}
                      <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                        {c.shownProperties.length > 0 && <span className="text-emerald-600">👁 {c.shownProperties.length}</span>}
                        {dd !== null && (
                          <span className={`ml-auto font-medium ${urgent ? "text-red-500" : "text-gray-400"}`}>연락 {followUpDDayLabel(dd)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div className="text-center text-[11px] text-gray-300 dark:text-gray-600 py-3">여기로 끌어 옮기기</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
