"use client";

/** 매물 카드 — page.tsx 분리 리팩토링으로 추출 */

import { useState } from "react";
import type { Property } from "@/lib/properties-db";
import type { Schedule } from "@/lib/schedules-db";
import { dDay } from "@/app/expiry/contracts";
import { formatPhone, fmtNum, formatDateKo, m2ToPyeong, DEAL_BADGE } from "./helpers";

const STYPE_COLORS: Record<string, string> = {
  "집보기": "bg-blue-100 text-blue-700",
  "계약":   "bg-purple-100 text-purple-700",
  "잔금":   "bg-orange-100 text-orange-700",
  "기타":   "bg-gray-100 text-gray-600",
};

/** 구분점 — 항목 바로 앞에 붙음 (어머니 피드백: "·방1개 ·서향")
 *  inline-flex 묶음 안에서 점과 항목 사이 2px(mr-0.5), 묶음끼리는 부모 gap-x-2(8px) */
function Dot() {
  return <span className="text-gray-400 dark:text-gray-500 font-bold text-sm leading-none select-none mr-0.5">·</span>;
}

/* ── 매물 카드 ── */
export default function PropertyCard({ property: p, schedules, isPinned, onPin, onEdit, onClose, onDelete, onReopen, onProgress, onCloneSameComplex }: {
  property: Property;
  schedules: Schedule[];
  isPinned: boolean;
  onPin: () => void;
  onEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
  onReopen: () => void;
  onProgress: () => void;
  onCloneSameComplex: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const isClosed = p.status === "closed";
  const priceStr = p.dealType === "월세"
    ? (p.price || p.monthly)
        ? `${p.price ? fmtNum(p.price) : "0"}/${p.monthly ? fmtNum(p.monthly) : "0"}만`
        : "—"
    : p.price ? `${fmtNum(p.price)}만` : "—";

  const sortedSchedules = [...schedules].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  // 임차인 만기 D-day
  const leaseDD = p.leaseEndDate ? dDay(p.leaseEndDate) : null;
  const leaseUrgent = leaseDD !== null && leaseDD <= 60;
  const leaseCaution = leaseDD !== null && leaseDD <= 120;

  // 계약 진행 상태
  const hasContractDate = !!p.contractDate;
  const hasBalanceDate = !!p.balanceDate;
  const today = new Date().toISOString().slice(0, 10);
  const balanceOverdue = hasBalanceDate && p.balanceDate <= today;

  const OCC_LABEL: Record<string, string> = { tenant: "임대중", owner: "주인거주", vacant: "공실" };

  // ── 카드 외곽 톤
  const cardClass =
    isPinned && !isClosed
      ? "border-amber-300 dark:border-amber-700 ring-2 ring-amber-100 dark:ring-amber-900/40 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/30 dark:to-slate-900"
      : isClosed
      ? "bg-gray-50/60 dark:bg-slate-900/40 border-gray-200 dark:border-slate-700 opacity-70"
      : balanceOverdue
      ? "bg-white dark:bg-slate-900 border-red-300 dark:border-red-800 shadow-sm ring-2 ring-red-100 dark:ring-red-950/40"
      : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md";

  return (
    <div className={`rounded-xl border p-3 sm:p-4 transition-all ${cardClass}`}>
      {/* ── 잔금일 경과 카드 내부 빨간 배너 ── */}
      {balanceOverdue && !isClosed && (
        <div className="mb-3 -mt-1 -mx-1 px-3 py-2 rounded-2xl bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/40 border border-red-200 dark:border-red-800/60 flex items-center gap-2 text-[11px]">
          <span className="material-symbols-outlined text-red-600 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>notifications_active</span>
          <span className="text-red-700 dark:text-red-300 font-semibold">잔금일이 지났습니다 · {formatDateKo(p.balanceDate)}</span>
          <button onClick={onClose} className="ml-auto text-[10px] px-2.5 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1 transition-colors">
            <span className="material-symbols-outlined text-xs">arrow_forward</span>
            거래완료 → 만기
          </button>
        </div>
      )}

      {/* ─── 1째줄: 거래종류 · 매물유형 · 금액 (자연스럽게 이어서) + 우측 즐겨찾기 ─── */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 min-w-0">
          {/* 자연어 헤더: "오피스텔 · 매매 · 1/1만" — 유형 → 거래(색구분) → 금액 */}
          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{p.propertyType}</span>
          <span className="inline-flex items-center">
            <Dot />
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${DEAL_BADGE[p.dealType] || "bg-gray-100 text-gray-700"}`}>{p.dealType}</span>
          </span>
          {/* 💰 금액 — 헤더에 이어서 강조 (거래종류와 색 구분) */}
          <span className="inline-flex items-center">
            <Dot />
            <span className="text-base font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">
              {priceStr === "—" ? "—" : priceStr}
            </span>
          </span>
          {/* 상태 배지 — 거래완료/계약진행 등 */}
          {isClosed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400 font-medium">거래완료</span>
          )}
          {hasContractDate && !isClosed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold">계약진행중</span>
          )}
        </div>
        {/* 우측: 즐겨찾기만 */}
        <div className="shrink-0">
          <button onClick={onPin}
            className={`w-6 h-6 flex items-center justify-center rounded-full border transition-colors text-xs ${
              isPinned ? "bg-amber-400 border-amber-400 text-white" : "bg-gray-50 dark:bg-slate-800 border-gray-200 text-gray-400"
            }`}
            title={isPinned ? "즐겨찾기 해제" : "즐겨찾기 고정"}>⭐</button>
        </div>
      </div>

      {/* ─── 2째줄: 주소 ─── */}
      <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 break-all mb-2 leading-snug">{p.address || "—"}</div>

      {/* ─── 3째줄: 임대차 정보 (만기 • 면적 • 타입 • 방향 • 입주상태) ─── */}
      {/* 구분점 — 진하고 명확, 앞 글자에 붙음 (Dot 음수마진) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400 mb-3">
        {leaseDD !== null && (
          <>
            <span className={`px-2 py-0.5 rounded-full font-bold ${
              leaseUrgent ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
              : leaseCaution ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300"
              : "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300"
            }`}>
              임대만기 {leaseDD < 0 ? `${-leaseDD}일지남` : leaseDD === 0 ? "오늘" : `D-${leaseDD}`}
            </span>
            <span className="text-gray-500 dark:text-gray-400">{p.leaseEndDate}</span>
          </>
        )}
        {p.area && <span className="inline-flex items-center"><Dot />{p.area}㎡{m2ToPyeong(p.area) ? ` (${m2ToPyeong(p.area)}평)` : ""}</span>}
        {p.unitType && <span className="inline-flex items-center"><Dot /><span className="font-semibold text-emerald-700 dark:text-emerald-400">{p.unitType}타입</span></span>}
        {p.rooms && <span className="inline-flex items-center"><Dot />방{p.rooms}개</span>}
        {p.direction && <span className="inline-flex items-center"><Dot />{p.direction}</span>}
        {p.occupancy && p.occupancy !== "tenant" && (
          <span className="inline-flex items-center"><Dot />
          <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">{OCC_LABEL[p.occupancy]}</span></span>
        )}
      </div>

      {/* ── 4째줄: 집주인·임차인 (아이콘 제거, 점 구분) ── */}
      <div className="mt-3 space-y-2">
        {/* 집주인 — 이름 • 전화번호 (점 구분, 아이콘 없음) */}
        {p.ownerPhone && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-gray-600 dark:text-gray-400 shrink-0">집주인 <b className="text-gray-900 dark:text-gray-100">{p.ownerName || ""}</b></span>
            <a href={`tel:${p.ownerPhone.replace(/\D/g,"")}`} className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline font-medium">
              <Dot />{formatPhone(p.ownerPhone)}
            </a>
            <a
              href={`sms:${p.ownerPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${p.ownerName ? ` ${p.ownerName}님` : ""}, 미사금빛공인중개사입니다.\n${p.address} 매물 관련하여 연락드립니다.`)}`}
              className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 ml-auto"
            >
              💬 문자
            </a>
          </div>
        )}

        {/* 임차인 — 이름 • 전화번호 (점 구분, 아이콘 없음) */}
        {(p.tenantName || p.tenantPhone || p.tenantDeposit || p.tenantMonthly) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-orange-600 dark:text-orange-400 shrink-0">임차인 <b className="text-orange-900 dark:text-orange-200">{p.tenantName || ""}</b></span>
            {p.tenantPhone && (
              <a href={`tel:${p.tenantPhone.replace(/\D/g,"")}`} className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline font-medium">
                <Dot />{formatPhone(p.tenantPhone)}
              </a>
            )}
            {(p.tenantDeposit || p.tenantMonthly) && (
              <span className="inline-flex items-center">
                <Dot />
                <span className="text-[11px] text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 rounded-full px-2.5 py-0.5 border border-orange-200 dark:border-orange-800/60 font-medium">
                  보증금 {p.tenantDeposit ? `${fmtNum(p.tenantDeposit)}만` : "—"}
                  {p.tenantMonthly && Number(p.tenantMonthly) > 0 ? ` / 월세 ${fmtNum(p.tenantMonthly)}만` : " (전세)"}
                </span>
              </span>
            )}
            {p.tenantPhone && (
              <a
                href={`sms:${p.tenantPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${p.tenantName ? ` ${p.tenantName}님` : ""}, 미사금빛공인중개사입니다.\n${p.address} 임대차 만기 관련하여 연락드립니다.`)}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 ml-auto"
              >
                💬 문자
              </a>
            )}
          </div>
        )}

        {/* 계약 진행 날짜 */}
        {(p.contractDate || p.downPaymentDate || p.balanceDate) && !isClosed && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {p.contractDate && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-800 flex items-center gap-0.5">
                <span className="material-symbols-outlined text-xs">edit_document</span>
                계약일 {formatDateKo(p.contractDate)}
              </span>
            )}
            {p.downPaymentDate && (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800/60 flex items-center gap-0.5">
                <span className="material-symbols-outlined text-xs">payments</span>
                중도금 {formatDateKo(p.downPaymentDate)}
              </span>
            )}
            {p.balanceDate && (
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full border flex items-center gap-0.5 ${
                balanceOverdue
                  ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
              }`}>
                <span className="material-symbols-outlined text-xs">savings</span>
                잔금일 {formatDateKo(p.balanceDate)}
              </span>
            )}
            {p.commission && (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-bold flex items-center gap-0.5">
                <span className="material-symbols-outlined text-xs">paid</span>
                수수료 {fmtNum(p.commission)}만
              </span>
            )}
          </div>
        )}

        {/* 메모 */}
        {p.memo && (
          <div className="text-[11px] text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/60 rounded-xl px-3 py-2 border border-gray-100 dark:border-slate-700 flex items-start gap-1.5">
            <span className="material-symbols-outlined text-sm text-gray-400 dark:text-gray-500 shrink-0">sticky_note_2</span>
            <span className="leading-relaxed">{p.memo}</span>
          </div>
        )}
      </div>

      {/* ── 스케줄 이력 ── */}
      {schedules.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold"
          >
            <span className="material-symbols-outlined text-sm">event</span>
            스케줄 이력 {schedules.length}건
            <span className="material-symbols-outlined text-xs">{showHistory ? "expand_less" : "expand_more"}</span>
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {sortedSchedules.map(s => (
                <div key={s.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${s.status === "done" ? "bg-gray-50 dark:bg-slate-800/40 text-gray-400" : "bg-blue-50 dark:bg-blue-950/30 text-gray-700 dark:text-gray-200"}`}>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${STYPE_COLORS[s.scheduleType]}`}>{s.scheduleType}</span>
                  <span className="font-medium">{new Date(s.date + "T00:00:00").toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" })}</span>
                  <span>{s.time}</span>
                  {s.visitorName && <span className="text-gray-500 dark:text-gray-400">· {s.visitorName}</span>}
                  {s.status === "done" && <span className="ml-auto text-[10px] text-green-600 dark:text-green-400">완료</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 5째줄: 액션 버튼 (아이콘 없이 텍스트만 — 색으로 구분, 어머니 피드백) ─── */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
        {/* 통일 스타일: text-xs px-3 py-1.5 rounded-full border font-semibold */}
        <button
          onClick={onEdit}
          className="text-xs px-3 py-1.5 rounded-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
        >
          수정
        </button>
        {!isClosed && (
          <button
            onClick={onCloneSameComplex}
            title="같은 단지에 다른 호수 빠른 등록"
            className="text-xs px-3 py-1.5 rounded-full border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
          >
            같은 단지 추가
          </button>
        )}
        {!isClosed && (
          <button
            onClick={onProgress}
            title={hasContractDate ? "계약 진행 정보 수정" : "계약 체결 → 4개 날짜 입력"}
            className="text-xs px-3 py-1.5 rounded-full border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
          >
            {hasContractDate ? "계약 정보 수정" : "계약 진행"}
          </button>
        )}
        {isClosed ? (
          <button
            onClick={onReopen}
            className="text-xs px-3 py-1.5 rounded-full border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
          >
            진행중으로 복구
          </button>
        ) : (
          <button
            onClick={onClose}
            title="거래 완료 → 만기 관리로 이동 (매매·전세·월세 모두 동일)"
            className="text-xs px-3 py-1.5 rounded-full border border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
          >
            거래완료 → 만기
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-xs px-3 py-1.5 rounded-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors ml-auto"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

/* ── 매물 등록/수정 모달 ── */