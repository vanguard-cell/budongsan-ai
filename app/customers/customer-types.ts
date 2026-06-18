/* 손님 CRM 데이터 모델 + 헬퍼 */

export type CustomerSide = "buyer" | "seller" | "tenant" | "landlord" | "etc";
export type DealKind = "live" | "invest" | "etc"; // 실거주 / 투자 / 기타
export type CustomerStatus = "active" | "matched" | "lost" | "closed";

/** 손님이 본 매물 한 건 */
export interface ShownProperty {
  address: string;
  shownAt: string;      // YYYY-MM-DD
  reaction: "positive" | "neutral" | "negative" | "";
  note: string;
}

/** 손님 여정 이벤트 (활동 로그 — 하이브리드: 적용 시점부터 누적) */
export interface CustomerEvent {
  at: number;     // 발생 시각 (ms)
  by: string;     // 기록한 사람
  kind: "create" | "shown" | "call" | "sms" | "visit" | "status" | "drop" | "note" | "followup";
  text: string;
  reaction?: "positive" | "neutral" | "negative" | "";
  reason?: string;   // 포기·이탈 사유 (집계용 — drop 이벤트)
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  side: CustomerSide;       // 매수·매도·임차·임대인 구분
  dealKind: DealKind;       // 실거주·투자 등 의도
  vip: boolean;             // VIP 표시 (인터뷰: "수수료 많이 받는 매물이 VIP")
  budget: string;           // 자유 텍스트 ("5억 이하" 등)
  preferredArea: string;    // 원하는 단지/지역
  moveInDate: string;       // 입주 가능일 (YYYY-MM-DD)
  status: CustomerStatus;
  nextFollowUp: string;     // 다음 후속 연락 예정일 (YYYY-MM-DD)
  shownProperties: ShownProperty[];
  memo: string;
  createdAt: number;
  history?: CustomerEvent[];   // 여정 활동 이력 (전화·문자·상태변경·포기·메모)
}

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ───────── 거래 파이프라인 단계 ─────────
   손님 = 거래(deal). 단계는 status + 활동 이력에서 자동 추론 (별도 입력 불필요)
   흐름: 문의 → 연락중 → 매물 보여줌 → 협상 → 계약 성사 / (실패는 별도) */
export type CustomerStage = "inquiry" | "contacted" | "shown" | "negotiation" | "won" | "lost";

/** 진행 흐름 (실패 제외) — 보드 칼럼·퍼널 순서 */
export const STAGE_FLOW: CustomerStage[] = ["inquiry", "contacted", "shown", "negotiation", "won"];

export const STAGE_META: Record<CustomerStage, { label: string; short: string; bg: string; fg: string }> = {
  inquiry:     { label: "문의",      short: "문의",   bg: "#F1EFE8", fg: "#5F5E5A" },
  contacted:   { label: "연락중",    short: "연락",   bg: "#E6F1FB", fg: "#185FA5" },
  shown:       { label: "매물 보여줌", short: "보여줌", bg: "#EEEDFE", fg: "#3C3489" },
  negotiation: { label: "협상",      short: "협상",   bg: "#FAEEDA", fg: "#854F0B" },
  won:         { label: "계약 성사",  short: "계약",   bg: "#E1F5EE", fg: "#085041" },
  lost:        { label: "실패",      short: "실패",   bg: "#FCEBEB", fg: "#A32D2D" },
};

/** 손님의 현재 거래 단계 자동 추론 */
export function deriveStage(c: Customer): CustomerStage {
  if (c.status === "closed") return "won";
  if (c.status === "lost") return "lost";
  if (c.status === "matched") return "negotiation";
  // active — 활동 이력으로 진척 판단
  const kinds = new Set((c.history || []).map(e => e.kind));
  const hasShown = (c.shownProperties && c.shownProperties.length > 0) || kinds.has("shown");
  const hasContact = kinds.has("call") || kinds.has("sms") || kinds.has("visit");
  if (hasShown) return "shown";
  if (hasContact) return "contacted";
  return "inquiry";
}

export const SIDE_LABELS: Record<CustomerSide, string> = {
  buyer:    "매수",
  seller:   "매도",
  tenant:   "임차",
  landlord: "임대인",
  etc:      "기타",
};

export const DEAL_KIND_LABELS: Record<DealKind, string> = {
  live:   "실거주",
  invest: "투자",
  etc:    "기타",
};

export const STATUS_LABELS: Record<CustomerStatus, string> = {
  active:  "진행 중",
  matched: "매칭",
  lost:    "이탈",
  closed:  "거래 완료",
};

/** 후속 연락까지 남은 일수 (음수면 지남) */
export function followUpDDay(nextFollowUp: string): number {
  if (!nextFollowUp) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(nextFollowUp);
  next.setHours(0, 0, 0, 0);
  return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** 후속 연락 긴급도 */
export type FollowUpSeverity = "overdue" | "today" | "soon" | "scheduled" | "none";

export function followUpSeverity(d: number): FollowUpSeverity {
  if (d === Infinity) return "none";
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 3) return "soon";
  return "scheduled";
}

export function followUpDDayLabel(d: number): string {
  if (d === Infinity) return "—";
  if (d < 0) return `${-d}일 지남`;
  if (d === 0) return "오늘";
  return `D-${d}`;
}

export function followUpClasses(s: FollowUpSeverity): { badge: string; row: string; dot: string } {
  switch (s) {
    case "overdue":   return { badge: "bg-red-100 text-red-700 border-red-200",       row: "bg-red-50/50 border-red-200",       dot: "bg-red-500" };
    case "today":     return { badge: "bg-orange-100 text-orange-700 border-orange-200", row: "bg-orange-50/50 border-orange-200", dot: "bg-orange-500" };
    case "soon":      return { badge: "bg-yellow-100 text-yellow-700 border-yellow-200", row: "bg-yellow-50/40 border-yellow-200", dot: "bg-yellow-500" };
    case "scheduled": return { badge: "bg-blue-100 text-blue-700 border-blue-200",     row: "bg-white border-gray-200",          dot: "bg-blue-400" };
    case "none":      return { badge: "bg-gray-100 text-gray-600 border-gray-200",     row: "bg-white border-gray-200",          dot: "bg-gray-300" };
  }
}

/** 전화번호 포맷 */
export function formatPhone(raw: string): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

/** 기존 필드에서 파생되는 여정 이벤트 (등록·보여준 매물·후속연락) — 과거 데이터도 즉시 표시 */
export function deriveCustomerTimeline(c: Customer): CustomerEvent[] {
  const evs: CustomerEvent[] = [];
  const dayMs = (ymd: string) => new Date(ymd.slice(0, 10) + "T00:00:00").getTime();
  if (c.createdAt) evs.push({ at: c.createdAt, by: "", kind: "create", text: "손님 등록" });
  for (const sp of c.shownProperties || []) {
    if (!sp.address) continue;
    const when = sp.shownAt ? dayMs(sp.shownAt) : c.createdAt;
    const reactLabel = sp.reaction === "positive" ? "긍정" : sp.reaction === "negative" ? "부정" : sp.reaction === "neutral" ? "중립" : "";
    const tail = [reactLabel, sp.note].filter(Boolean).join(" · ");
    evs.push({ at: when, by: "", kind: "shown", text: `${sp.address} 보여줌${tail ? ` · ${tail}` : ""}`, reaction: sp.reaction });
  }
  if (c.nextFollowUp) evs.push({ at: new Date(c.nextFollowUp.slice(0, 10) + "T00:00:00").getTime(), by: "", kind: "followup", text: "후속 연락 예정" });
  return evs;
}

/** 타임라인 표시용 — 기록 이벤트는 history 배열 인덱스(_idx)를 달아 수정·삭제 가능하게 */
export interface TimelineEntry extends CustomerEvent {
  _idx?: number;   // c.history 내 위치 (기록 이벤트만, 파생은 undefined)
}

/** 파생 + 기록 이력을 합쳐 최신순 정렬 (중복 텍스트는 기록 우선) */
export function mergedCustomerTimeline(c: Customer): TimelineEntry[] {
  const logged: TimelineEntry[] = (c.history || []).map((e, i) => ({ ...e, _idx: i }));
  const loggedTexts = new Set(logged.map(e => e.text));
  const derived = deriveCustomerTimeline(c).filter(e => !loggedTexts.has(e.text));
  return [...logged, ...derived].sort((a, b) => b.at - a.at);
}

/** 이벤트 종류·반응 → 색·아이콘 (의미 기반 — 긍정 초록 / 부정·포기 빨강 / 연락 파랑 / 방문 보라) */
export function eventVisual(e: { kind: CustomerEvent["kind"]; reaction?: ShownProperty["reaction"] }): { bg: string; fg: string; icon: string; label: string } {
  switch (e.kind) {
    case "shown":
      if (e.reaction === "positive") return { bg: "#E1F5EE", fg: "#085041", icon: "thumb_up", label: "보여줌 · 긍정" };
      if (e.reaction === "negative") return { bg: "#FCEBEB", fg: "#A32D2D", icon: "thumb_down", label: "보여줌 · 부정" };
      return { bg: "#E6F1FB", fg: "#185FA5", icon: "visibility", label: "매물 보여줌" };
    case "call":     return { bg: "#E6F1FB", fg: "#185FA5", icon: "call", label: "전화" };
    case "sms":      return { bg: "#E6F1FB", fg: "#185FA5", icon: "sms", label: "문자" };
    case "visit":    return { bg: "#EEEDFE", fg: "#3C3489", icon: "directions_walk", label: "집보기" };
    case "drop":     return { bg: "#FCEBEB", fg: "#A32D2D", icon: "cancel", label: "포기" };
    case "status":   return { bg: "#FAEEDA", fg: "#854F0B", icon: "flag", label: "상태변경" };
    case "note":     return { bg: "#FAEEDA", fg: "#854F0B", icon: "sticky_note_2", label: "메모" };
    case "followup": return { bg: "#EEEDFE", fg: "#3C3489", icon: "event_upcoming", label: "예정" };
    case "create":
    default:         return { bg: "#F1EFE8", fg: "#5F5E5A", icon: "person_add", label: "손님 등록" };
  }
}

export function telUrl(phone: string): string { return `tel:${phone.replace(/\D/g, "")}`; }
export function smsUrl(phone: string, body: string): string {
  return `sms:${phone.replace(/\D/g, "")}?body=${encodeURIComponent(body)}`;
}

/** 빈 손님 폼 */
export function emptyCustomer(): Customer {
  return {
    id: uid(),
    name: "",
    phone: "",
    side: "buyer",
    dealKind: "live",
    vip: false,
    budget: "",
    preferredArea: "",
    moveInDate: "",
    status: "active",
    nextFollowUp: "",
    shownProperties: [],
    memo: "",
    createdAt: Date.now(),
  };
}

/** 오늘 기준 N일 뒤 (YYYY-MM-DD) */
function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 예시 손님 5건 — 다양한 상태 */
export function sampleCustomers(): Customer[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      name: "이지영",
      phone: "010-2345-6789",
      side: "buyer",
      dealKind: "live",
      vip: true,
      budget: "5억 이하",
      preferredArea: "미사강변동, 미사역 인근",
      moveInDate: dateOffset(45),
      status: "active",
      nextFollowUp: dateOffset(-1),      // 이미 1일 지남 — 위급
      shownProperties: [
        { address: "힐스테이트 미사역 12-1블럭 101동 1902호", shownAt: dateOffset(-10), reaction: "positive", note: "층 마음에 들어함" },
        { address: "미사강변센트럴 305동 1801호", shownAt: dateOffset(-5), reaction: "neutral", note: "가격이 부담됨" },
      ],
      memo: "남편이랑 같이 의사결정. 주말에 임장 선호.",
      createdAt: now - 1000 * 60 * 60 * 24 * 20,
    },
    {
      id: uid(),
      name: "김재현",
      phone: "010-8888-7777",
      side: "tenant",
      dealKind: "live",
      vip: false,
      budget: "보증금 1억 / 월세 100 이하",
      preferredArea: "망월동",
      moveInDate: dateOffset(30),
      status: "active",
      nextFollowUp: dateOffset(0),       // 오늘
      shownProperties: [],
      memo: "혼자 거주. 1.5룸 이상.",
      createdAt: now - 1000 * 60 * 60 * 24 * 7,
    },
    {
      id: uid(),
      name: "박상우",
      phone: "010-3322-1100",
      side: "buyer",
      dealKind: "invest",
      vip: true,
      budget: "10억 이하",
      preferredArea: "상관 없음 — 수익률 우선",
      moveInDate: "",
      status: "active",
      nextFollowUp: dateOffset(2),       // D-2
      shownProperties: [
        { address: "미사효성 해링턴타워 더퍼스트", shownAt: dateOffset(-3), reaction: "positive", note: "" },
      ],
      memo: "투자 손님, 월세 안고 매매 선호. 현금 보유 확인됨.",
      createdAt: now - 1000 * 60 * 60 * 24 * 30,
    },
    {
      id: uid(),
      name: "최영자",
      phone: "010-9999-1234",
      side: "buyer",
      dealKind: "live",
      vip: false,
      budget: "3억 이하",
      preferredArea: "조용한 동, 1층 제외",
      moveInDate: dateOffset(90),
      status: "active",
      nextFollowUp: dateOffset(10),
      shownProperties: [],
      memo: "",
      createdAt: now - 1000 * 60 * 60 * 24 * 3,
    },
    {
      id: uid(),
      name: "정한솔",
      phone: "010-7777-3333",
      side: "tenant",
      dealKind: "live",
      vip: false,
      budget: "",
      preferredArea: "",
      moveInDate: "",
      status: "closed",
      nextFollowUp: "",
      shownProperties: [
        { address: "마들렌 9층 910호", shownAt: dateOffset(-60), reaction: "positive", note: "계약 완료" },
      ],
      memo: "계약 완료. 만기 시 재계약 의향 확인 예정.",
      createdAt: now - 1000 * 60 * 60 * 24 * 90,
    },
  ];
}
