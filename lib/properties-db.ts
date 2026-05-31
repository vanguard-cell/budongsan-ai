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
  floor: string;       // 층
  rooms: string;       // 방수
  direction: string;   // 방향
  ownerName: string;
  ownerPhone: string;
  memo: string;
  status: PropertyStatus;
  createdAt: number;
}

export function emptyProperty(): Property {
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    address: "", propertyType: "아파트", dealType: "월세",
    price: "", monthly: "", area: "", floor: "", rooms: "",
    direction: "", ownerName: "", ownerPhone: "", memo: "",
    status: "active", createdAt: Date.now(),
  };
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
    floor:        (d.floor        as string) || "",
    rooms:        (d.rooms        as string) || "",
    direction:    (d.direction    as string) || "",
    ownerName:    (d.ownerName    as string) || "",
    ownerPhone:   (d.ownerPhone   as string) || "",
    memo:         (d.memo         as string) || "",
    status:       (d.status       as PropertyStatus) || "active",
  };
}

export function subscribeProperties(agencyId: string, onChange: (list: Property[]) => void): Unsubscribe {
  const q = query(col(agencyId), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => onChange(snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>))));
}

export async function saveProperty(agencyId: string, p: Property): Promise<void> {
  const { id, ...rest } = p;
  await setDoc(ref(agencyId, id), { ...rest, updatedAt: serverTimestamp(), createdAt: rest.createdAt || Date.now() });
}

export async function deleteProperty(agencyId: string, id: string): Promise<void> {
  await deleteDoc(ref(agencyId, id));
}
