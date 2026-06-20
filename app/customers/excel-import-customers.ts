/**
 * 고객 엑셀 → 고객 데이터 변환
 */

import * as XLSX from "xlsx";
import { type Customer, type CustomerSide, type DealKind, type CustomerStatus, emptyCustomer } from "./customer-types";

export type CustField =
  | "name" | "phone" | "side" | "dealKind"
  | "vip" | "budget" | "preferredArea" | "moveInDate"
  | "status" | "nextFollowUp" | "memo"
  | "_ignore";

export const CUST_FIELD_LABELS: Record<Exclude<CustField, "_ignore">, string> = {
  name:          "이름",
  phone:         "연락처",
  side:          "구분 (매수/매도/임차/임대인)",
  dealKind:      "목적 (실거주/투자)",
  vip:           "VIP",
  budget:        "예산",
  preferredArea: "관심 지역·단지",
  moveInDate:    "입주가능일",
  status:        "상태",
  nextFollowUp:  "다음 후속연락",
  memo:          "메모",
};

export const CUST_REQUIRED: CustField[] = ["name"];

const CUST_PATTERNS: Record<Exclude<CustField, "_ignore">, string[]> = {
  name:          ["이름", "성명", "name"],
  phone:         ["연락처", "전화", "번호", "phone"],
  side:          ["구분", "유형", "side"],
  dealKind:      ["목적", "용도", "거래목적"],
  vip:           ["vip", "특별", "우선"],
  budget:        ["예산", "budget"],
  preferredArea: ["관심", "지역", "단지", "area"],
  moveInDate:    ["입주", "이사", "move"],
  status:        ["상태", "status"],
  nextFollowUp:  ["후속", "연락", "followup", "follow"],
  memo:          ["메모", "비고", "특이", "note"],
};

export function guessCustMapping(headers: string[]): Record<string, CustField> {
  const result: Record<string, CustField> = {};
  const used = new Set<CustField>();
  for (const header of headers) {
    const norm = header.toLowerCase().replace(/\s+/g, "").replace(/[·,()/]/g, "");
    let matched: CustField = "_ignore";
    for (const [field, patterns] of Object.entries(CUST_PATTERNS) as [CustField, string[]][]) {
      if (used.has(field)) continue;
      if (patterns.some(p => norm.includes(p.toLowerCase().replace(/\s+/g, "")))) {
        matched = field; used.add(field); break;
      }
    }
    result[header] = matched;
  }
  return result;
}

export interface ParsedCustSheet {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string;
}

export async function parseCustExcelFile(file: File): Promise<ParsedCustSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    if ((raw[i] as unknown[]).filter(c => c !== "" && c !== null).length >= 2) { headerRowIdx = i; break; }
  }
  const headers = (raw[headerRowIdx] as unknown[]).map((h, i) => String(h ?? `컬럼${i + 1}`).trim()).filter(h => h !== "");
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
function cleanDate(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")}`;
  }
  if (typeof v === "number") {
    const date = XLSX.SSF.parse_date_code(v);
    if (date) return `${date.y}-${String(date.m).padStart(2,"0")}-${String(date.d).padStart(2,"0")}`;
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{2}|\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) {
    let y = parseInt(m1[1],10); if (y < 100) y += 2000;
    return `${y}-${String(parseInt(m1[2],10)).padStart(2,"0")}-${String(parseInt(m1[3],10)).padStart(2,"0")}`;
  }
  return "";
}

function cleanSide(v: unknown): CustomerSide {
  const s = String(v ?? "").trim();
  if (s.includes("매수")) return "buyer";
  if (s.includes("매도")) return "seller";
  if (s.includes("임대") && !s.includes("임차")) return "landlord";
  if (s.includes("임차") || s.includes("세입")) return "tenant";
  return "buyer";
}
function cleanDealKind(v: unknown): DealKind {
  const s = String(v ?? "").trim();
  if (s.includes("투자")) return "invest";
  if (s.includes("실거주") || s.includes("거주")) return "live";
  return "live";
}
function cleanStatus(v: unknown): CustomerStatus {
  const s = String(v ?? "").trim();
  if (s.includes("매칭")) return "matched";
  if (s.includes("이탈")) return "lost";
  if (s.includes("완료") || s.includes("종료") || s.includes("closed")) return "closed";
  return "active";
}
function cleanVip(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "y" || s === "yes" || s === "o" || s === "★" || s === "true" || s === "vip" || s === "1";
}

export function rowToCustomer(
  row: Record<string, unknown>,
  mapping: Record<string, CustField>,
): { customer: Customer; warnings: string[] } {
  const warnings: string[] = [];
  const get = (field: CustField): unknown => {
    for (const [header, mappedField] of Object.entries(mapping)) {
      if (mappedField === field) return row[header];
    }
    return undefined;
  };

  const base = emptyCustomer();
  const name = String(get("name") ?? "").trim();
  if (!name) warnings.push("이름 누락");

  const customer: Customer = {
    ...base,
    name,
    phone:         cleanPhone(get("phone")),
    side:          cleanSide(get("side")),
    dealKind:      cleanDealKind(get("dealKind")),
    vip:           cleanVip(get("vip")),
    budget:        String(get("budget") ?? "").trim(),
    preferredArea: String(get("preferredArea") ?? "").trim(),
    moveInDate:    cleanDate(get("moveInDate")),
    status:        cleanStatus(get("status")),
    nextFollowUp:  cleanDate(get("nextFollowUp")),
    memo:          String(get("memo") ?? "").trim(),
  };
  return { customer, warnings };
}

export interface CustImportResult {
  customers: Customer[];
  warnings: { rowIdx: number; messages: string[] }[];
  duplicates: Customer[];
}

function isDuplicate(a: Customer, b: Customer): boolean {
  if (a.phone && b.phone && a.phone.replace(/\D/g,"") === b.phone.replace(/\D/g,"")) return true;
  return a.name === b.name && a.name !== "";
}

export function buildCustImportResult(
  rows: Record<string, unknown>[],
  mapping: Record<string, CustField>,
  existing: Customer[] = [],
): CustImportResult {
  const customers: Customer[] = [];
  const warnings: CustImportResult["warnings"] = [];
  const duplicates: Customer[] = [];

  rows.forEach((row, idx) => {
    const { customer, warnings: w } = rowToCustomer(row, mapping);
    customers.push(customer);
    if (w.length > 0) warnings.push({ rowIdx: idx + 2, messages: w });
    if (existing.some(e => isDuplicate(e, customer))) duplicates.push(customer);
  });

  return { customers, warnings, duplicates };
}
