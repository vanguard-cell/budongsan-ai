"use client";

/**
 * 매물 우측 패널 — 표/카드에서 행 클릭 시 상세 (노션식 사이드 보기)
 *
 * - SideDrawer 재사용: PC=우측 패널(넓으면 push), 폰=바텀시트
 * - 내용: 거래·단계 배지 + 핵심 정보 표 + 집주인/임차인 전화·문자 칩 + 작업 버튼 4종
 * - 수정은 폼이 길어서 기존 모달을 띄움 (패널 = 보기·빠른 액션 전용)
 */

import type { Property } from "@/lib/properties-db";
import SideDrawer from "@/app/components/SideDrawer";
import { fmtNum, formatPhone } from "./helpers";
import { stageOf } from "./PropertyTable";
import { dDay } from "@/app/expiry/contracts";

const STAGE_ACCENT: Record<string, string> = {
  "미계약": "#1D9E75",
  "계약 진행": "#2383E2",
  "잔금 지남": "#E24B4A",
  "거래완료": "#888780",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="text-gray-400 dark:text-gray-500 py-1 pr-3 align-top whitespace-nowrap w-16">{label}</td>
      <td className="text-gray-800 dark:text-gray-200 py-1 break-all">{children}</td>
    </tr>
  );
}

/* 전화 + 문자 칩 (홈 패널과 동일 규칙: 집주인=주황 / 임차인=파랑) */
function ContactChip({ role, name, phone, kind }: { role: string; name?: string; phone?: string; kind: "owner" | "tenant" }) {
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
      <a href={`sms:${phone}`} title={`${label}에게 문자`} className={`inline-flex items-center px-1.5 py-1 transition-colors border-l border-gray-200 dark:border-slate-600 ${style}`}>
        <span className="material-symbols-outlined text-[13px]">sms</span>
      </a>
    </span>
  );
}

function ActionBtn({ icon, label, onClick, primary }: { icon: string; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-bold transition-all active:scale-95 ${
        primary
          ? "bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue-dark)]"
          : "border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"
      }`}
    >
      <span className={`material-symbols-outlined text-[15px] leading-none ${primary ? "" : "text-[var(--brand-blue)] dark:text-blue-400"}`}>{icon}</span>
      {label}
    </button>
  );
}

interface Props {
  property: Property | null;
  onClose: () => void;
  onEdit: (p: Property) => void;
  onCloneSameComplex: (p: Property) => void;
  onProgress: (p: Property) => void;
  onComplete: (p: Property) => void;
}

export default function PropertyPanel({ property: p, onClose, onEdit, onCloneSameComplex, onProgress, onComplete }: Props) {
  if (!p) return null;
  const stage = stageOf(p);
  const accent = STAGE_ACCENT[stage.label] || "#2383E2";
  const address = [p.address, p.dong && `${p.dong}동`, p.ho && `${p.ho}호`].filter(Boolean).join(" ");
  const price = p.dealType === "월세" ? `${fmtNum(p.price)}/${fmtNum(p.monthly)}만` : `${fmtNum(p.price)}만`;
  const leaseDd = p.leaseEndDate ? dDay(p.leaseEndDate) : null;

  return (
    <SideDrawer open onClose={onClose} title="매물 상세" icon="domain" accent={accent}>
      {/* 주소 + 배지 */}
      <div className="px-1">
        <p className="font-bold text-[15px] text-gray-900 dark:text-gray-100 leading-snug break-all">{address}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${stage.cls}`}>{stage.label}</span>
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">
            {p.dealType} {price}
          </span>
          {leaseDd !== null && leaseDd <= 30 && (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--tint-red-bg)] text-[var(--tint-red-tx)] border border-[var(--tint-red-bd)]">
              만기 {leaseDd < 0 ? `${-leaseDd}일 지남` : `D-${leaseDd}`}
            </span>
          )}
        </div>
      </div>

      {/* 핵심 정보 */}
      <div className="px-1 mt-1">
        <table className="w-full text-[12px]">
          <tbody>
            <Row label="유형">{[p.propertyType, p.area && `${p.area}㎡`, p.unitType && `(${p.unitType})`, p.rooms && `방${p.rooms}`, p.direction].filter(Boolean).join(" · ") || "—"}</Row>
            {p.contractDate && <Row label="계약일">{p.contractDate.slice(0, 10)}</Row>}
            {p.downPaymentDate && <Row label="중도금">{p.downPaymentDate}</Row>}
            {p.balanceDate && <Row label="잔금일">{p.balanceDate}</Row>}
            {p.leaseEndDate && <Row label="만기일">{p.leaseEndDate}</Row>}
            {p.ownerName && !p.ownerPhone && <Row label="집주인">{p.ownerName}</Row>}
            {p.tenantName && !p.tenantPhone && <Row label="임차인">{p.tenantName}</Row>}
            {(p.tenantDeposit || p.tenantMonthly) && (
              <Row label="현임차">{[p.tenantDeposit && `보증금 ${fmtNum(p.tenantDeposit)}만`, p.tenantMonthly && `월 ${fmtNum(p.tenantMonthly)}만`].filter(Boolean).join(" / ")}</Row>
            )}
            {p.memo && <Row label="메모">{p.memo}</Row>}
          </tbody>
        </table>
      </div>

      {/* 연락 칩 */}
      {(p.ownerPhone || p.tenantPhone) && (
        <div className="px-1 flex flex-wrap gap-1.5 mt-1">
          <ContactChip role="집주인" name={p.ownerName} phone={p.ownerPhone} kind="owner" />
          <ContactChip role="임차인" name={p.tenantName} phone={p.tenantPhone} kind="tenant" />
        </div>
      )}
      {(p.ownerPhone || p.tenantPhone) && (
        <p className="px-1 text-[10px] text-gray-400 dark:text-gray-500">
          {[p.ownerPhone && `집주인 ${formatPhone(p.ownerPhone)}`, p.tenantPhone && `임차인 ${formatPhone(p.tenantPhone)}`].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* 작업 */}
      <div className="px-1 mt-2">
        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5">작업</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ActionBtn icon="edit" label="수정" onClick={() => onEdit(p)} />
          <ActionBtn icon="content_copy" label="같은 단지 추가" onClick={() => onCloneSameComplex(p)} />
          <ActionBtn icon="fact_check" label="계약 진행" onClick={() => onProgress(p)} />
          <ActionBtn icon="task_alt" label="거래완료 → 만기" onClick={() => onComplete(p)} primary />
        </div>
      </div>
    </SideDrawer>
  );
}
