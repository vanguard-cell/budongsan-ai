/**
 * 고객(Customer) Firestore CRUD
 *
 * 경로: /agencies/{agencyId}/customers/{customerId}
 *
 * Security Rules는 계약(contracts)과 동일하게 사무실 멤버만 접근 가능
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  updateDoc,
  arrayUnion,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Customer, CustomerEvent, ShownProperty, CustomerSide, DealKind, CustomerStatus } from "@/app/customers/customer-types";
import { uid as newCustomerId } from "@/app/customers/customer-types";

function customersCol(agencyId: string) {
  return collection(db, "agencies", agencyId, "customers");
}

function customerDoc(agencyId: string, customerId: string) {
  return doc(db, "agencies", agencyId, "customers", customerId);
}

function fromDoc(id: string, data: Record<string, unknown>): Customer {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt as number) || Date.now();
  return {
    id,
    name:           (data.name as string) || "",
    phone:          (data.phone as string) || "",
    side:           (data.side as CustomerSide) || "buyer",
    dealKind:       (data.dealKind as DealKind) || "live",
    vip:            Boolean(data.vip),
    budget:         (data.budget as string) || "",
    preferredArea:  (data.preferredArea as string) || "",
    moveInDate:     (data.moveInDate as string) || "",
    status:         (data.status as CustomerStatus) || "active",
    nextFollowUp:   (data.nextFollowUp as string) || "",
    shownProperties: Array.isArray(data.shownProperties) ? (data.shownProperties as ShownProperty[]) : [],
    memo:           (data.memo as string) || "",
    createdAt,
    history:        Array.isArray(data.history) ? (data.history as CustomerEvent[]) : [],
    stage:          (data.stage as Customer["stage"]) || undefined,
  };
}

/** 고객 여정 이벤트 1건 추가 (arrayUnion — 기존 이력 보존) */
export async function logCustomerEvent(
  agencyId: string,
  customerId: string,
  ev: Omit<CustomerEvent, "at"> & { at?: number },
): Promise<void> {
  const event: CustomerEvent = {
    at: ev.at ?? Date.now(),
    by: ev.by,
    kind: ev.kind,
    text: ev.text,
    ...(ev.reaction ? { reaction: ev.reaction } : {}),
    ...(ev.reason ? { reason: ev.reason } : {}),
  };
  try {
    await updateDoc(customerDoc(agencyId, customerId), { history: arrayUnion(event) });
  } catch (e) {
    console.error("[logCustomerEvent] 실패:", e);
  }
}

/** 여정 이력 통째로 교체 (수정·삭제용 — 인덱스 기반 read-modify-write) */
export async function setCustomerHistory(
  agencyId: string,
  customerId: string,
  history: CustomerEvent[],
): Promise<void> {
  await updateDoc(customerDoc(agencyId, customerId), { history });
}

/** 실시간 구독 — 후속 연락 일정 빠른 순 (Infinity는 뒤로) */
export function subscribeCustomers(
  agencyId: string,
  onChange: (customers: Customer[]) => void,
): Unsubscribe {
  // Firestore는 한 쿼리에 다중 정렬 한계가 있으므로 클라이언트에서 한 번 더 정렬
  const q = query(customersCol(agencyId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(d => fromDoc(d.id, d.data()));
      onChange(list);
    },
    err => {
      console.error("[customers] subscribe 실패:", err);
      onChange([]);
    },
  );
}

export async function saveCustomer(agencyId: string, c: Customer): Promise<void> {
  const { id, ...rest } = c;
  const payload: Record<string, unknown> = {
    ...rest,
    updatedAt: serverTimestamp(),
    createdAt: rest.createdAt || Date.now(),
  };
  // Firestore는 undefined 값을 거부 → 제거 (다른 DB와 일관)
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  await setDoc(customerDoc(agencyId, id), payload);
}

export async function saveCustomersBatch(agencyId: string, customers: Customer[]): Promise<void> {
  for (const c of customers) {
    await saveCustomer(agencyId, c);
  }
}

export async function deleteCustomer(agencyId: string, customerId: string): Promise<void> {
  await deleteDoc(customerDoc(agencyId, customerId));
}

/** 전화번호 정규화 — 숫자만 남김 */
function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "");
}

/**
 * 임차인 정보로 고객 관리에 자동 등록 또는 기존 고객 매칭
 * - 전화번호 기준 중복 체크
 * - 있으면: 기존 고객 ID 반환, shownProperties에 매물 주소 추가
 * - 없으면: 신규 고객 생성 후 ID 반환
 *
 * @returns 고객 ID (linkedTenantId로 매물에 저장)
 */
export async function upsertTenantAsCustomer(
  agencyId: string,
  args: {
    name: string;
    phone: string;
    propertyAddress: string;
    contractDate?: string;
  },
): Promise<string | null> {
  const { name, phone, propertyAddress, contractDate } = args;
  // 임차인 정보 없으면 등록 스킵
  if (!name && !phone) return null;

  const normPhone = normalizePhone(phone);
  const shownAt = contractDate || new Date().toISOString().slice(0, 10);
  const newShown: ShownProperty = {
    address: propertyAddress,
    shownAt,
    reaction: "positive",
    note: "계약 체결 (매물 등록 시 자동 추가)",
  };

  // 기존 고객 중복 체크 (전화번호 기준)
  if (normPhone) {
    const snap = await getDocs(customersCol(agencyId));
    for (const docSnap of snap.docs) {
      const existing = fromDoc(docSnap.id, docSnap.data());
      if (normalizePhone(existing.phone) === normPhone) {
        // 이미 같은 매물이 shownProperties에 있는지 확인
        const already = existing.shownProperties.some(s => s.address === propertyAddress);
        const merged: Customer = {
          ...existing,
          // 매칭 상태로 (계약 체결된 임차인 — 만기까지 관리 대상)
          status: existing.status === "closed" || existing.status === "lost" ? "matched" : existing.status,
          shownProperties: already ? existing.shownProperties : [...existing.shownProperties, newShown],
        };
        await saveCustomer(agencyId, merged);
        return existing.id;
      }
    }
  }

  // 신규 고객 생성 (계약 체결된 임차인 — 매칭 상태로)
  const newCustomer: Customer = {
    id: newCustomerId(),
    name,
    phone,
    side: "tenant",
    dealKind: "live",
    vip: false,
    budget: "",
    preferredArea: "",
    moveInDate: contractDate || "",
    status: "matched",   // 매칭 = "전체" 필터에 보임. closed였을 땐 "완료" 탭에서만 보였음
    nextFollowUp: "",
    shownProperties: [newShown],
    memo: "매물 등록 시 자동 생성된 고객 (계약 체결)",
    createdAt: Date.now(),
  };
  await saveCustomer(agencyId, newCustomer);
  return newCustomer.id;
}
