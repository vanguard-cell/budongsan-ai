/** 경기도 중개보수(법정 수수료) 계산 — 금액 단위는 모두 만원, 부가세 별도 */
import type { Property } from "@/lib/properties-db";

export interface CommissionResult {
  fee: number;        // 중개보수 (만원, 부가세 별도) — 상한 요율 기준
  rateText: string;   // 적용 요율 설명 (예: "0.4%")
  baseAmount: number; // 요율을 곱한 거래금액 (임대차는 환산금액)
  note?: string;      // 한도·협의 등 안내
}

const num = (s: string | undefined) => Number((s || "").replace(/[^\d.]/g, "")) || 0;

type Tier = { under: number; rate: number; limit?: number };

const HOUSING_SALE: Tier[] = [
  { under: 5000, rate: 0.6, limit: 25 },
  { under: 20000, rate: 0.5, limit: 80 },
  { under: 90000, rate: 0.4 },
  { under: 120000, rate: 0.5 },
  { under: 150000, rate: 0.6 },
  { under: Infinity, rate: 0.7 },
];
const HOUSING_LEASE: Tier[] = [
  { under: 5000, rate: 0.5, limit: 20 },
  { under: 10000, rate: 0.4, limit: 30 },
  { under: 60000, rate: 0.3 },
  { under: 120000, rate: 0.4 },
  { under: 150000, rate: 0.5 },
  { under: Infinity, rate: 0.6 },
];

const fromTiers = (tiers: Tier[], base: number): CommissionResult => {
  const t = tiers.find(x => base < x.under)!;
  let fee = base * t.rate / 100;
  let note: string | undefined;
  if (t.limit !== undefined && fee > t.limit) { fee = t.limit; note = `한도 ${t.limit}만원 적용`; }
  return { fee, rateText: `${t.rate}%`, baseAmount: base, note };
};

/** 매물 정보로 법정 중개보수 계산 — 금액이 없거나 계산 불가면 null */
export function calcLegalCommission(p: Pick<Property, "propertyType" | "dealType" | "price" | "monthly" | "area">): CommissionResult | null {
  const price = num(p.price);
  const monthly = num(p.monthly);
  if (!price) return null;
  const isSale = p.dealType === "매매";

  // 임대차는 월세 환산: 보증금 + 월세×100 (합계 5천만원 미만이면 월세×70)
  let base = price;
  if (!isSale) {
    base = price + monthly * 100;
    if (base < 5000) base = price + monthly * 70;
  }

  const t = p.propertyType;
  if (t === "아파트" || t === "빌라/다세대" || t === "원룸/투룸") {
    return fromTiers(isSale ? HOUSING_SALE : HOUSING_LEASE, base);
  }
  // 오피스텔: 전용 85㎡ 이하(주거용 시설)면 매매 0.5%·임대차 0.4%, 그 외는 0.9% 이내 협의
  if (t === "오피스텔") {
    const area = num(p.area);
    if (area > 0 && area <= 85) {
      const rate = isSale ? 0.5 : 0.4;
      return { fee: base * rate / 100, rateText: `${rate}%`, baseAmount: base, note: "전용 85㎡ 이하 기준" };
    }
    return { fee: base * 0.009, rateText: "0.9%", baseAmount: base, note: area > 0 ? "85㎡ 초과 — 0.9% 이내 협의" : "면적 미입력 — 85㎡ 초과 기준(0.9% 이내 협의)" };
  }
  // 상가·사무실·토지·기타: 0.9% 이내 협의
  return { fee: base * 0.009, rateText: "0.9%", baseAmount: base, note: "0.9% 이내에서 협의" };
}
