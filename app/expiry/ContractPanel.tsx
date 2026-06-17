"use client";

/**
 * 만기(계약) 우측 패널 — 표/카드 행 클릭 시 상세 (노션식 사이드 보기)
 * - SideDrawer 재사용 / 임대인·임차인 전화·문자 칩 + 수정·문자·종료·재모집 액션
 */

import { type Contract, type ContactTarget, dDay, dDayLabel, severityOf, formatPhone } from "./contracts";
import SideDrawer from "@/app/components/SideDrawer";

function num(s: string) { if (!s) return s; const n = parseInt(s.replace(/[^\d]/g, ""), 10); return isNaN(n) ? s : n.toLocaleString(); }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="text-gray-400 dark:text-gray-500 py-1 pr-3 align-top whitespace-nowrap w-16">{label}</td>
      <td className="text-gray-800 dark:text-gray-200 py-1 break-all">{children}</td>
    </tr>
  );
}

function Chip({ role, name, phone, kind, onSms }: { role: string; name?: string; phone?: string; kind: "owner" | "tenant"; onSms: () => void }) {
  if (!phone) return null;
  const style = kind === "owner"
    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
    : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100";
  const label = name ? `${role} ${name}` : role;
  return (
    <span className="inline-flex items-center rounded-full overflow-hidden border border-gray-200 dark:border-slate-600">
      <a href={`tel:${phone}`} title={`${label} 전화`} className={`inline-flex items-center gap-1 pl-2 pr-1.5 py-1 text-[11px] font-bold transition-colors ${style}`}>
        <span className="material-symbols-outlined text-[13px]">call</span>
        <span className="whitespace-nowrap">{label}</span>
      </a>
      <button onClick={onSms} title={`${label}에게 문자 양식`} className={`inline-flex items-center px-1.5 py-1 transition-colors border-l border-gray-200 dark:border-slate-600 ${style}`}>
        <span className="material-symbols-outlined text-[13px]">sms</span>
      </button>
    </span>
  );
}

function ActionBtn({ icon, label, onClick, primary }: { icon: string; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-bold transition-all active:scale-95 ${
        primary ? "bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue-dark)]"
        : "border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
      <span className={`material-symbols-outlined text-[15px] leading-none ${primary ? "" : "text-[var(--brand-blue)] dark:text-blue-400"}`}>{icon}</span>
      {label}
    </button>
  );
}

interface Props {
  contract: Contract | null;
  onClose: () => void;
  onEdit: (c: Contract) => void;
  onSms: (c: Contract, target: ContactTarget) => void;
  onCloneSameComplex: (c: Contract) => void;
  onReopenAsProperty: (c: Contract) => void;
  onCloseContract: (c: Contract) => void;
  onRenew: (c: Contract) => void;
  onJumpCustomer?: (c: Contract) => void;
}

export default function ContractPanel({ contract: c, onClose, onEdit, onSms, onCloneSameComplex, onReopenAsProperty, onCloseContract, onRenew, onJumpCustomer }: Props) {
  if (!c) return null;
  const dd = c.endDate ? dDay(c.endDate) : null;
  const sev = dd !== null ? severityOf(dd) : "safe";
  const accent = sev === "danger" ? "#E24B4A" : sev === "warning" ? "#EF9F27" : sev === "caution" ? "#1D9E75" : "#888780";
  const address = [c.address, c.dong && `${c.dong}동`, c.ho && `${c.ho}호`].filter(Boolean).join(" ");
  const price = c.type === "월세" ? `${num(c.deposit)}/${num(c.monthly)}만` : `${num(c.deposit)}만`;

  return (
    <SideDrawer open onClose={onClose} title="계약 상세" icon="event_busy" accent={accent}>
      <div className="px-1">
        <p className="font-bold text-[15px] text-gray-900 dark:text-gray-100 leading-snug break-all">{address}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">{c.type} {price}</span>
          {dd !== null && (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold text-white" style={{ backgroundColor: accent }}>{dDayLabel(dd)}</span>
          )}
        </div>
      </div>

      <div className="px-1 mt-1">
        <table className="w-full text-[12px]">
          <tbody>
            {(c.propertyType || c.area) && <Row label="유형">{[c.propertyType, c.area && `${c.area}㎡`, c.unitType && `(${c.unitType})`, c.rooms && `방${c.rooms}`, c.direction].filter(Boolean).join(" · ")}</Row>}
            {c.startDate && <Row label="시작일">{c.startDate}</Row>}
            {c.endDate && <Row label="만기일">{c.endDate}</Row>}
            {c.memo && <Row label="메모">{c.memo}</Row>}
          </tbody>
        </table>
      </div>

      {(c.landlordPhone || c.tenantPhone) && (
        <div className="px-1 flex flex-wrap gap-1.5 mt-1">
          <Chip role="임대인" name={c.landlordName} phone={c.landlordPhone} kind="owner" onSms={() => onSms(c, "landlord")} />
          <Chip role="임차인" name={c.tenantName} phone={c.tenantPhone} kind="tenant" onSms={() => onSms(c, "tenant")} />
        </div>
      )}
      {(c.landlordPhone || c.tenantPhone) && (
        <p className="px-1 text-[10px] text-gray-400 dark:text-gray-500">
          {[c.landlordPhone && `임대인 ${formatPhone(c.landlordPhone)}`, c.tenantPhone && `임차인 ${formatPhone(c.tenantPhone)}`].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="px-1 mt-2">
        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5">작업</p>
        {/* 재계약(연장) — 같은 임차인 연장. 만기 도래 시 핵심 액션 */}
        <button onClick={() => onRenew(c)}
          className="w-full mb-1.5 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all active:scale-95">
          <span className="material-symbols-outlined text-[16px]">autorenew</span>재계약(연장)
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <ActionBtn icon="edit" label="수정" onClick={() => onEdit(c)} />
          <ActionBtn icon="content_copy" label="같은 단지 추가" onClick={() => onCloneSameComplex(c)} />
          <ActionBtn icon="campaign" label="매물로 재모집" onClick={() => onReopenAsProperty(c)} />
          <ActionBtn icon="inventory_2" label="관리 종료(보관)" onClick={() => onCloseContract(c)} />
        </div>
        {onJumpCustomer && (
          <button onClick={() => onJumpCustomer(c)}
            className="w-full mt-1.5 py-2 rounded-lg text-[11px] font-semibold text-[var(--brand-blue)] dark:text-blue-400 hover:bg-[var(--tint-blue-bg)] transition-colors flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[14px]">person</span>연결된 손님 보기
          </button>
        )}
      </div>
    </SideDrawer>
  );
}
