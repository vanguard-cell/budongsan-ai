/**
 * 사무소 데이터 백업·복원 (JSON 파일)
 *
 * - 백업: 만기 계약·매물·매수자·스케줄·실거래·고객명단 + 사무소 설정(내 단지 목록·부동산 이름)을 원본 그대로 파일로 내려받기
 * - 복원: 백업 파일의 문서를 같은 id 로 다시 저장 (지금 있는 데이터는 지우지 않음 — 지워진 것·바뀐 것만 되살아남)
 * - 날짜(Timestamp)는 {"__ts": 밀리초} 로 바꿔 저장했다가 복원 때 되돌림
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export const BACKUP_COLLECTIONS = ["contracts", "properties", "customers", "schedules", "marketPrices", "propertyTrash", "roster"] as const;
export const BACKUP_LABELS: Record<(typeof BACKUP_COLLECTIONS)[number], string> = {
  contracts: "만기 계약",
  properties: "매물",
  customers: "매수자",
  schedules: "스케줄",
  marketPrices: "실거래",
  propertyTrash: "지운 매물 보관함",
  roster: "고객명단",
};
/** 사무소 문서에서 백업·복원하는 설정 필드 (owner·members 같은 권한 필드는 건드리지 않음) */
const AGENCY_FIELDS = ["myComplexes", "officeName"] as const;

const LAST_BACKUP_KEY = "budongsan_last_backup_at";

export interface BackupFile {
  app: "budongsan-ai";
  version: 1;
  agencyId: string;
  createdAt: number;
  agency: Record<string, unknown>;
  collections: Record<string, Record<string, unknown>>;   // 컬렉션 → { 문서 id → 데이터 }
}

function encode(v: unknown): unknown {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}

function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.__ts === "number" && Object.keys(o).length === 1) return Timestamp.fromMillis(o.__ts);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

/** 사무소 전체 데이터를 읽어 백업 객체로 */
export async function buildBackup(agencyId: string): Promise<BackupFile> {
  const collections: BackupFile["collections"] = {};
  for (const name of BACKUP_COLLECTIONS) {
    // 고객명단은 새로 생긴 곳이라 보안 규칙 반영 전이면 읽기가 막힘 → 그때는 빼고 백업 (나머지 백업은 그대로)
    const snap = await getDocs(collection(db, "agencies", agencyId, name)).catch(e => {
      if (name === "roster") { console.warn("[backup] 고객명단 읽기 실패 — 빼고 백업:", e); return null; }
      throw e;
    });
    collections[name] = snap ? Object.fromEntries(snap.docs.map(d => [d.id, encode(d.data())])) : {};
  }
  const agencySnap = await getDoc(doc(db, "agencies", agencyId));
  const a = agencySnap.data() || {};
  const agency = Object.fromEntries(AGENCY_FIELDS.filter(k => k in a).map(k => [k, encode(a[k])]));
  return { app: "budongsan-ai", version: 1, agencyId, createdAt: Date.now(), agency, collections };
}

/** 백업 객체를 파일로 내려받기 */
export function downloadBackup(b: BackupFile) {
  const d = new Date(b.createdAt);
  const p = (n: number) => String(n).padStart(2, "0");
  const name = `부동산백업_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  try { localStorage.setItem(LAST_BACKUP_KEY, String(b.createdAt)); } catch { /* 저장 불가 환경은 무시 */ }
}

/** 백업 만들어서 바로 내려받기 — 내려받은 백업 반환 */
export async function backupNow(agencyId: string): Promise<BackupFile> {
  const b = await buildBackup(agencyId);
  downloadBackup(b);
  return b;
}

export function lastBackupAt(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function countBackup(b: BackupFile): Record<string, number> {
  return Object.fromEntries(BACKUP_COLLECTIONS.map(n => [n, Object.keys(b.collections[n] || {}).length]));
}

/** 파일 내용을 백업으로 해석 — 형식이 다르면 오류 */
export function parseBackup(text: string): BackupFile {
  const b = JSON.parse(text) as BackupFile;
  if (b?.app !== "budongsan-ai" || b.version !== 1 || typeof b.collections !== "object") {
    throw new Error("이 앱에서 받은 백업 파일이 아닙니다.");
  }
  return b;
}

/** 백업 파일 내용을 사무소에 다시 저장 (같은 id 는 백업 내용으로 덮어씀, 백업에 없는 지금 데이터는 그대로) */
export async function restoreBackup(agencyId: string, b: BackupFile): Promise<number> {
  const writes: { path: string[]; data: Record<string, unknown> }[] = [];
  for (const name of BACKUP_COLLECTIONS) {
    for (const [id, data] of Object.entries(b.collections[name] || {})) {
      writes.push({ path: ["agencies", agencyId, name, id], data: decode(data) as Record<string, unknown> });
    }
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + 400)) {
      const [c0, c1, c2, c3] = w.path;
      batch.set(doc(db, c0, c1, c2, c3), w.data);
    }
    await batch.commit();
  }
  const agencyPatch = Object.fromEntries(
    AGENCY_FIELDS.filter(k => b.agency && k in b.agency).map(k => [k, decode(b.agency[k])]),
  );
  if (Object.keys(agencyPatch).length) await updateDoc(doc(db, "agencies", agencyId), agencyPatch);
  return writes.length;
}

/**
 * 한꺼번에 지우기 전 안전장치 — 백업 파일을 먼저 내려받고, '삭제'를 직접 입력해야 진행
 * @returns 진행해도 되면 true
 */
export async function confirmBulkDelete(agencyId: string, what: string, count: number): Promise<boolean> {
  if (count === 0) return false;
  const typed = window.prompt(
    `⚠️ ${what} ${count}건을 모두 지웁니다.\n` +
    `지우기 전에 지금 데이터를 백업 파일로 먼저 내려받아요.\n\n` +
    `정말 진행하려면 아래 칸에 '삭제' 라고 입력하세요.`,
  );
  if (typed?.trim() !== "삭제") {
    if (typed !== null) alert("'삭제'라고 입력하지 않아 취소했어요. 데이터는 그대로예요.");
    return false;
  }
  try {
    await backupNow(agencyId);
  } catch (e) {
    console.error("[backup] 삭제 전 백업 실패:", e);
    alert("백업 파일을 만들지 못해서 삭제를 멈췄어요. 데이터는 그대로예요.");
    return false;
  }
  return true;
}
