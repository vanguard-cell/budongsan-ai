"use client";

/**
 * 손님 우측 패널 — 표/카드에서 행 클릭 시 상세 (노션식 사이드 보기)
 * - SideDrawer 재사용 / 전화·문자 칩 + 수정 + 상태 빠른 변경
 */

import { useState } from "react";
import { type Customer, type CustomerStatus, type CustomerEvent, SIDE_LABELS, DEAL_KIND_LABELS, STATUS_LABELS, followUpDDay, followUpDDayLabel, followUpSeverity, formatPhone, mergedCustomerTimeline } from "./customer-types";
import SideDrawer from "@/app/components/SideDrawer";

const STATUS_ACCENT: Record<CustomerStatus, string> = {
  active: "#2383E2", matched: "#EF9F27", closed: "#1D9E75", lost: "#888780",
};

const EVENT_DOT: Record<CustomerEvent["kind"], string> = {
  create: "bg-gray-400", shown: "bg-emerald-500", call: "bg-blue-400", sms: "bg-blue-400",
  visit: "bg-purple-500", status: "bg-amber-500", drop: "bg-red-500", note: "bg-blue-400", followup: "bg-indigo-400",
};
function fmtEventTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="text-gray-400 dark:text-gray-500 py-1 pr-3 align-top whitespace-nowrap w-16">{label}</td>
      <td className="text-gray-800 dark:text-gray-200 py-1 break-all">{children}</td>
    </tr>
  );
}

function ActionBtn({ icon, label, onClick, primary, active }: { icon: string; label: string; onClick: () => void; primary?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-bold transition-all active:scale-95 ${
        primary ? "bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue-dark)]"
        : active ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border border-[var(--brand-blue)]"
        : "border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
      <span className={`material-symbols-outlined text-[15px] leading-none ${primary || active ? "" : "text-[var(--brand-blue)] dark:text-blue-400"}`}>{icon}</span>
      {label}
    </button>
  );
}

interface Props {
  customer: Customer | null;
  onClose: () => void;
  onEdit: (c: Customer) => void;
  onChangeStatus: (c: Customer, status: CustomerStatus) => void;
  onAddEvent: (c: Customer, ev: Omit<CustomerEvent, "at" | "by">) => Promise<void>;
}

export default function CustomerPanel({ customer: c, onClose, onEdit, onChangeStatus, onAddEvent }: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  if (!c) return null;
  const accent = STATUS_ACCENT[c.status];
  const dd = c.nextFollowUp ? followUpDDay(c.nextFollowUp) : null;
  const sev = dd !== null ? followUpSeverity(dd) : "none";
  const timeline = mergedCustomerTimeline(c);
  const quickLog = async (ev: Omit<CustomerEvent, "at" | "by">) => {
    if (saving) return;
    setSaving(true);
    try { await onAddEvent(c, ev); } finally { setSaving(false); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await quickLog({ kind: "note", text: note.trim() });
    setNote("");
  };

  return (
    <SideDrawer open onClose={onClose} title="손님 상세" icon="group" accent={accent}>
      {/* 이름 + 배지 */}
      <div className="px-1">
        <p className="font-bold text-[15px] text-gray-900 dark:text-gray-100 leading-snug break-all">
          {c.name || "(이름없음)"}
          {c.vip && <span className="text-amber-400 ml-1">★</span>}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">{SIDE_LABELS[c.side]}</span>
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">{DEAL_KIND_LABELS[c.dealKind]}</span>
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold text-white" style={{ backgroundColor: accent }}>{STATUS_LABELS[c.status]}</span>
          {dd !== null && (sev === "overdue" || sev === "today" || sev === "soon") && (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--tint-red-bg)] text-[var(--tint-red-tx)] border border-[var(--tint-red-bd)]">
              연락 {followUpDDayLabel(dd)}
            </span>
          )}
        </div>
      </div>

      {/* 정보 */}
      <div className="px-1 mt-1">
        <table className="w-full text-[12px]">
          <tbody>
            {c.nextFollowUp && <Row label="다음 연락">{c.nextFollowUp} ({followUpDDayLabel(followUpDDay(c.nextFollowUp))})</Row>}
            {c.budget && <Row label="예산">{c.budget}</Row>}
            {c.preferredArea && <Row label="희망지역">{c.preferredArea}</Row>}
            {c.moveInDate && <Row label="입주가능">{c.moveInDate}</Row>}
            {c.shownProperties.length > 0 && <Row label="보여준 매물">{c.shownProperties.length}건</Row>}
            {c.memo && <Row label="메모">{c.memo}</Row>}
          </tbody>
        </table>
      </div>

      {/* 연락 칩 */}
      {c.phone && (
        <div className="px-1 mt-1">
          <span className="inline-flex items-center rounded-full overflow-hidden border border-gray-200 dark:border-slate-600">
            <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 pl-2 pr-1.5 py-1 text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100">
              <span className="material-symbols-outlined text-[13px]">call</span>{c.name || "전화"}
            </a>
            <a href={`sms:${c.phone}`} className="inline-flex items-center px-1.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 border-l border-gray-200 dark:border-slate-600">
              <span className="material-symbols-outlined text-[13px]">sms</span>
            </a>
          </span>
          <span className="ml-2 text-[10px] text-gray-400">{formatPhone(c.phone)}</span>
        </div>
      )}

      {/* 작업 */}
      <div className="px-1 mt-2">
        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5">작업</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ActionBtn icon="edit" label="수정" onClick={() => onEdit(c)} primary />
          <ActionBtn icon="hourglass_top" label="진행 중" onClick={() => onChangeStatus(c, "active")} active={c.status === "active"} />
          <ActionBtn icon="handshake" label="매칭" onClick={() => onChangeStatus(c, "matched")} active={c.status === "matched"} />
          <ActionBtn icon="task_alt" label="거래 완료" onClick={() => onChangeStatus(c, "closed")} active={c.status === "closed"} />
        </div>
        <button onClick={() => onChangeStatus(c, "lost")}
          className={`w-full mt-1.5 py-2 rounded-lg text-[11px] font-semibold transition-colors ${c.status === "lost" ? "bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300" : "text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"}`}>
          이탈 처리
        </button>
      </div>

      {/* 여정 타임라인 */}
      <div className="px-1 mt-4">
        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-2">여정 타임라인</p>

        {/* 빠른 기록 */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <QuickChip icon="call" label="전화함" onClick={() => quickLog({ kind: "call", text: "전화 상담" })} disabled={saving} />
          <QuickChip icon="sms" label="문자함" onClick={() => quickLog({ kind: "sms", text: "문자 발송" })} disabled={saving} />
          <QuickChip icon="directions_walk" label="집보기" onClick={() => quickLog({ kind: "visit", text: "집보기 동행" })} disabled={saving} />
          <QuickChip icon="cancel" label="포기" onClick={() => { const r = prompt("포기 사유 (선택)"); if (r === null) return; quickLog({ kind: "drop", text: r.trim() ? `포기 — ${r.trim()}` : "포기" }); }} disabled={saving} />
        </div>
        <div className="flex items-center gap-1.5 mb-3">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addNote(); }}
            placeholder="활동 메모 추가 (예: 가격 재협의 의사)"
            className="flex-1 min-w-0 border border-gray-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-[12px] bg-gray-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]"
          />
          <button onClick={addNote} disabled={!note.trim() || saving}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--brand-blue)] text-white text-[12px] font-bold disabled:opacity-40 hover:bg-[var(--brand-blue-dark)]">기록</button>
        </div>

        {timeline.length === 0 ? (
          <p className="text-[11px] text-gray-400 dark:text-gray-500">아직 기록된 이력이 없습니다.</p>
        ) : (
          <div className="relative pl-4">
            <div className="absolute left-[4px] top-1.5 bottom-1.5 w-px bg-gray-200 dark:bg-slate-700" />
            {timeline.map((e, i) => (
              <div key={i} className="relative mb-3 last:mb-0">
                <span className={`absolute -left-4 top-1 w-2 h-2 rounded-full ${EVENT_DOT[e.kind]}`} />
                <div className="text-[12px] text-gray-800 dark:text-gray-200 leading-snug">
                  {e.text}
                  {e.kind === "followup" && <span className="ml-1 text-[10px] text-indigo-500">예정</span>}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500">{fmtEventTime(e.at)}{e.by ? ` · ${e.by}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SideDrawer>
  );
}

function QuickChip({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
      <span className="material-symbols-outlined text-[14px]">{icon}</span>{label}
    </button>
  );
}
