/**
 * 내 매물 관리 — Firestore CRUD
 * 경로: /agencies/{agencyId}/properties/{propertyId}
 */

import {
  collection, doc, setDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp, Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type PropertyType = "아파트" | "오피스텔" | "빌라/다세대" | "원룸/투룸" | "상가" | "사무실" | "토지" | "기타";
export type DealType = "매매" | "전세" | "월세";
export type PropertyStatus = "active" | "closed";

export interface Property {
  id: string;
  address: string;
  propertyType: PropertyType;
  dealType: DealType;
  price: string;       // 매매가 or 보증금 (만원)
  monthly: string;     // 월세 (만원)
  area: string;        // 전용면적 (㎡)
  dong: string;        // 동
  ho: string;          // 호수
  floor: string;       // 층 (레거시, 호환용)
  rooms: string;       // 방수
  direction: string;   // 방향
  ownerName: string;
  ownerPhone: string;
  tenantName: string;    // 임차인 이름
  tenantPhone: string;   // 임차인 연락처
  leaseEndDate: string;  // 현재 임대차 만기일 (YYYY-MM-DD)
  memo: string;
  status: PropertyStatus;
  createdAt: number;
}

export function emptyProperty(): Property {
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    address: "", propertyType: "아파트", dealType: "월세",
    price: "", monthly: "", area: "", dong: "", ho: "", floor: "", rooms: "",
    direction: "", ownerName: "", ownerPhone: "",
    tenantName: "", tenantPhone: "", leaseEndDate: "", memo: "",
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
      price: "55000", monthly: "", area: "84", dong: "101", ho: "1902", floor: "",
      rooms: "3", direction: "남향",
      ownerName: "김국환", ownerPhone: "010-5205-1111",
      tenantName: "", tenantPhone: "", leaseEndDate: "",
      memo: "급매 · 협의 가능",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 14,
    },
    {
      id: uid(),
      address: "경기도 하남시 미사강변동 1087 미사효성 해링턴타워 더퍼스트 101동 2717호",
      propertyType: "오피스텔", dealType: "월세",
      price: "1000", monthly: "70", area: "42", dong: "101", ho: "2717", floor: "",
      rooms: "1", direction: "동향",
      ownerName: "최재현", ownerPhone: "010-2480-4444",
      tenantName: "권다솜", tenantPhone: "010-9242-3333",
      leaseEndDate: dateOffset(45),  // D-45 만기 임박
      memo: "임차인 재계약 의향 확인 필요",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 365,
    },
    {
      id: uid(),
      address: "경기도 하남시 망월동 1099-1 망월동 공공주택지구 11-1 1023호",
      propertyType: "오피스텔", dealType: "전세",
      price: "22770", monthly: "", area: "29", dong: "11-1", ho: "1023", floor: "",
      rooms: "1", direction: "남동향",
      ownerName: "정우성", ownerPhone: "010-5033-2222",
      tenantName: "조현민", tenantPhone: "010-7924-1111",
      leaseEndDate: dateOffset(85),  // D-85 예고
      memo: "묵시적 갱신 주의 — 협상 시작",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 300,
    },
    {
      id: uid(),
      address: "경기도 하남시 망월동 1100 마들렌 제9층 제910호",
      propertyType: "원룸/투룸", dealType: "월세",
      price: "500", monthly: "70", area: "23", dong: "", ho: "910", floor: "",
      rooms: "1", direction: "서향",
      ownerName: "정수영", ownerPhone: "010-9109-6666",
      tenantName: "", tenantPhone: "", leaseEndDate: "",
      memo: "즉시 입주 가능",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 7,
    },
    {
      id: uid(),
      address: "경기도 하남시 미사강변동 1143-1 미사강변 오벨리스크 제6층 제101-613호",
      propertyType: "상가", dealType: "월세",
      price: "10000", monthly: "150", area: "66", dong: "", ho: "613", floor: "",
      rooms: "", direction: "",
      ownerName: "최령", ownerPhone: "010-5210-8888",
      tenantName: "민완규(카페)", tenantPhone: "010-5380-7777",
      leaseEndDate: dateOffset(220),  // D-220 안전
      memo: "1층 코너 / 카페 운영중",
      status: "active", createdAt: now - 1000 * 60 * 60 * 24 * 200,
    },
    {
      id: uid(),
      address: "경기도 하남시 미사강변동 1100 힐스테이트 미사역 그랑파사쥬 201동 1502호",
      propertyType: "아파트", dealType: "전세",
      price: "45000", monthly: "", area: "84", dong: "201", ho: "1502", floor: "",
      rooms: "3", direction: "남향",
      ownerName: "조서영", ownerPhone: "010-9205-0000",
      tenantName: "", tenantPhone: "", leaseEndDate: "",
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
    dong:         (d.dong         as string) || "",
    ho:           (d.ho           as string) || "",
    floor:        (d.floor        as string) || "",
    rooms:        (d.rooms        as string) || "",
    direction:    (d.direction    as string) || "",
    ownerName:    (d.ownerName    as string) || "",
    ownerPhone:   (d.ownerPhone   as string) || "",
    tenantName:   (d.tenantName   as string) || "",
    tenantPhone:  (d.tenantPhone  as string) || "",
    leaseEndDate: (d.leaseEndDate as string) || "",
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

export async function saveProperty(agencyId: string, p: Property): Promise<void> {
  const { id, ...rest } = p;
  await setDoc(ref(agencyId, id), { ...rest, updatedAt: serverTimestamp(), createdAt: rest.createdAt || Date.now() });
}

export async function deleteProperty(agencyId: string, id: string): Promise<void> {
  await deleteDoc(ref(agencyId, id));
}
