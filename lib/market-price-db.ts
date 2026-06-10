/**
 * 실거래 최고가 — 단지별 기록 (Firestore CRUD)
 * 경로: /agencies/{agencyId}/marketPrices/{id}
 *
 * 용도: 어머니가 단지별 실거래 최고가를 기록해두고 매물 상담 시 참고
 * - 평형/타입별로 매매·전세 최고가 + 거래일 + 메모
 */

import {
  collection, doc, setDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp, Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export interface MarketPrice {
  id: string;
  complexName: string;    // 단지명 (예: 힐스테이트 미사역 그랑파사쥬)
  area: string;           // 전용면적 (㎡) — 숫자만
  unitType: string;       // 평형/타입 (예: 84A, 59B)
  saleHigh: string;       // 매매 최고가 (만원)
  jeonseHigh: string;     // 전세 최고가 (만원)
  dealDate: string;       // 거래일 (YYYY-MM-DD)
  memo: string;
  createdAt: number;
  updatedAt?: number;
}

export function emptyMarketPrice(): MarketPrice {
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    complexName: "", area: "", unitType: "",
    saleHigh: "", jeonseHigh: "", dealDate: "",
    memo: "", createdAt: Date.now(),
  };
}

function col(agencyId: string) {
  return collection(db, "agencies", agencyId, "marketPrices");
}
function ref(agencyId: string, id: string) {
  return doc(db, "agencies", agencyId, "marketPrices", id);
}

function fromDoc(id: string, d: Record<string, unknown>): MarketPrice {
  const createdAt = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : (d.createdAt as number) || Date.now();
  return {
    id, createdAt,
    complexName: (d.complexName as string) || "",
    area:        (d.area        as string) || "",
    unitType:    (d.unitType    as string) || "",
    saleHigh:    (d.saleHigh    as string) || "",
    jeonseHigh:  (d.jeonseHigh  as string) || "",
    dealDate:    (d.dealDate    as string) || "",
    memo:        (d.memo        as string) || "",
    updatedAt:   d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : (d.updatedAt as number) || undefined,
  };
}

export function subscribeMarketPrices(agencyId: string, onChange: (list: MarketPrice[]) => void): Unsubscribe {
  // 단일 orderBy(createdAt desc) — 인덱스 불필요
  const q = query(col(agencyId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>))),
    err => { console.error("[marketPrices] subscribe 실패:", err); onChange([]); },
  );
}

export async function saveMarketPrice(agencyId: string, m: MarketPrice): Promise<void> {
  const { id, ...rest } = m;
  const payload: Record<string, unknown> = {
    ...rest,
    updatedAt: serverTimestamp(),
    createdAt: rest.createdAt || Date.now(),
  };
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  try {
    await setDoc(ref(agencyId, id), payload);
  } catch (e) {
    console.error("[saveMarketPrice] 실패:", e, "payload:", payload);
    throw e;
  }
}

export async function deleteMarketPrice(agencyId: string, id: string): Promise<void> {
  await deleteDoc(ref(agencyId, id));
}
