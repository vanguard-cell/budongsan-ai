/* 계약 데이터 모델 + localStorage 헬퍼 */

export type ContractType = "전세" | "월세" | "매매";
export type ContractStatus = "active" | "closed";
export type ContactTarget = "tenant" | "landlord";
export type NotifyStage = "4m" | "3m" | "2m";

export interface Contract {
  id: string;
  address: string;        // 단지명 + 동호수 (호환성 위해 통합 보관)
  dong?: string;          // 동 번호 (예: "101")
  ho?: string;            // 호수 (예: "1902")
  type: ContractType;
  deposit: string;        // 보증금 (만원, 문자열로 보관해서 빈값 허용)
  monthly: string;        // 월세 (만원)
  startDate: string;      // YYYY-MM-DD
  endDate: string;        // YYYY-MM-DD 만기일
  tenantName: string;
  tenantPhone: string;
  landlordName: string;
  landlordPhone: string;
  // 매물 상세 — 내 매물 등록 폼과 동일하게 (어머니 요청)
  propertyType?: string;    // 아파트/오피스텔/빌라 등
  area?: string;            // 전용면적 (㎡) — 숫자만
  unitType?: string;        // 평면도 타입 (예: 84A, C-3타입)
  direction?: string;       // 방향
  rooms?: string;           // 방수
  // 매물에서 이전된 경우 보존되는 계약 진행 정보
  contractDate?: string;    // 계약일
  downPaymentDate?: string; // 중도금일
  balanceDate?: string;     // 잔금일
  commission?: string;      // 중개 수수료 (만원) — 매물에서 이전 시 보존, 매출 집계용
  linkedCustomerId?: string; // 손님 관리 연결 ID
  fromPropertyId?: string;   // 어떤 매물에서 이전됐는지 (이력)
  memo: string;
  status: ContractStatus;
  createdAt: number;
}

/** 이전 localStorage 키 — 마이그레이션용으로만 참조 */
export const STORAGE_KEY = "budongsan_contracts";

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** 로컬 백업 데이터 조회 (마이그레이션용) */
export function loadContracts(): Contract[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* D-day 계산: 만기일까지 남은 일수 (음수면 이미 지남) */
export function dDay(endDate: string): number {
  if (!endDate) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  if (isNaN(end.getTime())) return Infinity; // 잘못된 날짜 형식 → 안전으로 처리
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export type Severity = "danger" | "warning" | "caution" | "safe";

export function severityOf(dday: number): Severity {
  if (dday <= 60) return "danger";   // 이미 만기 / D-60 이내 (2개월)
  if (dday <= 90) return "warning";  // D-90 이내 (3개월) — 묵시적 갱신 위험
  if (dday <= 120) return "caution"; // D-120 이내 (4개월)
  return "safe";
}

export function severityLabel(s: Severity): string {
  switch (s) {
    case "danger":  return "위험";
    case "warning": return "주의";
    case "caution": return "예고";
    case "safe":    return "안전";
  }
}

export function severityClasses(s: Severity): {
  badge: string;
  row: string;
  dot: string;
} {
  switch (s) {
    case "danger":
      return {
        badge: "bg-red-100 text-red-700 border-red-200",
        row:   "bg-red-50/50 border-red-200",
        dot:   "bg-red-500",
      };
    case "warning":
      return {
        badge: "bg-orange-100 text-orange-700 border-orange-200",
        row:   "bg-orange-50/50 border-orange-200",
        dot:   "bg-orange-500",
      };
    case "caution":
      return {
        badge: "bg-yellow-100 text-yellow-700 border-yellow-200",
        row:   "bg-yellow-50/40 border-yellow-200",
        dot:   "bg-yellow-500",
      };
    case "safe":
      return {
        badge: "bg-gray-100 text-gray-600 border-gray-200",
        row:   "bg-white border-gray-200",
        dot:   "bg-gray-400",
      };
  }
}

/* D-day 표시 문자열 */
export function dDayLabel(dday: number): string {
  if (dday === Infinity) return "—";
  if (dday < 0) return `만기 ${-dday}일 지남`;
  if (dday === 0) return "오늘 만기";
  return `D-${dday}`;
}

/* 전화번호 포맷 — 01012345678 -> 010-1234-5678 */
export function formatPhone(raw: string): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

/* 시작일 + 2년 = 만기일 기본값 */
export function defaultEndDate(startDate: string, years: number = 2): string {
  if (!startDate) return "";
  const d = new Date(startDate);
  if (isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/* 오늘 기준 N일 뒤 날짜 (YYYY-MM-DD) */
function dateOffset(daysFromToday: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

/* 예시 계약 6건 — 각 위험도 색상 골고루 + 종료 1건 */
export function sampleContracts(): Contract[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      address: "미사강변동 1100 힐스테이트 미사역 그랑파사쥬 12-1블럭 101동 1902호",
      type: "월세",
      deposit: "5000",
      monthly: "130",
      startDate: dateOffset(-700),
      endDate: dateOffset(15), // 🔴 위험 D-15
      tenantName: "김철수",
      tenantPhone: "010-1234-5678",
      landlordName: "박영희",
      landlordPhone: "010-9876-5432",
      memo: "재계약 의향 미확인 — 빨리 연락 필요",
      status: "active",
      createdAt: now - 1000 * 60 * 60 * 24 * 700,
    },
    {
      id: uid(),
      address: "망월동 1099-1 망월동 공공주택지구 11-1 1023호",
      type: "전세",
      deposit: "22770",
      monthly: "",
      startDate: dateOffset(-680),
      endDate: dateOffset(45), // 🟠 주의 D-45
      tenantName: "조현민",
      tenantPhone: "010-7924-1111",
      landlordName: "정우성",
      landlordPhone: "010-5033-2222",
      memo: "묵시적 갱신 주의",
      status: "active",
      createdAt: now - 1000 * 60 * 60 * 24 * 680,
    },
    {
      id: uid(),
      address: "미사강변동 1087 미사효성 해링턴타워 더퍼스트 101동 2717호",
      type: "월세",
      deposit: "1000",
      monthly: "70",
      startDate: dateOffset(-660),
      endDate: dateOffset(75), // 🟠 주의 D-75 (60~90 사이) → 사실 caution
      tenantName: "권다솜",
      tenantPhone: "010-9242-3333",
      landlordName: "최재현",
      landlordPhone: "010-2480-4444",
      memo: "",
      status: "active",
      createdAt: now - 1000 * 60 * 60 * 24 * 660,
    },
    {
      id: uid(),
      address: "미사강변동 1100 마들렌 제9층 제910호",
      type: "월세",
      deposit: "500",
      monthly: "70",
      startDate: dateOffset(-640),
      endDate: dateOffset(85), // 🟡 예고 D-85
      tenantName: "안순자",
      tenantPhone: "010-8307-5555",
      landlordName: "정수영",
      landlordPhone: "010-9109-6666",
      memo: "예고 단계 — 임차인 의향 확인 시작 권장",
      status: "active",
      createdAt: now - 1000 * 60 * 60 * 24 * 640,
    },
    {
      id: uid(),
      address: "미사강변동 1143-1 미사강변 오벨리스크 제6층 제101-613호",
      type: "월세",
      deposit: "10000",
      monthly: "55",
      startDate: dateOffset(-500),
      endDate: dateOffset(220), // ⚪ 안전 D-220
      tenantName: "민완규",
      tenantPhone: "010-5380-7777",
      landlordName: "최령",
      landlordPhone: "010-5210-8888",
      memo: "",
      status: "active",
      createdAt: now - 1000 * 60 * 60 * 24 * 500,
    },
    {
      id: uid(),
      address: "미사강변동 1100 힐스테이트 미사역 그랑파사쥬 201동 1502호",
      type: "전세",
      deposit: "45000",
      monthly: "",
      startDate: dateOffset(-1100),
      endDate: dateOffset(-30), // 종료 (이미 30일 지남)
      tenantName: "최옥자",
      tenantPhone: "010-9633-9999",
      landlordName: "조서영",
      landlordPhone: "010-9205-0000",
      memo: "거래 종료 — 새 임차인 입주 완료",
      status: "closed",
      createdAt: now - 1000 * 60 * 60 * 24 * 1100,
    },
  ];
}

/* 빈 계약 폼 */
export function emptyContract(): Contract {
  return {
    id: uid(),
    address: "",
    type: "월세",
    deposit: "",
    monthly: "",
    startDate: "",
    endDate: "",
    tenantName: "",
    tenantPhone: "",
    landlordName: "",
    landlordPhone: "",
    propertyType: "아파트",
    area: "",
    unitType: "",
    direction: "",
    rooms: "",
    memo: "",
    status: "active",
    createdAt: Date.now(),
  };
}

/** 매물 유형 목록 — 내 매물 등록과 동일 */
export const CONTRACT_PROPERTY_TYPES = ["아파트", "오피스텔", "빌라/다세대", "원룸/투룸", "상가", "사무실", "토지", "기타"] as const;
/** 방향 목록 — 내 매물 등록과 동일 */
export const CONTRACT_DIRECTIONS = ["동향", "서향", "남향", "북향", "남동향", "남서향", "북동향", "북서향"] as const;

/* 문자 템플릿 */
export interface SmsTemplate {
  stage: NotifyStage;
  target: ContactTarget;
  text: string;
}

export const AGENCY_NAME = "미사금빛공인중개사";

/* ── SMS 템플릿 기본값 (플레이스홀더: {주소} {만기일}) ── */
export const DEFAULT_SMS_TEMPLATES: Record<string, string> = {
  "4m_tenant":   `안녕하세요, ${AGENCY_NAME}입니다.\n{주소} 계약 만기일이 {만기일}로 약 4개월 남았습니다.\n재계약 의향 있으신지 여쭤봐도 될까요?`,
  "3m_tenant":   `안녕하세요, ${AGENCY_NAME}입니다.\n{주소} 계약 만기일이 {만기일}로 약 3개월 남았습니다.\n재계약 의향 있으신지 여쭤봐도 될까요?`,
  "2m_tenant":   `안녕하세요, ${AGENCY_NAME}입니다.\n{주소} 계약 만기일이 {만기일}로 약 2개월 남았습니다.\n묵시적 갱신 전 의향 확인 부탁드립니다.`,
  "4m_landlord": `안녕하세요, ${AGENCY_NAME}입니다.\n{주소} 계약 만기일이 {만기일}로 약 4개월 남았습니다.\n임차인 재계약 의향 확인 시작하겠습니다. 조건 변동사항 있으시면 알려주세요.`,
  "3m_landlord": `안녕하세요, ${AGENCY_NAME}입니다.\n{주소} 계약 만기일이 {만기일}로 약 3개월 남았습니다.\n임차인 재계약 의향 확인 시작하겠습니다. 조건 변동사항 있으시면 알려주세요.`,
  "2m_landlord": `안녕하세요, ${AGENCY_NAME}입니다.\n{주소} 계약 만기일이 {만기일}로 약 2개월 남았습니다.\n임차인 의향 확인 결과 공유드릴 예정입니다. 새 임차인 모집 필요 시 알려주세요.`,
};

const SMS_TEMPLATE_STORAGE_KEY = "budongsan_sms_templates_v2";

export function loadCustomSmsTemplates(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SMS_TEMPLATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveCustomSmsTemplate(stage: NotifyStage, target: ContactTarget, templateText: string): void {
  if (typeof window === "undefined") return;
  const all = loadCustomSmsTemplates();
  all[`${stage}_${target}`] = templateText;
  localStorage.setItem(SMS_TEMPLATE_STORAGE_KEY, JSON.stringify(all));
}

export function resetCustomSmsTemplate(stage: NotifyStage, target: ContactTarget): void {
  if (typeof window === "undefined") return;
  const all = loadCustomSmsTemplates();
  delete all[`${stage}_${target}`];
  localStorage.setItem(SMS_TEMPLATE_STORAGE_KEY, JSON.stringify(all));
}

/** 플레이스홀더({주소}, {만기일})를 실제 값으로 치환 */
export function applyTemplate(template: string, contract: Contract): string {
  return template
    .replace(/\{주소\}/g, contract.address)
    .replace(/\{만기일\}/g, contract.endDate);
}

export function buildSmsTemplate(
  contract: Contract,
  target: ContactTarget,
  stage: NotifyStage,
): string {
  const key = `${stage}_${target}`;
  const custom = loadCustomSmsTemplates()[key];
  const templateText = custom ?? DEFAULT_SMS_TEMPLATES[key] ?? "";
  return applyTemplate(templateText, contract);
}

/* SMS URL (mobile) — 번호와 본문을 자동 입력 */
export function smsUrl(phone: string, body: string): string {
  const digits = phone.replace(/\D/g, "");
  // iOS: sms:번호&body=메시지 / Android: sms:번호?body=메시지
  // 가장 호환성 좋은 형태: sms:번호?body=인코딩
  return `sms:${digits}?body=${encodeURIComponent(body)}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/\D/g, "")}`;
}
