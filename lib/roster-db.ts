/**
 * 고객명단(세대 명부) — 매물관리·만기관리 어디에도 없는 세대를 담는 곳 (건의 #143)
 *
 * 경로: /agencies/{agencyId}/roster/{unitId}
 *
 * 고객명단 화면은 매물·만기·명부 세 곳을 동·호수로 묶어 한 표로 보여준다.
 * 이 컬렉션에는 "명부에만 있는 세대"만 저장한다 (매물·만기 데이터는 복사하지 않음).
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { sharedSubscribe } from "./live";
import { stripUnit } from "./address";

export interface RosterUnit {
  id: string;
  complex: string;      // 단지 이름 (예: "힐스테이트미사역그랑파사쥬 12블럭(오피스텔)")
  dong: string;         // 동 (숫자만, 예: "1201")
  ho: string;           // 호수 (예: "401")
  unitType: string;     // 평면도 타입 (A/B/PB)
  area: string;         // 전용면적 ㎡
  direction: string;    // 향
  rooms: string;        // 방수
  uniqueNo: string;     // 건축물대장 고유번호 (있으면)
  ownerName: string;
  ownerPhone: string;
  tenantName: string;
  tenantPhone: string;
  leaseEndDate: string; // YYYY-MM-DD
  memo: string;
  createdAt: number;
}

/** 표에서 바로 고칠 수 있는 칸 */
export type RosterEditField = "dong" | "ho" | "unitType" | "area" | "direction" | "ownerName" | "ownerPhone" | "tenantName" | "tenantPhone" | "leaseEndDate" | "memo";

export function emptyRosterUnit(): RosterUnit {
  return {
    id: "", complex: "", dong: "", ho: "", unitType: "", area: "", direction: "", rooms: "", uniqueNo: "",
    ownerName: "", ownerPhone: "", tenantName: "", tenantPhone: "", leaseEndDate: "", memo: "", createdAt: 0,
  };
}

/** 단지 이름 비교용 — 띄어쓰기 차이("12블럭" / " 12블럭")를 무시 */
export const complexKey = (name: string): string => (name || "").replace(/\s+/g, "");

/** 매물·만기 주소에서 단지 이름만 (동·호 떼기) */
export const complexOf = (address: string, dong?: string, ho?: string): string => stripUnit(address || "", dong, ho);

/** 세대 키 — 같은 단지·동·호면 같은 세대 */
export const unitKey = (complex: string, dong: string, ho: string): string =>
  `${complexKey(complex)}|${(dong || "").replace(/\D/g, "")}|${(ho || "").trim()}`;

/** 주소·동/호 칸에서 동·호수 꺼내기 — 동/호 칸이 비어 있으면 주소의 "1201동 401호"에서 */
export function dongHoOf(address: string, dong?: string, ho?: string): { dong: string; ho: string } {
  let d = (dong || "").replace(/\D/g, "");
  let h = (ho || "").trim().replace(/호$/, "");
  if (!d) { const m = (address || "").match(/(\d+)\s*동/); if (m) d = m[1]; }
  if (!h) { const m = (address || "").match(/((?:비|지하|B)?\d+)\s*호/); if (m) h = m[1]; }
  return { dong: d, ho: h };
}

function col(agencyId: string) {
  return collection(db, "agencies", agencyId, "roster");
}

function fromDoc(id: string, d: Record<string, unknown>): RosterUnit {
  const createdAt = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : (d.createdAt as number) || 0;
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  return {
    id, createdAt,
    complex: s("complex"), dong: s("dong"), ho: s("ho"), unitType: s("unitType"), area: s("area"),
    direction: s("direction"), rooms: s("rooms"), uniqueNo: s("uniqueNo"),
    ownerName: s("ownerName"), ownerPhone: s("ownerPhone"), tenantName: s("tenantName"), tenantPhone: s("tenantPhone"),
    leaseEndDate: s("leaseEndDate"), memo: s("memo"),
  };
}

export function subscribeRoster(agencyId: string, onChange: (list: RosterUnit[]) => void): Unsubscribe {
  return sharedSubscribe(`roster:${agencyId}`, (onChange: (list: RosterUnit[]) => void, failed: (empty: RosterUnit[]) => void) => {
    return onSnapshot(
      col(agencyId),
      snap => onChange(snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>))),
      err => {
        console.error("[roster] subscribe 실패:", err);
        failed([]);
      },
    );
  }, onChange);
}

/** 한 칸만 고치기 (표에서 바로 쓰기) */
export async function updateRosterField(agencyId: string, id: string, field: RosterEditField, value: string): Promise<void> {
  await setDoc(doc(col(agencyId), id), { [field]: value, updatedAt: serverTimestamp() }, { merge: true });
}

/** 이미 있는 세대에 고유번호만 채우기 */
export async function setRosterUniqueNo(agencyId: string, id: string, uniqueNo: string): Promise<void> {
  await setDoc(doc(col(agencyId), id), { uniqueNo, updatedAt: serverTimestamp() }, { merge: true });
}

/** 여러 세대 한꺼번에 추가 (엑셀 올리기) — 400개씩 나눠 저장 */
export async function addRosterUnits(agencyId: string, list: Omit<RosterUnit, "id">[]): Promise<number> {
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    for (const u of list.slice(i, i + 400)) {
      batch.set(doc(col(agencyId)), { ...u, createdAt: u.createdAt || Date.now(), updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
  return list.length;
}

export async function deleteRosterUnit(agencyId: string, id: string): Promise<void> {
  await deleteDoc(doc(col(agencyId), id));
}

type KeepSrc = { address: string; dong?: string; ho?: string; unitType?: string; area?: string; direction?: string; rooms?: string; uniqueNo?: string; landlordName?: string; landlordPhone?: string; ownerName?: string; ownerPhone?: string; tenantName?: string; tenantPhone?: string; endDate?: string; leaseEndDate?: string };

/**
 * 만기·매물에서 지우는 세대를 고객명단에 남겨 둔다 (건의 #198).
 * 명단에 같은 단지·동·호수가 이미 있으면 새로 만들지 않고, 비어 있는 칸(이름·연락처·만기일 등)만 채워 넣는다.
 */
export async function keepUnitsInRoster(agencyId: string, list: KeepSrc[]): Promise<void> {
  const snap = await getDocs(col(agencyId));
  const have = new Map<string, { id: string; v: Partial<RosterUnit> }>();
  for (const d of snap.docs) {
    const v = d.data() as Partial<RosterUnit>;
    have.set(unitKey(String(v.complex || ""), String(v.dong || ""), String(v.ho || "")), { id: d.id, v });
  }
  const add: Omit<RosterUnit, "id">[] = [];
  const fills: { id: string; data: Record<string, string> }[] = [];
  for (const c of list) {
    const complex = complexOf(c.address, c.dong, c.ho);
    const dh = dongHoOf(c.address, c.dong, c.ho);
    if (!complex || !dh.ho) continue;
    const key = unitKey(complex, dh.dong, dh.ho);
    const src: Record<string, string> = {
      unitType: c.unitType || "", area: c.area || "", direction: c.direction || "", rooms: c.rooms || "", uniqueNo: c.uniqueNo || "",
      ownerName: c.landlordName || c.ownerName || "", ownerPhone: c.landlordPhone || c.ownerPhone || "",
      tenantName: c.tenantName || "", tenantPhone: c.tenantPhone || "",
      leaseEndDate: c.endDate || c.leaseEndDate || "",
    };
    const ex = have.get(key);
    if (ex) {
      const data: Record<string, string> = {};
      for (const [k, val] of Object.entries(src)) {
        const cur = (ex.v as Record<string, unknown>)[k];
        if (val && !(typeof cur === "string" && cur.trim())) { data[k] = val; (ex.v as Record<string, unknown>)[k] = val; }
      }
      if (ex.id && Object.keys(data).length) fills.push({ id: ex.id, data });
      continue;
    }
    have.set(key, { id: "", v: { ...src } as Partial<RosterUnit> });
    add.push({ ...emptyRosterUnit(), complex, dong: dh.dong, ho: dh.ho, ...src, createdAt: Date.now() } as Omit<RosterUnit, "id">);
  }
  for (const f of fills) await setDoc(doc(col(agencyId), f.id), { ...f.data, updatedAt: serverTimestamp() }, { merge: true });
  if (add.length) await addRosterUnits(agencyId, add);
}

export async function keepUnitInRoster(agencyId: string, c: KeepSrc): Promise<void> {
  await keepUnitsInRoster(agencyId, [c]);
}
