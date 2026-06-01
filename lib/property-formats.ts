/**
 * 매물 → 플랫폼별 광고 양식 자동 생성
 *
 * 수익모델 옵션 A — 한 번 등록한 매물을
 * 네이버/직방/다방/카톡/SMS/블로그 양식으로 변환
 *
 * 각 플랫폼은 공식 API가 없으므로 자동 등록은 불가능하지만,
 * 양식대로 정리된 텍스트를 복사 → 각 플랫폼에서 붙여넣기로
 * 90% 시간 절감 가능
 */

import type { Property } from "./properties-db";

export type AdFormatKey =
  | "naver"      // 네이버 부동산
  | "zigbang"    // 직방
  | "dabang"     // 다방
  | "kakao"      // 손님 안내용 카톡
  | "sms"        // 단문 SMS
  | "blog";      // 블로그·홈페이지·인스타

export interface AdFormat {
  key: AdFormatKey;
  label: string;
  icon: string;
  description: string;
  multiline: boolean;
}

export const AD_FORMATS: AdFormat[] = [
  { key: "naver",   label: "네이버 부동산",     icon: "🟢", description: "네이버 매물 등록 시 복사·붙여넣기", multiline: true },
  { key: "zigbang", label: "직방",             icon: "🟣", description: "직방 매물 등록 양식",              multiline: true },
  { key: "dabang",  label: "다방",             icon: "🔵", description: "다방 매물 등록 양식",              multiline: true },
  { key: "kakao",   label: "카톡 손님 안내",     icon: "💛", description: "손님에게 매물 정보 보낼 때",        multiline: true },
  { key: "sms",     label: "SMS 단문 (90자)",   icon: "📱", description: "단문 SMS 전송용",                  multiline: false },
  { key: "blog",    label: "블로그·인스타",     icon: "📝", description: "블로그·인스타·홈페이지 게시용",      multiline: true },
];

/** 천 단위 콤마 */
function fmtNum(s: string): string {
  if (!s) return "";
  const n = parseInt(s.replace(/\D/g, ""), 10);
  if (isNaN(n)) return s;
  return n.toLocaleString();
}

/** 만원 → "X억 Y,Z00만원" */
function fmtKoreanPrice(s: string): string {
  const n = parseInt((s || "").replace(/\D/g, ""), 10);
  if (isNaN(n) || n === 0) return "";
  const eok = Math.floor(n / 10000);
  const man = n % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`;
  if (eok > 0) return `${eok}억`;
  return `${man.toLocaleString()}만`;
}

/** 가격 라인 — 거래종류별 */
function priceLine(p: Property): string {
  if (p.dealType === "매매") {
    return p.price ? `매매가 ${fmtKoreanPrice(p.price)}원` : "매매가 협의";
  }
  if (p.dealType === "전세") {
    return p.price ? `전세 ${fmtKoreanPrice(p.price)}원` : "전세 협의";
  }
  // 월세
  const dep = p.price ? `보증금 ${fmtKoreanPrice(p.price)}` : "보증금 협의";
  const mon = p.monthly ? `월세 ${fmtNum(p.monthly)}만원` : "월세 협의";
  return `${dep} / ${mon}`;
}

/** 가격 짧은 형식 — "55,000만" or "5,000/70만" */
function priceShort(p: Property): string {
  if (p.dealType === "매매") return p.price ? `${fmtNum(p.price)}만` : "협의";
  if (p.dealType === "전세") return p.price ? `${fmtNum(p.price)}만` : "협의";
  return `${p.price ? fmtNum(p.price) : "0"}/${p.monthly ? fmtNum(p.monthly) : "0"}만`;
}

/** 동/호 정리 */
function dongHo(p: Property): string {
  const parts = [];
  if (p.dong) parts.push(`${p.dong}동`);
  if (p.ho)   parts.push(`${p.ho}호`);
  return parts.join(" ");
}

/** 매물 특징 라인 */
function featLine(p: Property): string {
  const f: string[] = [];
  if (p.area)      f.push(`전용 ${p.area}㎡`);
  if (p.rooms)     f.push(`${p.rooms}룸`);
  if (p.direction) f.push(p.direction);
  if (p.floor)     f.push(`${p.floor}층`);
  return f.join(" / ");
}

const AGENCY_NAME  = "미사금빛공인중개사";
const AGENCY_PHONE = "010-0000-0000"; // TODO: 어머니 실 연락처로 변경 (설정 페이지에서 가져오기)

/* ───────── 네이버 부동산 ───────── */
export function formatNaver(p: Property): string {
  return [
    `🏘️ ${p.propertyType} ${p.dealType} 매물`,
    ``,
    `📍 ${p.address}`,
    dongHo(p) && `🏢 ${dongHo(p)}`,
    featLine(p) && `📐 ${featLine(p)}`,
    `💰 ${priceLine(p)}`,
    p.memo && `✨ ${p.memo}`,
    ``,
    `📞 ${AGENCY_NAME} ${AGENCY_PHONE}`,
  ].filter(Boolean).join("\n");
}

/* ───────── 직방 ───────── */
export function formatZigbang(p: Property): string {
  return [
    `[직방 매물 등록]`,
    `거래종류: ${p.dealType}`,
    `종별: ${p.propertyType}`,
    p.dealType === "매매"
      ? `매매가: ${p.price ? fmtNum(p.price) + "만원" : "협의"}`
      : `보증금: ${p.price ? fmtNum(p.price) + "만원" : "협의"}`,
    p.dealType === "월세" && `월세: ${p.monthly ? fmtNum(p.monthly) + "만원" : "협의"}`,
    `주소: ${p.address}`,
    dongHo(p) && `동/호수: ${dongHo(p)}`,
    p.area      && `전용면적: ${p.area}㎡`,
    p.rooms     && `방수: ${p.rooms}`,
    p.direction && `방향: ${p.direction}`,
    p.floor     && `층: ${p.floor}`,
    p.memo      && `특이사항: ${p.memo}`,
    `연락처: ${AGENCY_PHONE} (${AGENCY_NAME})`,
  ].filter(Boolean).join("\n");
}

/* ───────── 다방 ───────── */
export function formatDabang(p: Property): string {
  return [
    `[다방 매물 등록]`,
    `${p.propertyType} | ${p.dealType}`,
    `${priceLine(p)}`,
    p.area && `면적: ${p.area}㎡${p.rooms ? ` (${p.rooms}룸)` : ""}`,
    p.direction && `방향: ${p.direction}`,
    `주소: ${p.address}`,
    dongHo(p) && `상세: ${dongHo(p)}`,
    p.memo && `\n[특징]\n${p.memo}`,
    ``,
    `📞 ${AGENCY_NAME}`,
    `   ${AGENCY_PHONE}`,
  ].filter(Boolean).join("\n");
}

/* ───────── 카톡 손님 안내 ───────── */
export function formatKakao(p: Property): string {
  return [
    `안녕하세요, ${AGENCY_NAME}입니다.`,
    ``,
    `요청하신 조건에 맞는 매물 안내드립니다 🏠`,
    ``,
    `📍 ${p.address}`,
    dongHo(p) && `🏢 ${dongHo(p)}`,
    featLine(p) && `📐 ${featLine(p)}`,
    `💰 ${priceLine(p)}`,
    p.memo && `\n✨ ${p.memo}`,
    ``,
    `방문 가능하실 때 알려주세요.`,
    `${AGENCY_PHONE}`,
  ].filter(Boolean).join("\n");
}

/* ───────── SMS 단문 (90byte 제한 가이드 → 약 45자) ───────── */
export function formatSms(p: Property): string {
  // 핵심만 압축
  const addr = p.address.split(" ").slice(-2).join(" "); // 마지막 두 단어 (단지명+동호수)
  const feat = p.area ? `${p.area}㎡` : "";
  return `[${AGENCY_NAME}] ${addr} ${feat} ${p.dealType} ${priceShort(p)}. ${AGENCY_PHONE}`;
}

/* ───────── 블로그·인스타·홈페이지 ───────── */
export function formatBlog(p: Property): string {
  return [
    `# ${p.propertyType} ${p.dealType} — ${p.address.split(" ").slice(-1)[0]}`,
    ``,
    `## 매물 정보`,
    ``,
    `- **거래 종류**: ${p.dealType}`,
    `- **매물 유형**: ${p.propertyType}`,
    `- **주소**: ${p.address}`,
    dongHo(p) && `- **동/호**: ${dongHo(p)}`,
    p.area      && `- **전용면적**: ${p.area}㎡`,
    p.rooms     && `- **방수**: ${p.rooms}개`,
    p.direction && `- **방향**: ${p.direction}`,
    p.floor     && `- **층**: ${p.floor}`,
    `- **가격**: ${priceLine(p)}`,
    ``,
    p.memo && `## 특징\n\n${p.memo}\n`,
    `## 문의`,
    ``,
    `**${AGENCY_NAME}**`,
    `📞 ${AGENCY_PHONE}`,
    ``,
    `#하남 #${p.address.split(" ").slice(-2, -1)[0] || "미사강변동"} #${p.propertyType} #${p.dealType}`,
  ].filter(Boolean).join("\n");
}

/* ───────── 통합 — 키 기반 ───────── */
export function formatByKey(key: AdFormatKey, p: Property): string {
  switch (key) {
    case "naver":   return formatNaver(p);
    case "zigbang": return formatZigbang(p);
    case "dabang":  return formatDabang(p);
    case "kakao":   return formatKakao(p);
    case "sms":     return formatSms(p);
    case "blog":    return formatBlog(p);
  }
}
