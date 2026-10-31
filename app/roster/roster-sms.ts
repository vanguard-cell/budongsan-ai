/**
 * 고객명단 문자 문구 (건의 #196)
 *
 * 단지 종류(상가·오피스텔·아파트)별로, 표의 문자 버튼을 누르면 미리 들어갈 문구.
 * 고친 문구는 이 기기에 저장한다 (만기관리 문자 문구와 같은 방식).
 */
import { smsGreeting } from "@/app/expiry/contracts";

const STORAGE_KEY = "roster_sms_templates_v1";

/** 기본 문구 — 지금은 오피스텔만. 인사말의 사무소 이름은 사무소 설정에서 가져옴 */
export function defaultRosterSms(kind: string): string {
  if (kind === "오피스텔") {
    return `${smsGreeting()}\n오피스텔 임대 찾는 문의가 꾸준히 들어와 연락 드립니다.\n공실 이거나 곧 비실 예정이시면 연락 주세요.\n빠르게 임차인 소개해 드립니다.`;
  }
  return "";
}

function loadAll(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}

/** 지금 쓸 문구 — 고쳐서 저장한 게 있으면 그것(비워서 저장했으면 문구 없이), 없으면 기본 문구 */
export function loadRosterSms(kind: string): string {
  const saved = loadAll()[kind];
  return typeof saved === "string" ? saved : defaultRosterSms(kind);
}

/** 저장 — 기본 문구와 같으면 따로 저장하지 않음 (사무소 이름이 바뀌어도 따라가게) */
export function saveRosterSms(kind: string, text: string): void {
  try {
    const all = loadAll();
    if (text === defaultRosterSms(kind)) delete all[kind];
    else all[kind] = text;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* 저장 불가 환경은 무시 */ }
}

/** 번호와 문구가 미리 들어간 문자 작성창 주소 (아이폰은 &, 그 외는 ?) */
export function rosterSmsHref(tel: string, body: string): string {
  if (!body.trim()) return `sms:${tel}`;
  const sep = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?";
  return `sms:${tel}${sep}body=${encodeURIComponent(body)}`;
}
