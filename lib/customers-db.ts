/**
 * 손님(Customer) Firestore CRUD
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
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Customer, ShownProperty, CustomerSide, DealKind, CustomerStatus } from "@/app/customers/customer-types";

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
  };
}

/** 실시간 구독 — 후속 연락 일정 빠른 순 (Infinity는 뒤로) */
export function subscribeCustomers(
  agencyId: string,
  onChange: (customers: Customer[]) => void,
): Unsubscribe {
  // Firestore는 한 쿼리에 다중 정렬 한계가 있으므로 클라이언트에서 한 번 더 정렬
  const q = query(customersCol(agencyId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => fromDoc(d.id, d.data()));
    onChange(list);
  });
}

export async function saveCustomer(agencyId: string, c: Customer): Promise<void> {
  const { id, ...rest } = c;
  await setDoc(customerDoc(agencyId, id), {
    ...rest,
    updatedAt: serverTimestamp(),
    createdAt: rest.createdAt || Date.now(),
  });
}

export async function saveCustomersBatch(agencyId: string, customers: Customer[]): Promise<void> {
  for (const c of customers) {
    await saveCustomer(agencyId, c);
  }
}

export async function deleteCustomer(agencyId: string, customerId: string): Promise<void> {
  await deleteDoc(customerDoc(agencyId, customerId));
}
