"use client";

/**
 * 손님 우측 패널 — 표/카드에서 행 클릭 시 상세 (노션식 사이드 보기)
 * - SideDrawer 재사용 / 전화·문자 칩 + 수정 + 상태 빠른 변경
 */

import { type Customer, type CustomerStatus, SIDE_LABELS, DEAL_KIND_LABELS, STATUS_LABELS, followUpDDay, followUpDDayLabel, followUpSeverity, formatPhone } from "./customer-types";
import SideDrawer from "@/app/components/SideDrawer";

const STATUS_ACCENT: Record<CustomerStatus, string> = {
  active: "#2383E2", matched: "#EF9F27", closed: "#1D9E75", lost: "#888780",
};

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
}

export default function CustomerPanel({ customer: c, onClose, onEdit, onChangeStatus }: Props) {
  if (!c) return null;
  const accent = STATUS_ACCENT[c.status];
  const dd = c.nextFollowUp ? followUpDDay(c.nextFollowUp) : null;
  const sev = dd !== null ? followUpSeverity(dd) : "none";

  return (
    <SideDrawer open onClose={onClose} title="손님 상세" icon="group" accent={accent}>
      {/* 이름 + 배지 */}
      <div className="px-1">
        <p className="font-bold text-[15px] text-gray-900 dark:text-gray-100 leading-snug break-all">
          {c.vip && <span className="text-amber-400 mr-1">★</span>}
          {c.name || "(이름없음)"}
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
    </SideDrawer>
  );
}
