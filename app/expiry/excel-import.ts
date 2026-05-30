/**
 * 엑셀(.xlsx/.xls/.csv) → 계약 데이터 변환
 *
 * 흐름:
 *  1) 파일 → 시트 → JSON (헤더 + 행)
 *  2) 한국어 컬럼명 패턴 매칭으로 자동 매핑 추정
 *  3) 사용자가 매핑 확인/수정
 *  4) 행마다 Contract 객체 생성 + 검증
 */

import * as XLSX from "xlsx";
import { Contract, uid, defaultEndDate } from "./contracts";

/** 우리 앱 필드 (target field) */
export type ContractField =
  | "address"
  | "type"
  | "deposit"
  | "monthly"
  | "startDate"
  | "endDate"
  | "tenantName"
  | "tenantPhone"
  | "landlordName"
  | "landlordPhone"
  | "memo"
  | "_ignore";

export const FIELD_LABELS: Record<Exclude<ContractField, "_ignore">, string> = {
  address: "주소",
  type: "계약 종류",
  deposit: "보증금",
  monthly: "월세",
  startDate: "계약 시작일",
  endDate: "만기일",
  tenantName: "임차인 이름",
  tenantPhone: "임차인 연락처",
  landlordName: "임대인 이름",
  landlordPhone: "임대인 연락처",
  memo: "메모",
};

export const REQUIRED_FIELDS: ContractField[] = ["address", "endDate"];

/** 한국어 컬럼명 자동 인식 패턴 — 소문자 + 공백제거 후 부분일치 */
const COLUMN_PATTERNS: Record<Exclude<ContractField, "_ignore">, string[]> = {
  address:       ["소재지", "주소", "address", "건물명", "위치"],
  type:          ["계약종류", "거래종류", "거래유형", "임대차종류", "유형", "type"],
  deposit:       ["보증금", "deposit"],
  monthly:       ["월세", "월차임", "차임", "monthly", "월임대료"],
  startDate:     ["계약일", "체결일", "시작일", "임대시작일", "startdate"],
  endDate:       ["만기일", "만기", "계약만기", "종료일", "임대종료일", "enddate"],
  tenantName:    ["임차인성명", "임차인이름", "임차인", "세입자", "수임차인"],
  tenantPhone:   ["임차인전화", "임차인연락처", "임차인번호", "수임차인전", "임차인 전", "세입자전화"],
  landlordName:  ["매도임대인", "임대인성명", "임대인이름", "임대인", "집주인", "매도자", "매도/임대인"],
  landlordPhone: ["임대인전화", "임대인연락처", "임대인번호", "임대인 전", "집주인전화"],
  memo:          ["메모", "비고", "특이사항", "note", "memo"],
};

/** 헤더 → 필드 자동 추정 */
export function guessMapping(headers: string[]): Record<string, ContractField> {
  const result: Record<string, ContractField> = {};
  const used = new Set<ContractField>();

  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/\s+/g, "").replace(/[·,()/]/g, "");
    let matched: ContractField = "_ignore";

    for (const [field, patterns] of Object.entries(COLUMN_PATTERNS) as [ContractField, string[]][]) {
      if (used.has(field)) continue;
      if (patterns.some(p => normalized.includes(p.toLowerCase().replace(/\s+/g, "")))) {
        matched = field;
        used.add(field);
        break;
      }
    }

    result[header] = matched;
  }
  return result;
}

/** 엑셀 파일 → 헤더 + 행(객체 배열) */
export interface ParsedSheet {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string;
  allSheets: string[];
}

export async function parseExcelFile(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // 헤더 행 자동 인식 — 처음에 비어있는 행 스킵
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const row = raw[i];
    if (row.filter(c => c !== "" && c !== null && c !== undefined).length >= 2) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = (raw[headerRowIdx] as unknown[]).map((h, i) => String(h ?? `컬럼${i + 1}`).trim()).filter(h => h !== "");
  const rows = raw.slice(headerRowIdx + 1).map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = (row as unknown[])[i]; });
    return obj;
  }).filter(r => Object.values(r).some(v => v !== "" && v !== null && v !== undefined));

  return { headers, rows, sheetName, allSheets: wb.SheetNames };
}

/** 값 → 정제된 문자열 (전화번호·금액·날짜 등) */
function cleanPhone(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/[^\d]/g, "");
  if (!s) return "";
  if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`;
  return String(v).trim();
}

function cleanAmount(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return String(Math.round(v));
  return String(v).replace(/[^\d]/g, "");
}

function cleanDate(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  // Date 객체 (XLSX cellDates:true)
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // 숫자 (Excel serial date) — 1900-01-01 기준
  if (typeof v === "number") {
    const date = XLSX.SSF.parse_date_code(v);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  // 문자열 — 다양한 형식 시도
  const s = String(v).trim();
  // 2026-06-15, 2026/06/15, 2026.06.15, 26-06-15 etc.
  const m1 = s.match(/^(\d{2}|\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) {
    let y = parseInt(m1[1], 10);
    if (y < 100) y += 2000;
    const mm = String(parseInt(m1[2], 10)).padStart(2, "0");
    const dd = String(parseInt(m1[3], 10)).padStart(2, "0");
    const result = `${y}-${mm}-${dd}`;
    // 유효한 날짜인지 최종 확인
    if (!isNaN(new Date(result).getTime())) return result;
  }
  return ""; // 파싱 실패 → 빈값 처리
}

function cleanType(v: unknown): "전세" | "월세" {
  const s = String(v ?? "").trim();
  if (s.includes("전세") || s.toLowerCase().includes("jeonse")) return "전세";
  return "월세";
}

/** 매핑 + 행 → Contract */
export function rowToContract(
  row: Record<string, unknown>,
  mapping: Record<string, ContractField>,
): { contract: Contract; warnings: string[] } {
  const warnings: string[] = [];
  const get = (field: ContractField): unknown => {
    for (const [header, mappedField] of Object.entries(mapping)) {
      if (mappedField === field) return row[header];
    }
    return undefined;
  };

  const address = String(get("address") ?? "").trim();
  const endDate = cleanDate(get("endDate"));
  const startDate = cleanDate(get("startDate"));
  const type = cleanType(get("type"));
  const deposit = cleanAmount(get("deposit"));
  const monthly = type === "전세" ? "" : cleanAmount(get("monthly"));

  if (!address) warnings.push("주소 누락");
  if (!endDate) warnings.push("만기일 누락 또는 형식 오류");

  // 시작일 없으면 만기일에서 역산 (전세 -2년, 월세 -1년)
  let finalStartDate = startDate;
  if (!finalStartDate && endDate) {
    finalStartDate = defaultEndDate(endDate, type === "전세" ? -2 : -1);
  }

  const contract: Contract = {
    id: uid(),
    address,
    type,
    deposit,
    monthly,
    startDate: finalStartDate,
    endDate,
    tenantName: String(get("tenantName") ?? "").trim(),
    tenantPhone: cleanPhone(get("tenantPhone")),
    landlordName: String(get("landlordName") ?? "").trim(),
    landlordPhone: cleanPhone(get("landlordPhone")),
    memo: String(get("memo") ?? "").trim(),
    status: "active",
    createdAt: Date.now(),
  };

  return { contract, warnings };
}

/** 전체 변환 결과 */
export interface ImportResult {
  contracts: Contract[];
  warnings: { rowIdx: number; messages: string[]; data: Record<string, unknown> }[];
  duplicates: Contract[];   // 기존 데이터와 중복 의심
}

/** 기존 계약과 중복 의심 판정 — 주소 + 만기일 일치 */
function isDuplicate(a: Contract, b: Contract): boolean {
  return a.address === b.address && a.endDate === b.endDate;
}

export function buildImportResult(
  rows: Record<string, unknown>[],
  mapping: Record<string, ContractField>,
  existing: Contract[] = [],
): ImportResult {
  const contracts: Contract[] = [];
  const warnings: ImportResult["warnings"] = [];
  const duplicates: Contract[] = [];

  rows.forEach((row, idx) => {
    const { contract, warnings: w } = rowToContract(row, mapping);
    contracts.push(contract);
    if (w.length > 0) warnings.push({ rowIdx: idx + 2, messages: w, data: row }); // +2: 1-based + 헤더 행
    if (existing.some(e => isDuplicate(e, contract))) duplicates.push(contract);
  });

  return { contracts, warnings, duplicates };
}

/** 매핑 저장 (브라우저에 기억해서 다음 업로드 시 자동 적용) */
const MAPPING_KEY = "budongsan_excel_mapping_v1";

export function saveMapping(headers: string[], mapping: Record<string, ContractField>) {
  if (typeof window === "undefined") return;
  const key = headers.sort().join("|");
  const all = loadAllMappings();
  all[key] = mapping;
  localStorage.setItem(MAPPING_KEY, JSON.stringify(all));
}

export function loadSavedMapping(headers: string[]): Record<string, ContractField> | null {
  if (typeof window === "undefined") return null;
  const all = loadAllMappings();
  const key = headers.sort().join("|");
  return all[key] || null;
}

function loadAllMappings(): Record<string, Record<string, ContractField>> {
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
