/**
 * 사무소 이름 — 문자 인사말·인쇄물·사이드바에 쓰는 이름 (사무소마다 다름)
 *
 * 저장 위치: /agencies/{agencyId} 문서의 officeName
 * 이름을 아직 안 정한 기존 사무소는 LEGACY_OFFICE_NAMES 로 예전과 같은 이름을 보여줌.
 */
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

/** 사무소 이름 설정 기능 이전부터 쓰던 사무소 — 이름을 직접 정하기 전까지 쓰는 기본 이름 */
const LEGACY_OFFICE_NAMES: Record<string, string> = {
  agency_ZP0FIxYM5Lh8: "미사금빛공인중개사",
};

export function resolveOfficeName(agencyId: string, stored: unknown): string {
  const s = typeof stored === "string" ? stored.trim() : "";
  return s || LEGACY_OFFICE_NAMES[agencyId] || "";
}

export async function saveOfficeName(agencyId: string, name: string): Promise<void> {
  await updateDoc(doc(db, "agencies", agencyId), { officeName: name.trim() });
}
