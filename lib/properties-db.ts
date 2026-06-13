/**
 * 내 매물 관리 — Firestore CRUD
 * 경로: /agencies/{agencyId}/properties/{propertyId}
 */

import {
  collection, doc, setDoc, deleteDoc, getDocs,
  query, orderBy, onSnapshot, serverTimestamp, Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type PropertyType = "아파트" | "오피스텔" | "빌라/다세대" | "원룸/투룸" | "상가" | "사무실" | "토지" | "기타";
export type DealType = "매매" | "전세" | "월세";
export type PropertyStatus = "active" | "closed";
/** 입주 상태 — "" 미설정 / tenant 임대중 / owner 주인거주 / vacant 공실 */
export type Occupancy = "" | "tenant" | "owner" | "vacant";
/** 정기 관리 주기 — "" 없음 / 3m·6m·12m */
export type ManageCycle = "" | "3m" | "6m" | "12m";

export interface Property {
  id: string;
  address: string;
  propertyType: PropertyType;
  dealType: DealType;
  price: string;       // 매매가 or 보증금 (만원)
  monthly: string;     // 월세 (만원)
  area: string;        // 전용면적 (㎡) — 숫자만
  unitType: string;    // 평면도 타입 (예: "84A", "C-3타입") — 면적에 잘못 입력되지 않게 분리
  dong: string;        // 동
  ho: string;          // 호수
  floor: string;       // 층 (레거시, 호환용)
  rooms: string;       // 방수
  direction: string;   // 방향
  ownerName: string;
  ownerPhone: string;
  tenantName: string;    // 임차인 이름
  tenantPhone: string;   // 임차인 연락처
  tenantDeposit: string; // 현재 임차인 보증금 (만원)
  tenantMonthly: string; // 현재 임차인 월세 (만원)
  leaseEndDate: string;  // 현재 임대차 만기일 (YYYY-MM-DD)
  // 계약 진행 정보 (계약 체결 시 입력)
  contractDate: string;    // 계약일 (YYYY-MM-DD)
  downPaymentDate: string; // 중도금일 (YYYY-MM-DD)
  balanceDate: string;     // 잔금일 (YYYY-MM-DD) — 이 날짜 지나면 만기 관리로 이동
  commission: string;      // 중개 수수료 (만원) — 월별 매출 집계용
  linkedTenantId?: string; // 손님 관리에 자동 등록된 임차인 ID
  // 입주 상태 + 정기 관리 (주인 실거주 등 만기일 없는 매물 관리용)
  occupancy: Occupancy;        // 입주 상태
  nextManageDate: string;      // 다음 관리(연락) 예정일 — 직접 지정 (YYYY-MM-DD)
  manageCycle: ManageCycle;    // 반복 주기 — 완료 시 다음 날짜 자동 계산
  manageTags: string[];        // 관리 태그 (매도의향/임대전환검토 등)
  memo: string;
  status: PropertyStatus;
  createdAt: number;
}

/** 관리 태그 프리셋 */
export const MANAGE_TAGS = ["매도의향", "임대전환검토", "장기거주", "리모델링예정", "연락주의"] as const;

/** 다음 관리일 자동 계산 — 기준일 + 주기 */
export function nextDateByCycle(fromDate: string, cycle: ManageCycle): string {
  if (!cycle || !fromDate) return "";
  const months = cycle === "3m" ? 3 : cycle === "6m" ? 6 : 12;
  const d = new Date(fromDate + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function emptyProperty(): Property {
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    address: "", propertyType: "아파트", dealType: "월세",
    price: "", monthly: "", area: "", unitType: "", dong: "", ho: "", floor: "", rooms: "",
    direction: "", ownerName: "", ownerPhone: "",
    tenantName: "", tenantPhone: "", tenantDeposit: "", tenantMonthly: "", leaseEndDate: "",
    contractDate: "", downPaymentDate: "", balanceDate: "", commission: "",
    occupancy: "", nextManageDate: "", manageCycle: "", manageTags: [],
    memo: "",
    status: "active", createdAt: Date.now(),
  };
}

/* 오늘 기준 N일 뒤 (YYYY-MM-DD) */
function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** 예시 매물 6건 — 다양한 케이스 */
export function sampleProperties(): Property[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      address: "경기도 하남시 미사강변동 1100 힐스테이트 미사역 그랑파사쥬 101동 1902호",
      propertyType: "아파트", dealType: "매매",
      price: "55000", monthly: "", area: "84", unitType: "84A", dong: "101", ho: "1902", floor: "",
      rooms: "3", direction: "남향",
      ownerName: "김국환", ownerPhone: "010-5205-1111",
      tenantName: "", tenantPhone: "", tenantDeposit: "", tenantMonthly: "", leaseEndDate: "",
      contractDate: "", downPaymentDate: "", balanceDate: "", commission: "",
      occupancy: "", nextManageDate: "", manageCycle: "", manageTags: [],
      memo: "급매 · 협의 가능",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 14,
    },
    {
      id: uid(),
      address: "경기도 하남시 미사강변동 1087 미사효성 해링턴타워 더퍼스트 101동 2717호",
      propertyType: "오피스텔", dealType: "월세",
      price: "1000", monthly: "70", area: "42", unitType: "", dong: "101", ho: "2717", floor: "",
      rooms: "1", direction: "동향",
      ownerName: "최재현", ownerPhone: "010-2480-4444",
      tenantName: "권다솜", tenantPhone: "010-9242-3333", tenantDeposit: "1000", tenantMonthly: "70",
      leaseEndDate: dateOffset(45),  // D-45 만기 임박
      contractDate: "", downPaymentDate: "", balanceDate: "", commission: "",
      occupancy: "", nextManageDate: "", manageCycle: "", manageTags: [],
      memo: "임차인 재계약 의향 확인 필요",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 365,
    },
    {
      id: uid(),
      address: "경기도 하남시 망월동 1099-1 망월동 공공주택지구 11-1 1023호",
      propertyType: "오피스텔", dealType: "전세",
      price: "22770", monthly: "", area: "29", unitType: "", dong: "11-1", ho: "1023", floor: "",
      rooms: "1", direction: "남동향",
      ownerName: "정우성", ownerPhone: "010-5033-2222",
      tenantName: "조현민", tenantPhone: "010-7924-1111", tenantDeposit: "22770", tenantMonthly: "",
      leaseEndDate: dateOffset(85),  // D-85 예고
      contractDate: "", downPaymentDate: "", balanceDate: "", commission: "",
      occupancy: "", nextManageDate: "", manageCycle: "", manageTags: [],
      memo: "묵시적 갱신 주의 — 협상 시작",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 300,
    },
    {
      id: uid(),
      address: "경기도 하남시 망월동 1100 마들렌 제9층 제910호",
      propertyType: "원룸/투룸", dealType: "월세",
      price: "500", monthly: "70", area: "23", unitType: "", dong: "", ho: "910", floor: "",
      rooms: "1", direction: "서향",
      ownerName: "정수영", ownerPhone: "010-9109-6666",
      tenantName: "", tenantPhone: "", tenantDeposit: "", tenantMonthly: "", leaseEndDate: "",
      contractDate: "", downPaymentDate: "", balanceDate: "", commission: "",
      occupancy: "", nextManageDate: "", manageCycle: "", manageTags: [],
      memo: "즉시 입주 가능",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 7,
    },
    {
      id: uid(),
      address: "경기도 하남시 미사강변동 1143-1 미사강변 오벨리스크 제6층 제101-613호",
      propertyType: "상가", dealType: "월세",
      price: "10000", monthly: "150", area: "66", unitType: "", dong: "", ho: "613", floor: "",
      rooms: "", direction: "",
      ownerName: "최령", ownerPhone: "010-5210-8888",
      tenantName: "민완규(카페)", tenantPhone: "010-5380-7777", tenantDeposit: "10000", tenantMonthly: "150",
      leaseEndDate: dateOffset(220),  // D-220 안전
      contractDate: "", downPaymentDate: "", balanceDate: "", commission: "",
      occupancy: "", nextManageDate: "", manageCycle: "", manageTags: [],
      memo: "1층 코너 / 카페 운영중",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 200,
    },
    {
      id: uid(),
      address: "경기도 하남시 미사강변동 1100 힐스테이트 미사역 그랑파사쥬 201동 1502호",
      propertyType: "아파트", dealType: "전세",
      price: "45000", monthly: "", area: "84", unitType: "84B", dong: "201", ho: "1502", floor: "",
      rooms: "3", direction: "남향",
      ownerName: "조서영", ownerPhone: "010-9205-0000",
      tenantName: "", tenantPhone: "", tenantDeposit: "", tenantMonthly: "", leaseEndDate: "",
      contractDate: "", downPaymentDate: "", balanceDate: "", commission: "",
      occupancy: "", nextManageDate: "", manageCycle: "", manageTags: [],
      memo: "거래 완료 — 입주 완료",
      status: "closed", createdAt: now - 1000 * 60 * 60 * 24 * 90,
    },
  ];
}

export async function savePropertiesBatch(agencyId: string, list: Property[]): Promise<void> {
  for (const p of list) await saveProperty(agencyId, p);
}

function col(agencyId: string) {
  return collection(db, "agencies", agencyId, "properties");
}
function ref(agencyId: string, id: string) {
  return doc(db, "agencies", agencyId, "properties", id);
}
function fromDoc(id: string, d: Record<string, unknown>): Property {
  const createdAt = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : (d.createdAt as number) || Date.now();
  return {
    id, createdAt,
    address:      (d.address      as string) || "",
    propertyType: (d.propertyType as PropertyType) || "아파트",
    dealType:     (d.dealType     as DealType) || "월세",
    price:        (d.price        as string) || "",
    monthly:      (d.monthly      as string) || "",
    area:         (d.area         as string) || "",
    unitType:     (d.unitType     as string) || "",
    dong:         (d.dong         as string) || "",
    ho:           (d.ho           as string) || "",
    floor:        (d.floor        as string) || "",
    rooms:        (d.rooms        as string) || "",
    direction:    (d.direction    as string) || "",
    ownerName:    (d.ownerName    as string) || "",
    ownerPhone:   (d.ownerPhone   as string) || "",
    tenantName:   (d.tenantName   as string) || "",
    tenantPhone:  (d.tenantPhone  as string) || "",
    tenantDeposit:(d.tenantDeposit as string) || "",
    tenantMonthly:(d.tenantMonthly as string) || "",
    leaseEndDate: (d.leaseEndDate as string) || "",
    contractDate:    (d.contractDate    as string) || "",
    downPaymentDate: (d.downPaymentDate as string) || "",
    balanceDate:     (d.balanceDate     as string) || "",
    commission:      (d.commission      as string) || "",
    linkedTenantId:  (d.linkedTenantId  as string) || undefined,
    occupancy:       (d.occupancy       as Occupancy) || "",
    nextManageDate:  (d.nextManageDate  as string) || "",
    manageCycle:     (d.manageCycle     as ManageCycle) || "",
    manageTags:      Array.isArray(d.manageTags) ? (d.manageTags as string[]) : [],
    memo:         (d.memo         as string) || "",
    status:       (d.status       as PropertyStatus) || "active",
  };
}

export function subscribeProperties(agencyId: string, onChange: (list: Property[]) => void): Unsubscribe {
  const q = query(col(agencyId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>))),
    err => {
      console.error("[properties] subscribe 실패:", err);
      onChange([]);
    },
  );
}

/** 일회성 조회 (관리자 열람용) */
export async function fetchProperties(agencyId: string): Promise<Property[]> {
  const snap = await getDocs(query(col(agencyId), orderBy("createdAt", "desc")));
  return snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function saveProperty(agencyId: string, p: Property): Promise<void> {
  const { id, ...rest } = p;
  const payload: Record<string, unknown> = { ...rest, updatedAt: serverTimestamp(), createdAt: rest.createdAt || Date.now() };
  // Firestore는 undefined 값을 거부 → 제거
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  await setDoc(ref(agencyId, id), payload);
}

export async function deleteProperty(agencyId: string, id: string): Promise<void> {
  await deleteDoc(ref(agencyId, id));
}

/**
 * Contract → Property 역변환 (재모집)
 * 만기 후 갱신 안 함 → 다시 매물로 광고 시작
 * - dealType은 type에서 매핑 (전세/월세/매매)
 * - 가격은 보증금/월세 유지
 * - 임차인 정보는 비움 (새로 모집)
 * - 만기일은 다음 계약 시 입력
 */
export function contractBackToProperty(c: {
  address: string;
  type: "전세" | "월세" | "매매";
  deposit: string;
  monthly: string;
  landlordName: string;
  landlordPhone: string;
  memo: string;
  // 물건 고유 정보 (재모집 시에도 그대로 보존)
  dong?: string;
  ho?: string;
  propertyType?: string;
  area?: string;
  unitType?: string;
  direction?: string;
  rooms?: string;
}): Property {
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    address: c.address,
    propertyType: (c.propertyType as PropertyType) || "아파트", // 만기 계약에 입력된 유형 보존
    dealType: c.type,
    price: c.deposit,
    monthly: c.monthly,
    area: c.area || "", unitType: c.unitType || "", dong: c.dong || "", ho: c.ho || "", floor: "", rooms: c.rooms || "", direction: c.direction || "",
    ownerName: c.landlordName,
    ownerPhone: c.landlordPhone,
    tenantName: "", tenantPhone: "", tenantDeposit: "", tenantMonthly: "", leaseEndDate: "",
    contractDate: "", downPaymentDate: "", balanceDate: "", commission: "",
    occupancy: "", nextManageDate: "", manageCycle: "", manageTags: [],
    memo: c.memo ? `${c.memo}\n[재모집] 만기관리에서 복귀` : "[재모집] 만기관리에서 복귀",
    status: "active", createdAt: Date.now(),
  };
}
