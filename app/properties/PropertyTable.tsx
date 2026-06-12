"use client";

/**
 * 매물 표 뷰 — 엑셀형 (노션 톤 v2)
 *
 * - 한 줄 = 한 매물: 단지·동호 / 거래 / 가격 / 유형 / 집주인 / 임차인 / 만기일 / 잔금일 / 단계
 * - 행 클릭 → 우측 패널 (선택 행 파란 표시)
 * - 폰: 가로 스크롤 (min-w 고정)
 * - 인라인 셀 편집(더블클릭)은 4단계에서 추가 예정
 */

import type { Property } from "@/lib/properties-db";
import { dDay } from "@/app/expiry/contracts";
import { fmtNum } from "./helpers";

/* 거래 종류 배지 — 노션 틴트 (시안 확정) */
const DEAL_TINT: Record<string, string> = {
  "매매": "bg-[var(--tint-red-bg)] text-[var(--tint-red-tx)] border border-[var(--tint-red-bd)]",
  "전세": "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border border-[var(--tint-blue-bd)]",
  "월세": "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-tx)] border border-[var(--tint-amber-bd)]",
};

/* 진행 단계 — 날짜 기반 자동 계산 (수정 불가 열) */
export function stageOf(p: Property): { label: string; cls: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (p.status === "closed")
    return { label: "거래완료", cls: "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400" };
  if (p.balanceDate && p.balanceDate <= today)
    return { label: "잔금 지남", cls: "bg-[var(--tint-red-bg)] text-[var(--tint-red-tx)] border border-[var(--tint-red-bd)]" };
  if (p.contractDate || p.downPaymentDate || p.balanceDate)
    return { label: "계약 진행", cls: "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border border-[var(--tint-blue-bd)]" };
  return { label: "미계약", cls: "bg-[var(--tint-green-bg)] text-[var(--tint-green-tx)] border border-[var(--tint-green-bd)]" };
}

function priceStr(p: Property): string {
  if (p.dealType === "월세") return `${fmtNum(p.price)}/${fmtNum(p.monthly)}`;
  return fmtNum(p.price);
}

function addressStr(p: Property): string {
  return [p.address, p.dong && `${p.dong}동`, p.ho && `${p.ho}호`].filter(Boolean).join(" ");
}

/* 만기일 셀 — 임박도에 따라 색 (지남·D-7 빨강 / D-30 주황) */
function LeaseEndCell({ date }: { date?: string }) {
  if (!date) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const dd = dDay(date);
  const short = date.slice(5).replace("-", "/");
  if (dd < 0) return <span className="font-bold text-[var(--tint-red-tx)]">{short} ({-dd}일 지남)</span>;
  if (dd <= 7) return <span className="font-bold text-[var(--tint-red-tx)]">{short} (D-{dd})</span>;
  if (dd <= 30) return <span className="font-semibold text-amber-600 dark:text-amber-400">{short} (D-{dd})</span>;
  return <span className="text-gray-700 dark:text-gray-300">{short}</span>;
}

function DateCell({ date }: { date?: string }) {
  if (!date) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return <span className="text-gray-700 dark:text-gray-300">{date.slice(5).replace("-", "/")}</span>;
}

interface Props {
  list: Property[];
  selectedId?: string;
  onRowClick: (p: Property) => void;
}

export default function PropertyTable({ list, selectedId, onRowClick }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--sidebar-bd)] bg-white dark:bg-slate-900">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--sidebar-bd)] text-[12px] text-gray-400 dark:text-gray-500">
            <th className="text-left font-medium px-3 py-2.5 w-[24%]">단지·동호</th>
            <th className="text-left font-medium px-2 py-2.5 w-[7%]">거래</th>
            <th className="text-left font-medium px-2 py-2.5 w-[11%]">가격(만)</th>
            <th className="text-left font-medium px-2 py-2.5 w-[9%]">유형</th>
            <th className="text-left font-medium px-2 py-2.5 w-[10%]">집주인</th>
            <th className="text-left font-medium px-2 py-2.5 w-[10%]">임차인</th>
            <th className="text-left font-medium px-2 py-2.5 w-[13%]">만기일</th>
            <th className="text-left font-medium px-2 py-2.5 w-[8%]">잔금일</th>
            <th className="text-left font-medium px-2 py-2.5 w-[8%]">단계</th>
          </tr>
        </thead>
        <tbody>
          {list.map(p => {
            const stage = stageOf(p);
            const selected = p.id === selectedId;
            return (
              <tr
                key={p.id}
                onClick={() => onRowClick(p)}
                className={`border-b border-gray-100 dark:border-slate-800 last:border-0 cursor-pointer transition-colors ${
                  selected
                    ? "bg-[var(--tint-blue-bg)] outline outline-1 -outline-offset-1 outline-[var(--brand-blue)]"
                    : "hover:bg-gray-50/80 dark:hover:bg-slate-800/60"
                }`}
              >
                <td className={`px-3 py-2.5 font-semibold truncate max-w-0 ${selected ? "text-[var(--tint-blue-tx)]" : "text-gray-900 dark:text-gray-100"}`} title={addressStr(p)}>
                  {addressStr(p)}
                </td>
                <td className="px-2 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${DEAL_TINT[p.dealType] || "bg-gray-100 text-gray-600"}`}>
                    {p.dealType}
                  </span>
                </td>
                <td className="px-2 py-2.5 tabular-nums text-gray-900 dark:text-gray-100 whitespace-nowrap">{priceStr(p)}</td>
                <td className="px-2 py-2.5 text-gray-600 dark:text-gray-400 truncate max-w-0">{p.propertyType}</td>
                <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-0">{p.ownerName || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-0">{p.tenantName || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                <td className="px-2 py-2.5 whitespace-nowrap text-[12px]"><LeaseEndCell date={p.leaseEndDate} /></td>
                <td className="px-2 py-2.5 whitespace-nowrap text-[12px]"><DateCell date={p.balanceDate} /></td>
                <td className="px-2 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${stage.cls}`}>
                    {stage.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
