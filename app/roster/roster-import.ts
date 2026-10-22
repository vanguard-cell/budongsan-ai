/**
 * 세대 명부 엑셀 → 고객명단 세대 목록 (건의 #143)
 *
 * 매물 엑셀 올리기와 달리 명부 양식에 맞춰 칸을 찾는다:
 *  - 제목이 빈 칸도 버리지 않음 (전용면적 옆 제목 없는 A/B 칸 = 타입)
 *  - "1201-401" 처럼 동-호가 한 칸에 있어도 나눠서 읽음
 *  - "전화번호" 제목이 두 번 나오면 바로 앞 사람(임대인/임차인)의 전화로 봄
 *  - "고유번호"를 호수로 착각하지 않음
 */

import * as XLSX from "xlsx";
import type { RosterUnit } from "@/lib/roster-db";

export type RosterRow = Omit<RosterUnit, "id" | "createdAt">;

export interface ParsedRoster {
  units: RosterRow[];
  skipped: number;      // 동·호수를 못 읽은 줄
  columns: string[];    // 찾은 칸 (화면 안내용)
}

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, "").replace(/[()·,/]/g, "").toLowerCase();
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function cleanPhone(v: unknown): string {
  const s = str(v).replace(/\D/g, "");
  if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`;
  return str(v);
}

function cleanDate(v: unknown): string {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const m = str(v).match(/^(\d{2}|\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!m) return "";
  let y = parseInt(m[1], 10); if (y < 100) y += 2000;
  return `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

const DONG_HO = /^(\d{2,4})\s*[-동]\s*((?:비|B)?\d{2,5})\s*호?$/;

type Col =
  | "complex" | "dongHo" | "dong" | "ho" | "area" | "unitType" | "direction" | "rooms" | "uniqueNo"
  | "ownerName" | "ownerPhone" | "tenantName" | "tenantPhone" | "leaseEndDate" | "memo";

const COL_LABEL: Record<Col, string> = {
  complex: "단지", dongHo: "동-호", dong: "동", ho: "호수", area: "전용면적", unitType: "타입", direction: "향",
  rooms: "방수", uniqueNo: "고유번호", ownerName: "임대인", ownerPhone: "임대인 전화", tenantName: "임차인",
  tenantPhone: "임차인 전화", leaseEndDate: "만기일", memo: "메모",
};

/** 칸 위치 찾기 — 제목 + 실제 값 모양으로 판단 */
function findColumns(header: unknown[], body: unknown[][]): Partial<Record<Col, number>> {
  const at: Partial<Record<Col, number>> = {};
  const width = Math.max(header.length, ...body.slice(0, 30).map(r => r.length));
  const sample = (i: number) => body.slice(0, 30).map(r => str(r[i])).filter(Boolean);
  let lastPerson: "owner" | "tenant" | null = null;

  for (let i = 0; i < width; i++) {
    const h = norm(header[i]);
    const set = (c: Col) => { if (at[c] === undefined) at[c] = i; };
    if (!h) continue;
    if (h.includes("고유번호")) set("uniqueNo");
    else if (/단지|주소|건물|소재지/.test(h)) set("complex");
    else if (/전용|면적/.test(h)) set("area");
    else if (/타입|평면/.test(h)) set("unitType");
    else if (/방향/.test(h) || h === "향") set("direction");
    else if (/방수/.test(h)) set("rooms");
    else if (/만기/.test(h)) set("leaseEndDate");
    else if (/메모|비고|특이/.test(h)) set("memo");
    else if (/임차인|세입자/.test(h)) {
      if (/전화|연락처|핸드폰|휴대폰/.test(h)) set("tenantPhone"); else { set("tenantName"); lastPerson = "tenant"; }
    } else if (/임대인|집주인|소유자/.test(h)) {
      if (/전화|연락처|핸드폰|휴대폰/.test(h)) set("ownerPhone"); else { set("ownerName"); lastPerson = "owner"; }
    } else if (/전화|연락처|핸드폰|휴대폰/.test(h)) {
      if (lastPerson === "tenant") set("tenantPhone"); else set("ownerPhone");
    } else if (/호수|호실/.test(h) || h === "호") set("ho");
    else if (h === "동" || h === "동호" || h === "동호수" || h === "동번호") {
      // "1201-401"이 들어 있으면 동-호 한 칸
      const v = sample(i);
      if (v.length && v.filter(x => DONG_HO.test(x)).length >= v.length / 2) set("dongHo"); else set("dong");
    }
  }

  // 동-호 칸을 제목으로 못 찾았으면 값 모양으로 찾기
  if (at.dongHo === undefined && at.ho === undefined) {
    for (let i = 0; i < width; i++) {
      const v = sample(i);
      if (v.length && v.filter(x => DONG_HO.test(x)).length >= v.length / 2) { at.dongHo = i; break; }
    }
  }
  // 타입 칸: 제목이 비었더라도 A·B·PB 같은 짧은 글자만 있는 칸
  if (at.unitType === undefined) {
    for (let i = 0; i < width; i++) {
      if (norm(header[i])) continue;
      const v = sample(i);
      if (v.length && v.every(x => /^[A-Za-z]{1,3}\d?$/.test(x))) { at.unitType = i; break; }
    }
  }
  return at;
}

/** 첫 번째 시트를 읽어 세대 목록으로. 단지 칸이 없으면 fallbackComplex 사용 */
export async function parseRosterFile(file: File, fallbackComplex: string): Promise<ParsedRoster> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });

  let hi = 0;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    if (raw[i].filter(c => str(c) !== "").length >= 2) { hi = i; break; }
  }
  const header = raw[hi] || [];
  const body = raw.slice(hi + 1).filter(r => r.some(c => str(c) !== ""));
  const at = findColumns(header, body);
  const get = (r: unknown[], c: Col) => (at[c] === undefined ? "" : r[at[c] as number]);

  const units: RosterRow[] = [];
  let skipped = 0;
  for (const r of body) {
    let dong = "", ho = "";
    const dh = str(get(r, "dongHo")).match(DONG_HO);
    if (dh) { dong = dh[1]; ho = dh[2]; }
    else {
      dong = str(get(r, "dong")).replace(/\D/g, "");
      ho = str(get(r, "ho")).replace(/호$/, "").trim();
    }
    if (!ho) { skipped++; continue; }

    // 면적 칸에 "85A" 처럼 타입이 붙어 있으면 나눔
    let area = str(get(r, "area"));
    let unitType = str(get(r, "unitType"));
    const am = area.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]{1,3})$/);
    if (am) { area = am[1]; if (!unitType) unitType = am[2].toUpperCase(); }
    if (area && !/^\d+(\.\d+)?$/.test(area)) area = area.replace(/[^\d.]/g, "");

    units.push({
      complex: str(get(r, "complex")) || fallbackComplex,
      dong, ho, unitType, area,
      direction: str(get(r, "direction")),
      rooms: str(get(r, "rooms")).replace(/[^\d.]/g, ""),
      uniqueNo: str(get(r, "uniqueNo")),
      ownerName: str(get(r, "ownerName")),
      ownerPhone: cleanPhone(get(r, "ownerPhone")),
      tenantName: str(get(r, "tenantName")),
      tenantPhone: cleanPhone(get(r, "tenantPhone")),
      leaseEndDate: cleanDate(get(r, "leaseEndDate")),
      memo: str(get(r, "memo")),
    });
  }
  const columns = (Object.keys(at) as Col[]).map(c => COL_LABEL[c]);
  return { units, skipped, columns };
}
