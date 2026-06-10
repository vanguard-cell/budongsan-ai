/**
 * /properties 공용 헬퍼 — 상수·포맷 함수
 * (page.tsx 분리 리팩토링으로 추출)
 */

import type { PropertyType, DealType } from "@/lib/properties-db";


export const PROPERTY_TYPES: PropertyType[] = ["아파트", "오피스텔", "빌라/다세대", "원룸/투룸", "상가", "사무실", "토지", "기타"];
export const DEAL_TYPES: DealType[] = ["매매", "전세", "월세"];
/** 거래종류별 배지 색 — 금액(파랑)과 구분 */
export const DEAL_BADGE: Record<string, string> = {
  "매매": "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "전세": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "월세": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};
export const DIRECTIONS = ["동향", "서향", "남향", "북향", "남동향", "남서향", "북동향", "북서향"];

export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return raw;
}

/** 천단위 콤마 — "29600" → "29,600" */
export function fmtNum(s: string): string {
  if (!s) return "";
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  if (isNaN(n)) return s;
  return n.toLocaleString();
}

/** 날짜·시간 한국식 표시 — "2026-06-17" → "6/17(화)" / "2026-06-17T14:00" → "6/17(화) 14:00" */
export function formatDateKo(v: string): string {
  if (!v) return "";
  const hasTime = v.includes("T");
  const d = new Date(hasTime ? v : v + "T00:00:00");
  if (isNaN(d.getTime())) return v;
  const m  = d.getMonth() + 1;
  const dd = d.getDate();
  const w  = "일월화수목금토"[d.getDay()];
  const base = `${m}/${dd}(${w})`;
  if (!hasTime) return base;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${base} ${hh}:${mi}`;
}

/** 한국식 단위 보조 — "29600" → "2억 9,600" */
export function fmtKoreanNum(s: string): string {
  const n = parseInt((s || "").replace(/[^\d]/g, ""), 10);
  if (isNaN(n) || n === 0) return "0";
  const eok = Math.floor(n / 10000);
  const man = n % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}`;
  if (eok > 0) return `${eok}억`;
  return man.toLocaleString();
}

/** ㎡ → 평 (소수점 1자리 반올림). 1평 = 3.3058㎡ */
export function m2ToPyeong(m2: string): string {
  const n = parseFloat((m2 || "").replace(/[^\d.]/g, ""));
  if (!n || isNaN(n)) return "";
  return (Math.round(n / 3.3058 * 10) / 10).toString();
}
