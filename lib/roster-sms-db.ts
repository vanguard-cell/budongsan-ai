/**
 * 고객명단 문자 문구 — 사무소 전체(모든 기기)에서 같이 쓰도록 서버에 저장 (건의 #201)
 * 경로: /agencies/{agencyId}/settings/rosterSms  { templates: { [단지종류]: 문구 } }
 */
import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";

const ref = (agencyId: string) => doc(db, "agencies", agencyId, "settings", "rosterSms");

export function subscribeRosterSms(agencyId: string, cb: (t: Record<string, string>) => void): Unsubscribe {
  return onSnapshot(ref(agencyId), snap => {
    const t = snap.exists() ? snap.data().templates : null;
    cb(t && typeof t === "object" ? (t as Record<string, string>) : {});
  }, () => { /* 읽기 실패 시 이 기기 저장분을 계속 사용 */ });
}

export async function saveRosterSmsRemote(agencyId: string, templates: Record<string, string>): Promise<void> {
  await setDoc(ref(agencyId), { templates, updatedAt: Date.now() });
}
