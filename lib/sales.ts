/**
 * 매출(중개 수수료) 집계 헬퍼
 *
 * - Property.commission(만원) + Property.balanceDate 기준으로 집계
 * - /sales 페이지 + 홈 대시보드 카드에서 공용 사용
 *
 * 정책:
 *  · 잔금일이 있고 commission > 0인 매물만 집계 (status 무관 — 거래완료 포함)
 *  · 월별 키: YYYY-MM (잔금일 기준)
 *  · 미래 잔금일 = "예정 매출"
 */

import type { Property, DealType } from "./properties-db";

export interface SalesStats {
  thisMonth: number;        // 이번달 매출 (만원)
  thisYear: number;         // 올해 매출 누적 (만원)
  pending: number;          // 잔금일 미래 = 예정 매출 (만원)
  grand: number;            // 전체 누적 (만원)
  byMonth: Record<string, number>;          // YYYY-MM → 매출
  itemsByMonth: Record<string, Property[]>; // YYYY-MM → 매물 목록
  byDealType: Record<DealType | "기타", number>; // 거래종류별 누적
  allMonths: string[];      // 정렬된 월 키 (최신 순)
  count: number;            // 매출 잡힌 매물 건수
  avgPerDeal: number;       // 거래 1건당 평균 수수료
}

const emptyStats = (): SalesStats => ({
  thisMonth: 0, thisYear: 0, pending: 0, grand: 0,
  byMonth: {}, itemsByMonth: {}, byDealType: { "매매": 0, "전세": 0, "월세": 0, "기타": 0 },
  allMonths: [], count: 0, avgPerDeal: 0,
});

export function computeSalesStats(properties: Property[]): SalesStats {
  const stats = emptyStats();
  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const thisYear  = new Date().toISOString().slice(0, 4); // YYYY
  const today     = new Date().toISOString().slice(0, 10);

  for (const p of properties) {
    const amt = parseInt((p.commission || "0").replace(/\D/g, ""), 10) || 0;
    if (amt === 0 || !p.balanceDate) continue;

    const month = p.balanceDate.slice(0, 7);
    stats.byMonth[month] = (stats.byMonth[month] || 0) + amt;
    (stats.itemsByMonth[month] ||= []).push(p);

    if (month === thisMonth)               stats.thisMonth += amt;
    if (p.balanceDate.slice(0, 4) === thisYear) stats.thisYear  += amt;
    if (p.balanceDate >= today)            stats.pending   += amt;
    stats.grand += amt;

    const dt = (p.dealType ?? "기타") as DealType | "기타";
    stats.byDealType[dt] = (stats.byDealType[dt] || 0) + amt;
    stats.count++;
  }

  stats.allMonths = Object.keys(stats.byMonth).sort().reverse();
  stats.avgPerDeal = stats.count > 0 ? Math.round(stats.grand / stats.count) : 0;
  return stats;
}

/** 천 단위 콤마 */
export function fmtNum(n: number | string): string {
  const v = typeof n === "string" ? parseInt(n.replace(/\D/g, ""), 10) : n;
  if (isNaN(v)) return "0";
  return v.toLocaleString();
}

/** "2026-06" → "2026년 6월" */
export function formatMonthKo(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${y}년 ${parseInt(m, 10)}월`;
}

/** 만원 → "X억 Y,Z00만원" 형태 (전체 합계 표시용) */
export function formatManToKorean(n: number): string {
  if (!n) return "0만원";
  const eok = Math.floor(n / 10000);
  const man = n % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  return `${man.toLocaleString()}만원`;
}
