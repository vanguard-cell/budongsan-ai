/**
 * 매물 엑셀 → 내 매물 데이터 변환
 *
 * 만기관리 excel-import 패턴 재사용 + 매물 필드에 맞게 매핑 변경
 */

import * as XLSX from "xlsx";
import { type Property, type PropertyType, type DealType, emptyProperty } from "@/lib/properties-db";

export type PropField =
  | "address" | "propertyType" | "dealType"
  | "price" | "monthly" | "area"
  | "dong" | "ho" | "rooms" | "direction"
  | "ownerName" | "ownerPhone"
  | "tenantName" | "tenantPhone" | "leaseEndDate"
  | "memo"
  | "_ignore";

export const PROP_FIELD_LABELS: Record<Exclude<PropField, "_ignore">, string> = {
  address:      "주소(단지명)",
  propertyType: "매물유형",
  dealType:     "거래종류",
  price:        "매매가/보증금",
  monthly:      "월세",
  area:         "전용면적",
  dong:         "동",
  ho:           "호수",
  rooms:        "방수",
  direction:    "방향",
  ownerName:    "집주인 이름",
  ownerPhone:   "집주인 연락처",
  tenantName:   "임차인 이름",
  tenantPhone:  "임차인 연락처",
  leaseEndDate: "임대만기일",
  memo:         "메모",
};

export const PROP_REQUIRED: PropField[] = ["address"];

const PROP_PATTERNS: Record<Exclude<PropField, "_ignore">, string[]> = {
  address:      ["주소", "소재지", "단지", "건물명", "address"],
  propertyType: ["매물유형", "유형", "종류", "type"],
  dealType:     ["거래종류", "거래", "deal"],
  price:        ["매매가", "보증금", "가격", "price"],
  monthly:      ["월세", "월차임", "monthly"],
  area:         ["전용", "면적", "area"],
  dong:         ["동번호", "동수", "동"],
  ho:           ["호수", "호실", "호"],
  rooms:        ["방수", "방", "rooms"],
  direction:    ["방향", "향", "direction"],
  ownerName:    ["집주인", "소유자", "임대인", "owner"],
  ownerPhone:   ["집주인전화", "소유자전화", "임대인전화", "owner phone"],
  tenantName:   ["임차인", "세입자", "tenant"],
  tenantPhone:  ["임차인전화", "임차인연락처", "세입자전화"],
  leaseEndDate: ["임대만기", "전세만기", "월세만기", "만기일"],
  memo:         ["메모", "비고", "특이사항", "note"],
};

export function guessPropMapping(headers: string[]): Record<string, PropField> {
  const result: Record<string, PropField> = {};
  const used = new Set<PropField>();
  for (const header of headers) {
    const norm = header.toLowerCase().replace(/\s+/g, "").replace(/[·,()/]/g, "");
    let matched: PropField = "_ignore";
    for (const [field, patterns] of Object.entries(PROP_PATTERNS) as [PropField, string[]][]) {
      if (used.has(field)) continue;
      if (patterns.some(p => norm.includes(p.toLowerCase().replace(/\s+/g, "")))) {
        matched = field; used.add(field); break;
      }
    }
    result[header] = matched;
  }
  return result;
}

export interface ParsedPropSheet {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string;
}

export async function parsePropExcelFile(file: File): Promise<ParsedPropSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    if ((raw[i] as unknown[]).filter(c => c !== "" && c !== null).length >= 2) {
      headerRowIdx = i; break;
    }
  }
  const headers = (raw[headerRowIdx] as unknown[])
    .map((h, i) => String(h ?? `컬럼${i + 1}`).trim()).filter(h => h !== "");
  const rows = raw.slice(headerRowIdx + 1).map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = (row as unknown[])[i]; });
    return obj;
  }).filter(r => Object.values(r).some(v => v !== "" && v !== null && v !== undefined));

  return { headers, rows, sheetName };
}

function cleanPhone(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/[^\d]/g, "");
  if (!s) return "";
  if (s.length === 10) return `${s.slice(0,3)}-${s.slice(3,6)}-${s.slice(6)}`;
  if (s.length === 11) return `${s.slice(0,3)}-${s.slice(3,7)}-${s.slice(7)}`;
  return String(v).trim();
}
function cleanNum(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return String(Math.round(v));
  return String(v).replace(/[^\d]/g, "");
}
function cleanDate(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) {
    const y = v.getFullYear(); const m = String(v.getMonth()+1).padStart(2,"0"); const d = String(v.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    const date = XLSX.SSF.parse_date_code(v);
    if (date) return `${date.y}-${String(date.m).padStart(2,"0")}-${String(date.d).padStart(2,"0")}`;
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{2}|\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) {
    let y = parseInt(m1[1],10); if (y < 100) y += 2000;
    const mm = String(parseInt(m1[2],10)).padStart(2,"0");
    const dd = String(parseInt(m1[3],10)).padStart(2,"0");
    return `${y}-${mm}-${dd}`;
  }
  return "";
}

const PROPERTY_TYPES: PropertyType[] = ["아파트", "오피스텔", "빌라/다세대", "원룸/투룸", "상가", "사무실", "토지", "기타"];

function cleanPropertyType(v: unknown): PropertyType {
  const s = String(v ?? "").trim();
  for (const t of PROPERTY_TYPES) if (s.includes(t)) return t;
  return "아파트";
}
function cleanDealType(v: unknown): DealType {
  const s = String(v ?? "").trim();
  if (s.includes("매매") || s.toLowerCase().includes("sale")) return "매매";
  if (s.includes("전세")) return "전세";
  return "월세";
}

export function rowToProperty(
  row: Record<string, unknown>,
  mapping: Record<string, PropField>,
): { property: Property; warnings: string[] } {
  const warnings: string[] = [];
  const get = (field: PropField): unknown => {
    for (const [header, mappedField] of Object.entries(mapping)) {
      if (mappedField === field) return row[header];
    }
    return undefined;
  };

  const base = emptyProperty();
  const address = String(get("address") ?? "").trim();
  if (!address) warnings.push("주소 누락");

  const property: Property = {
    ...base,
    address,
    propertyType: cleanPropertyType(get("propertyType")),
    dealType:     cleanDealType(get("dealType")),
    price:        cleanNum(get("price")),
    monthly:      cleanNum(get("monthly")),
    area:         cleanNum(get("area")),
    dong:         String(get("dong") ?? "").replace(/[^\d]/g, ""),
    ho:           String(get("ho") ?? "").replace(/[^\d]/g, ""),
    rooms:        cleanNum(get("rooms")),
    direction:    String(get("direction") ?? "").trim(),
    ownerName:    String(get("ownerName") ?? "").trim(),
    ownerPhone:   cleanPhone(get("ownerPhone")),
    tenantName:   String(get("tenantName") ?? "").trim(),
    tenantPhone:  cleanPhone(get("tenantPhone")),
    leaseEndDate: cleanDate(get("leaseEndDate")),
    memo:         String(get("memo") ?? "").trim(),
  };
  return { property, warnings };
}

export interface PropImportResult {
  properties: Property[];
  warnings: { rowIdx: number; messages: string[] }[];
  duplicates: Property[];
}

function isDuplicate(a: Property, b: Property): boolean {
  return a.address === b.address;
}

export function buildPropImportResult(
  rows: Record<string, unknown>[],
  mapping: Record<string, PropField>,
  existing: Property[] = [],
): PropImportResult {
  const properties: Property[] = [];
  const warnings: PropImportResult["warnings"] = [];
  const duplicates: Property[] = [];

  rows.forEach((row, idx) => {
    const { property, warnings: w } = rowToProperty(row, mapping);
    properties.push(property);
    if (w.length > 0) warnings.push({ rowIdx: idx + 2, messages: w });
    if (existing.some(e => isDuplicate(e, property))) duplicates.push(property);
  });

  return { properties, warnings, duplicates };
}
