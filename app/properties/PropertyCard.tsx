"use client";

/** 매물 카드 — page.tsx 분리 리팩토링으로 추출 */

import { useState } from "react";
import type { Property } from "@/lib/properties-db";
import type { Schedule } from "@/lib/schedules-db";
import { dDay, severityOf, severityClasses, severityLabel, dDayLabel } from "@/app/expiry/contracts";
import { formatPhone, fmtNum, formatDateKo, m2ToPyeong, DEAL_BADGE, addressStr } from "./helpers";

const STYPE_COLORS: Record<string, string> = {
  "집보기": "bg-blue-100 text-blue-700",
  "계약":   "bg-purple-100 text-purple-700",
  "잔금":   "bg-orange-100 text-orange-700",
  "재계약일": "bg-emerald-100 text-emerald-700",
  "기타":   "bg-gray-100 text-gray-600",
};

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

  // 계약 진행 상태
  const hasContractDate = !!p.contractDate;
  const hasBalanceDate = !!p.balanceDate;
  const today = new Date().toISOString().slice(0, 10);
  const balanceOverdue = hasBalanceDate && p.balanceDate <= today;

  const OCC_LABEL: Record<string, string> = { tenant: "임대중", jeonse: "전세", wolse: "월세", owner: "주인거주", vacant: "공실" };

  // ── 카드 외곽 톤
  const cardClass =
    isPinned && !isClosed
      ? "border-amber-300 dark:border-amber-700 ring-2 ring-amber-100 dark:ring-amber-900/40 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/30 dark:to-slate-900"
      : isClosed
      ? "bg-gray-50/60 dark:bg-slate-900/40 border-gray-200 dark:border-slate-700 opacity-70"
      : balanceOverdue
      ? "bg-white dark:bg-slate-900 border-red-300 dark:border-red-800 shadow-sm ring-2 ring-red-100 dark:ring-red-950/40"
      : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md";

  const sev = leaseDD !== null ? severityOf(leaseDD) : null;
  const sevCls = sev ? severityClasses(sev) : null;
  const area = p.area ? (m2ToPyeong(p.area) ? `전용 ${p.area}㎡ · ${m2ToPyeong(p.area)}평` : `전용 ${p.area}㎡`) : "";
  const smsHref = (phone: string, name: string, tail: string) =>
    `sms:${phone.replace(/\D/g, "")}?body=${encodeURIComponent(`안녕하세요${name ? ` ${name}님` : ""}, 미사금빛공인중개사입니다.\n${p.address} ${tail} 관련하여 연락드립니다.`)}`;
  const hasTenant = !!(p.tenantName || p.tenantPhone);

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 transition-all ${cardClass}`}>
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

      <div className="flex items-start gap-3">
        {/* 만기 D-day 배지 (만기 관리와 동일) */}
        {sevCls && leaseDD !== null && (
          <div className="flex-shrink-0">
            <div className={`inline-flex flex-col items-center justify-center min-w-[64px] px-2 py-1.5 rounded-xl border ${sevCls.badge} text-center`}>
              <div className="text-[10px] font-medium leading-tight">{severityLabel(sev!)}</div>
              <div className="text-sm font-bold leading-tight">{dDayLabel(leaseDD)}</div>
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* 1째줄: 매물종류 · 거래종류 · 전용·평수 */}
          <div className="flex items-baseline gap-x-1.5 min-w-0">
            {p.propertyType && <span className="flex-shrink-0 whitespace-nowrap text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-medium">{p.propertyType}</span>}
            <span className={`flex-shrink-0 whitespace-nowrap text-[11px] px-1.5 py-0.5 rounded font-medium ${DEAL_BADGE[p.dealType] || "bg-gray-100 text-gray-600"}`}>{p.dealType}</span>
            {area && <span className="flex-shrink-0 whitespace-nowrap text-[11px] text-gray-600 dark:text-gray-400">{area}</span>}
            {isClosed && <span className="flex-shrink-0 whitespace-nowrap text-[11px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400">거래완료</span>}
            {hasContractDate && !isClosed && <span className="flex-shrink-0 whitespace-nowrap text-[11px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold">계약진행중</span>}
            <button onClick={onPin}
              className={`ml-auto flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors text-xs ${
                isPinned ? "bg-amber-400 border-amber-400 text-white" : "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-400"
              }`}
              title={isPinned ? "즐겨찾기 해제" : "즐겨찾기 고정"}>⭐</button>
          </div>

          {/* 2째줄: 주소(단지·동호) 옆에 금액 — 주소가 길면 주소 끝만 ...으로 */}
          <div className="mt-0.5 flex items-baseline gap-x-2 min-w-0">
            <span className="min-w-0 truncate text-[12px] font-semibold text-gray-900 dark:text-gray-100" title={addressStr(p)}>
              {addressStr(p) || "—"}
            </span>
            <span className="flex-shrink-0 whitespace-nowrap text-sm font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">{priceStr}</span>
          </div>

          {(p.unitType || p.rooms || p.direction || (p.occupancy && p.occupancy !== "tenant")) && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
              {p.unitType && <span className="font-semibold text-emerald-700 dark:text-emerald-400">{p.unitType}타입</span>}
              {p.rooms && <span>방{p.rooms}개</span>}
              {p.direction && <span>{p.direction}</span>}
              {p.occupancy && p.occupancy !== "tenant" && <span>{OCC_LABEL[p.occupancy]}</span>}
            </div>
          )}

          {/* 3째줄: 만기 */}
          {p.leaseEndDate && (
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              만기 <span className="whitespace-nowrap font-semibold text-blue-800 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-200 px-1.5 py-0.5 rounded">{p.leaseEndDate}</span>
            </div>
          )}

          {/* 연락처 — 임대인 → 임차인 */}
          {(p.ownerPhone || p.ownerName || hasTenant) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {(p.ownerPhone || p.ownerName) && (
                <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">임대인</span>
                  <span className="text-gray-800 dark:text-gray-200 truncate max-w-[6rem]">{p.ownerName || "—"}</span>
                  {p.ownerPhone && (
                    <>
                      <a href={`tel:${p.ownerPhone.replace(/\D/g, "")}`} className="text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">📞 {formatPhone(p.ownerPhone)}</a>
                      {p.ownerCarrier && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-slate-700">{p.ownerCarrier}</span>}
                      <a href={smsHref(p.ownerPhone, p.ownerName, "매물")} className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40">문자</a>
                    </>
                  )}
                </div>
              )}
              {hasTenant && (
                <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">임차인</span>
                  <span className="text-gray-800 dark:text-gray-200 truncate max-w-[6rem]">{p.tenantName || "—"}</span>
                  {p.tenantPhone && (
                    <>
                      <a href={`tel:${p.tenantPhone.replace(/\D/g, "")}`} className="text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">📞 {formatPhone(p.tenantPhone)}</a>
                      <a href={smsHref(p.tenantPhone, p.tenantName, "임대차 만기")} className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40">문자</a>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 계약 진행 날짜 */}
          {(p.contractDate || p.downPaymentDate || p.balanceDate) && !isClosed && (
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
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

          {/* 옵션 */}
          {p.options && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-gray-400 dark:text-gray-500 mr-0.5">옵션</span>
              {p.options.split(",").map(s => s.trim()).filter(Boolean).map((o, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">{o}</span>
              ))}
            </div>
          )}

          {/* 메모 */}
          {p.memo && (
            <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/60 rounded px-2 py-1 border border-gray-100 dark:border-slate-700 whitespace-pre-wrap">
              💬 {p.memo}
            </div>
          )}
        </div>
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

      {/* 액션 버튼 — 만기 관리와 같은 모양 */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
        <button onClick={onEdit}
          className="text-[11px] px-2.5 py-1 rounded-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
          ✏️ 수정
        </button>
        {!isClosed && (
          <button onClick={onCloneSameComplex} title="같은 단지에 다른 호수 빠른 등록"
            className="text-[11px] px-2.5 py-1 rounded-full border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold hover:bg-teal-100 transition-colors">
            📋 같은 단지 추가
          </button>
        )}
        {!isClosed && (
          <button onClick={onProgress} title={hasContractDate ? "계약 진행 정보 수정" : "계약 체결 → 4개 날짜 입력"}
            className="text-[11px] px-2.5 py-1 rounded-full border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold hover:bg-purple-100 transition-colors">
            📝 {hasContractDate ? "계약 정보 수정" : "계약 진행"}
          </button>
        )}
        {isClosed ? (
          <button onClick={onReopen}
            className="text-[11px] px-2.5 py-1 rounded-full border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 transition-colors">
            ↩️ 진행중으로 복구
          </button>
        ) : (
          <button onClick={onClose} title="거래 완료 → 만기 관리로 이동 (매매·전세·월세 모두 동일)"
            className="text-[11px] px-2.5 py-1 rounded-full border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-semibold hover:bg-red-100 transition-colors">
            ✅ 거래완료 → 만기
          </button>
        )}
        <button onClick={onDelete}
          className="text-[11px] px-2.5 py-1 rounded-full border border-red-300 bg-red-50 text-red-700 font-semibold hover:bg-red-100 transition-colors ml-auto">
          🗑️ 삭제
        </button>
      </div>
    </div>
  );
}

/* ── 매물 등록/수정 모달 ── */
