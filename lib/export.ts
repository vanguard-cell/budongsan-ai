/**
 * 데이터 내보내기 — 계약·고객을 엑셀로 다운로드
 *
 * 디자인 원칙:
 *  1) 한방 호환성 — 컬럼명을 한방 엑셀과 유사하게 (재업로드 시 매핑 자동)
 *  2) 개인정보 마스킹 옵션 — 이름·전화 ●●● 처리 가능
 *  3) 모두 브라우저에서 처리 — 서버 전송 X
 */

import * as XLSX from "xlsx";
import type { Contract } from "@/app/expiry/contracts";
import { dDay, dDayLabel, severityOf, severityLabel } from "@/app/expiry/contracts";
import type { Customer } from "@/app/customers/customer-types";
import {
  SIDE_LABELS,
  DEAL_KIND_LABELS,
  STATUS_LABELS,
  followUpDDay,
  followUpDDayLabel,
} from "@/app/customers/customer-types";
import type { Property } from "@/lib/properties-db";

export type ExportScope = "active" | "all";
export type ExportFormat = "xlsx" | "csv";

export interface ExportOptions {
  scope: ExportScope;
  maskPersonal: boolean;
  format: ExportFormat;
}

/* ───────── 마스킹 헬퍼 ───────── */
function maskName(name: string): string {
  if (!name) return "";
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "○";
  return name[0] + "○".repeat(name.length - 2) + name[name.length - 1];
}

function maskPhone(phone: string): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return phone;
  // 010-1234-5678 → 010-****-5678
  if (d.length === 11) return `${d.slice(0, 3)}-****-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-***-${d.slice(6)}`;
  return phone.replace(/\d{4}(?=\d{4})/, "****");
}

/* ───────── 계약 → 엑셀 row 변환 ───────── */
function contractsToRows(contracts: Contract[], maskPersonal: boolean) {
  return contracts.map(c => {
    const d = dDay(c.endDate);
    return {
      "주소":          c.address,
      "계약종류":      c.type,
      "보증금(만원)":   c.deposit,
      "월세(만원)":     c.monthly,
      "계약일":        c.startDate,
      "만기일":        c.endDate,
      "D-day":         dDayLabel(d),
      "긴급도":        severityLabel(severityOf(d)),
      "상태":          c.status === "active" ? "진행중" : "종료",
      "임차인":        maskPersonal ? maskName(c.tenantName) : c.tenantName,
      "임차인 전화":   maskPersonal ? maskPhone(c.tenantPhone) : c.tenantPhone,
      "임대인":        maskPersonal ? maskName(c.landlordName) : c.landlordName,
      "임대인 전화":   maskPersonal ? maskPhone(c.landlordPhone) : c.landlordPhone,
      "메모":          c.memo,
      "등록일":        new Date(c.createdAt).toISOString().slice(0, 10),
    };
  });
}

/* ───────── 고객 → 엑셀 row 변환 ───────── */
function customersToRows(customers: Customer[], maskPersonal: boolean) {
  return customers.map(c => {
    const d = followUpDDay(c.nextFollowUp);
    const shownSummary = c.shownProperties.length === 0
      ? ""
      : c.shownProperties
          .slice(0, 3)
          .map(s => `${s.address} (${s.shownAt}, ${s.reaction || "?"})`)
          .join(" / ") + (c.shownProperties.length > 3 ? ` 외 ${c.shownProperties.length - 3}건` : "");

    return {
      "이름":          maskPersonal ? maskName(c.name) : c.name,
      "연락처":        maskPersonal ? maskPhone(c.phone) : c.phone,
      "구분":          SIDE_LABELS[c.side],
      "목적":          DEAL_KIND_LABELS[c.dealKind],
      "VIP":           c.vip ? "★" : "",
      "예산":          c.budget,
      "관심지역":      c.preferredArea,
      "입주가능일":    c.moveInDate,
      "상태":          STATUS_LABELS[c.status],
      "다음 후속연락": c.nextFollowUp,
      "D-day":         c.nextFollowUp ? followUpDDayLabel(d) : "",
      "보여드린 매물": shownSummary,
      "메모":          c.memo,
      "등록일":        new Date(c.createdAt).toISOString().slice(0, 10),
    };
  });
}

/* ───────── 다운로드 트리거 ───────── */
function downloadFile(data: BlobPart, filename: string, mime: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ymd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/* ───────── 계약 내보내기 ───────── */
export function exportContracts(contracts: Contract[], opt: ExportOptions): { count: number; filename: string } {
  const filtered = opt.scope === "active"
    ? contracts.filter(c => c.status === "active")
    : contracts;
  const rows = contractsToRows(filtered, opt.maskPersonal);

  const filename = `만기관리_${opt.scope === "active" ? "진행중" : "전체"}_${ymd()}.${opt.format}`;

  if (opt.format === "csv") {
    const csv = arrayToCSV(rows);
    downloadFile("﻿" + csv, filename, "text/csv;charset=utf-8");
  } else {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    // 컬럼 너비
    ws["!cols"] = [
      { wch: 40 }, // 주소
      { wch: 8 },  // 종류
      { wch: 10 }, // 보증금
      { wch: 10 }, // 월세
      { wch: 12 }, // 계약일
      { wch: 12 }, // 만기일
      { wch: 12 }, // D-day
      { wch: 10 }, // 긴급도
      { wch: 8 },  // 상태
      { wch: 10 }, // 임차인
      { wch: 16 }, // 임차인 전화
      { wch: 10 }, // 임대인
      { wch: 16 }, // 임대인 전화
      { wch: 24 }, // 메모
      { wch: 12 }, // 등록일
    ];
    XLSX.utils.book_append_sheet(wb, ws, "만기관리");
    XLSX.writeFile(wb, filename);
  }
  return { count: rows.length, filename };
}

/* ───────── 고객 내보내기 ───────── */
export function exportCustomers(customers: Customer[], opt: ExportOptions): { count: number; filename: string } {
  const filtered = opt.scope === "active"
    ? customers.filter(c => c.status === "active" || c.status === "matched")
    : customers;
  const rows = customersToRows(filtered, opt.maskPersonal);

  const filename = `고객관리_${opt.scope === "active" ? "진행중" : "전체"}_${ymd()}.${opt.format}`;

  if (opt.format === "csv") {
    const csv = arrayToCSV(rows);
    downloadFile("﻿" + csv, filename, "text/csv;charset=utf-8");
  } else {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 10 }, // 이름
      { wch: 16 }, // 연락처
      { wch: 8 },  // 구분
      { wch: 8 },  // 목적
      { wch: 5 },  // VIP
      { wch: 22 }, // 예산
      { wch: 30 }, // 관심지역
      { wch: 12 }, // 입주가능일
      { wch: 10 }, // 상태
      { wch: 14 }, // 다음 후속연락
      { wch: 10 }, // D-day
      { wch: 60 }, // 보여드린 매물
      { wch: 30 }, // 메모
      { wch: 12 }, // 등록일
    ];
    XLSX.utils.book_append_sheet(wb, ws, "고객관리");
    XLSX.writeFile(wb, filename);
  }
  return { count: rows.length, filename };
}

/* ───────── 매물 → 엑셀 row 변환 ───────── */
function propertiesToRows(properties: Property[], maskPersonal: boolean) {
  return properties.map(p => ({
    "주소":          p.address,
    "매물유형":      p.propertyType,
    "거래종류":      p.dealType,
    "매매가/보증금(만원)": p.price,
    "월세(만원)":     p.monthly,
    "전용면적(㎡)":   p.area,
    "동":            p.dong,
    "호수":          p.ho,
    "방수":          p.rooms,
    "방향":          p.direction,
    "집주인":        maskPersonal ? maskName(p.ownerName) : p.ownerName,
    "집주인 전화":   maskPersonal ? maskPhone(p.ownerPhone) : p.ownerPhone,
    "임차인":        maskPersonal ? maskName(p.tenantName) : p.tenantName,
    "임차인 전화":   maskPersonal ? maskPhone(p.tenantPhone) : p.tenantPhone,
    "임대만기일":    p.leaseEndDate,
    "상태":          p.status === "active" ? "진행중" : "거래완료",
    "메모":          p.memo,
    "등록일":        new Date(p.createdAt).toISOString().slice(0, 10),
  }));
}

/* ───────── 매물 내보내기 ───────── */
export function exportProperties(properties: Property[], opt: ExportOptions): { count: number; filename: string } {
  const filtered = opt.scope === "active"
    ? properties.filter(p => p.status === "active")
    : properties;
  const rows = propertiesToRows(filtered, opt.maskPersonal);

  const filename = `내매물_${opt.scope === "active" ? "진행중" : "전체"}_${ymd()}.${opt.format}`;

  if (opt.format === "csv") {
    const csv = arrayToCSV(rows);
    downloadFile("﻿" + csv, filename, "text/csv;charset=utf-8");
  } else {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 40 }, // 주소
      { wch: 12 }, // 매물유형
      { wch: 8 },  // 거래종류
      { wch: 14 }, // 가격
      { wch: 10 }, // 월세
      { wch: 10 }, // 면적
      { wch: 6 },  // 동
      { wch: 6 },  // 호수
      { wch: 6 },  // 방수
      { wch: 8 },  // 방향
      { wch: 10 }, // 집주인
      { wch: 16 }, // 집주인 전화
      { wch: 10 }, // 임차인
      { wch: 16 }, // 임차인 전화
      { wch: 12 }, // 임대만기일
      { wch: 8 },  // 상태
      { wch: 24 }, // 메모
      { wch: 12 }, // 등록일
    ];
    XLSX.utils.book_append_sheet(wb, ws, "내매물");
    XLSX.writeFile(wb, filename);
  }
  return { count: rows.length, filename };
}

/* ───────── CSV 변환 ───────── */
function arrayToCSV(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map(row => headers.map(h => escape(row[h])).join(",")),
  ];
  return lines.join("\n");
}
