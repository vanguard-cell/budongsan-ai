/**
 * 계약 데이터 Firestore CRUD
 *
 * 경로: /agencies/{agencyId}/contracts/{contractId}
 *
 * 보안: Security Rules가 agency 멤버만 접근 가능하도록 강제
 */

import {
  collection,
  doc,
  getDocs,
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
import type { Contract, ContractType } from "@/app/expiry/contracts";
import type { Property } from "./properties-db";
import { deleteProperty } from "./properties-db";

function contractsCol(agencyId: string) {
  return collection(db, "agencies", agencyId, "contracts");
}

function contractDoc(agencyId: string, contractId: string) {
  return doc(db, "agencies", agencyId, "contracts", contractId);
}

/** Firestore → Contract (Timestamp 처리) */
function fromDoc(id: string, data: Record<string, unknown>): Contract {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt as number) || Date.now();
  return {
    id,
    address: (data.address as string) || "",
    type: (data.type as Contract["type"]) || "월세",
    deposit: (data.deposit as string) || "",
    monthly: (data.monthly as string) || "",
    startDate: (data.startDate as string) || "",
    endDate: (data.endDate as string) || "",
    dong: (data.dong as string) || undefined,
    ho:   (data.ho   as string) || undefined,
    tenantName: (data.tenantName as string) || "",
    tenantPhone: (data.tenantPhone as string) || "",
    landlordName: (data.landlordName as string) || "",
    landlordPhone: (data.landlordPhone as string) || "",
    contractDate:     (data.contractDate     as string) || undefined,
    downPaymentDate:  (data.downPaymentDate  as string) || undefined,
    balanceDate:      (data.balanceDate      as string) || undefined,
    linkedCustomerId: (data.linkedCustomerId as string) || undefined,
    fromPropertyId:   (data.fromPropertyId   as string) || undefined,
    memo: (data.memo as string) || "",
    status: (data.status as Contract["status"]) || "active",
    createdAt,
  };
}

/** 전체 조회 (1회) */
export async function fetchContracts(agencyId: string): Promise<Contract[]> {
  const q = query(contractsCol(agencyId), orderBy("endDate", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => fromDoc(d.id, d.data()));
}

/** 실시간 구독 — PC↔폰 자동 동기화 */
export function subscribeContracts(
  agencyId: string,
  onChange: (contracts: Contract[]) => void,
): Unsubscribe {
  const q = query(contractsCol(agencyId), orderBy("endDate", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map(d => fromDoc(d.id, d.data())));
    },
    err => {
      console.error("[contracts] subscribe 실패:", err);
      onChange([]);
    },
  );
}

/** 추가/수정 (upsert) — Firestore undefined 거부 방어 */
export async function saveContract(agencyId: string, c: Contract): Promise<void> {
  const { id, ...rest } = c;
  const payload: Record<string, unknown> = {
    ...rest,
    updatedAt: serverTimestamp(),
    createdAt: rest.createdAt || Date.now(),
  };
  // Firestore는 undefined 거부 → optional 필드(dong/ho/contractDate 등) 정리
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  try {
    await setDoc(contractDoc(agencyId, id), payload);
  } catch (e) {
    console.error("[saveContract] 실패:", e, "payload:", payload);
    throw e;
  }
}

/** 다건 일괄 추가 (예시 데이터·엑셀 업로드용) */
export async function saveContractsBatch(agencyId: string, contracts: Contract[]): Promise<void> {
  // Firestore batch는 500건 제한, 일반 사용 범위라 그냥 직렬 처리
  for (const c of contracts) {
    await saveContract(agencyId, c);
  }
}

/** 삭제 */
export async function deleteContract(agencyId: string, contractId: string): Promise<void> {
  await deleteDoc(contractDoc(agencyId, contractId));
}

/**
 * Property → Contract 변환
 * 잔금일 경과 또는 사용자가 "만기로 보내기" 누르면 호출
 */
export function propertyToContract(p: Property, linkedCustomerId?: string): Contract {
  const type: ContractType =
    p.dealType === "매매" ? "매매"
    : p.dealType === "전세" ? "전세"
    : "월세";

  return {
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    address: p.address,
    dong: p.dong || undefined,
    ho: p.ho || undefined,
    type,
    deposit: p.price,
    monthly: p.monthly,
    startDate: p.contractDate || "",
    endDate: p.leaseEndDate || "",
    tenantName: p.tenantName,
    tenantPhone: p.tenantPhone,
    landlordName: p.ownerName,
    landlordPhone: p.ownerPhone,
    contractDate: p.contractDate || undefined,
    downPaymentDate: p.downPaymentDate || undefined,
    balanceDate: p.balanceDate || undefined,
    linkedCustomerId,
    fromPropertyId: p.id,
    memo: p.memo,
    status: "active",
    createdAt: Date.now(),
  };
}

/**
 * 매물 → 만기 관리 이전 (잔금 완료된 매물)
 * 1. Property를 Contract로 변환하여 저장
 * 2. 원본 Property 삭제
 */
export async function moveToContract(
  agencyId: string,
  property: Property,
  linkedCustomerId?: string,
): Promise<Contract> {
  const contract = propertyToContract(property, linkedCustomerId ?? property.linkedTenantId);
  await saveContract(agencyId, contract);
  await deleteProperty(agencyId, property.id);
  return contract;
}

/** localStorage → Firestore 마이그레이션 (첫 로그인 시 1회) */
export async function migrateFromLocalStorage(agencyId: string): Promise<number> {
  if (typeof window === "undefined") return 0;
  const MIGRATED_KEY = `budongsan_contracts_migrated_${agencyId}`;
  if (localStorage.getItem(MIGRATED_KEY)) return 0;

  const raw = localStorage.getItem("budongsan_contracts");
  if (!raw) {
    localStorage.setItem(MIGRATED_KEY, "1");
    return 0;
  }

  try {
    const local: Contract[] = JSON.parse(raw);
    if (!Array.isArray(local) || local.length === 0) {
      localStorage.setItem(MIGRATED_KEY, "1");
      return 0;
    }

    // 이미 Firestore에 있는 ID는 중복 등록되니까 그대로 사용 (setDoc은 덮어쓰기)
    await saveContractsBatch(agencyId, local);
    localStorage.setItem(MIGRATED_KEY, "1");

    // 마이그레이션 성공해도 localStorage 원본은 백업으로 보존
    // 사용자가 명시적으로 지우기 전까지 안전망 역할
    return local.length;
  } catch (e) {
    console.error("localStorage 마이그레이션 실패:", e);
    return 0;
  }
}
