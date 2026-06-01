"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeProperties, saveProperty, deleteProperty, emptyProperty,
  sampleProperties, savePropertiesBatch,
  type Property, type PropertyType, type DealType,
} from "@/lib/properties-db";
import { dDay } from "@/app/expiry/contracts";
import { subscribeSchedules, type Schedule } from "@/lib/schedules-db";
import { moveToContract } from "@/lib/contracts-db";
import { subscribeCustomers } from "@/lib/customers-db";
import type { Customer } from "@/app/customers/customer-types";
import ComplexPickerWidget from "@/app/ComplexPicker";
import PropertiesUploadModal, { type PropMergeStrategy } from "./PropertiesUploadModal";
import ExportModal from "../ExportModal";
import { exportProperties } from "@/lib/export";

const PROPERTY_TYPES: PropertyType[] = ["아파트", "오피스텔", "빌라/다세대", "원룸/투룸", "상가", "사무실", "토지", "기타"];
const DEAL_TYPES: DealType[] = ["매매", "전세", "월세"];
const DIRECTIONS = ["동향", "서향", "남향", "북향", "남동향", "남서향", "북동향", "북서향"];

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return raw;
}

/** 천단위 콤마 — "29600" → "29,600" */
function fmtNum(s: string): string {
  if (!s) return "";
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  if (isNaN(n)) return s;
  return n.toLocaleString();
}

/** 한국식 단위 보조 — "29600" → "2억 9,600" */
function fmtKoreanNum(s: string): string {
  const n = parseInt((s || "").replace(/[^\d]/g, ""), 10);
  if (isNaN(n) || n === 0) return "0";
  const eok = Math.floor(n / 10000);
  const man = n % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}`;
  if (eok > 0) return `${eok}억`;
  return man.toLocaleString();
}

export default function PropertiesPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [progressing, setProgressing] = useState<Property | null>(null);   // 계약 진행 모달
  const [showUpload, setShowUpload] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | DealType>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  // 계약진행중 탭: "available"=계약없음, "contracted"=임차인있음(계약진행중)
  const [viewMode, setViewMode] = useState<"available" | "contracted">("available");
  // 정렬: 등록순(newest) / 금액 낮은순(price_asc) / 금액 높은순(price_desc)
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc">("newest");
  // 가격대 빠른 필터 (만원 기준)
  const [priceRange, setPriceRange] = useState<"all" | "u1" | "1to2" | "2to3" | "3to5" | "o5">("all");
  // 즐겨찾기 (localStorage)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("property_pins") || "[]")); } catch { return new Set(); }
  });
  const togglePin = (id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("property_pins", JSON.stringify([...next]));
      return next;
    });
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/properties");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeProperties(user.agencyId, list => { setProperties(list); setLoaded(true); });
    const u2 = subscribeSchedules(user.agencyId, setSchedules);
    const u3 = subscribeCustomers(user.agencyId, setCustomers);
    return () => { u1(); u2(); u3(); };
  }, [user]);

  const upsert = async (p: Property) => {
    if (!user) return;
    await saveProperty(user.agencyId, p);
  };

  const remove = async (id: string) => {
    if (!user || !confirm("이 매물을 삭제할까요? 되돌릴 수 없습니다.")) return;
    await deleteProperty(user.agencyId, id);
  };

  /**
   * 같은 단지의 다른 호수 빠른 등록
   * - 단지명(주소 - 동호수 제외)·매물유형·거래종류는 복사
   * - 동호수·임대인·가격·면적·방향 등은 비움 (호별로 다름)
   */
  const cloneSameComplex = (p: Property) => {
    const baseAddress = p.address
      .replace(/ ?\d+동/g, "")
      .replace(/ ?\d+호/g, "")
      .replace(/ ?제\d+층/g, "")
      .replace(/ ?제[\d-]+호/g, "")
      .trim();
    setEditing({
      ...emptyProperty(),
      address: baseAddress,
      propertyType: p.propertyType,
      dealType: p.dealType,
      // 가격은 비슷한 경우가 많아 참고값으로 복사 (수정 가능)
      price: "",
      monthly: "",
      memo: "",
    });
  };

  const close = async (p: Property) => {
    if (!user) return;
    // 매매는 거래완료 = 만기 관리로 이동 (사용자 결정: Q1 답변)
    if (p.dealType === "매매") {
      if (!confirm(`${p.address}\n\n매매 거래완료 처리하시겠어요?\n→ 만기 관리(거래 이력)로 이동됩니다.`)) return;
      try {
        await moveToContract(user.agencyId, p);
        setTimeout(() => alert("✅ 매매 거래완료 — 만기 관리로 이동되었습니다."), 100);
      } catch (e) {
        console.error("[close-매매] 실패:", e);
        alert("처리 중 오류가 발생했습니다.");
      }
      return;
    }
    // 전·월세: 단순히 광고 종료 (status: closed). 만기 관리는 "만기로 보내기" 별도 버튼으로
    if (!confirm("거래완료 처리할까요? (광고 종료, 만기 관리로 이동은 [만기로 보내기] 버튼 사용)")) return;
    await saveProperty(user.agencyId, { ...p, status: "closed" });
  };

  /**
   * 만기로 보내기 — Property→Contract 이동
   * - 임차인 정보 있으면 손님 관리에 자동 등록 (전화번호 중복 체크)
   * - Property 삭제 + Contract 생성
   */
  const sendToExpiry = async (p: Property) => {
    if (!user) return;
    const label = p.dealType === "매매" ? "거래완료 처리하고 만기 관리로 이동할까요?" : "이 매물을 만기 관리로 옮길까요? (내 매물에서는 사라집니다)";
    if (!confirm(label)) return;
    try {
      await moveToContract(user.agencyId, p, p.linkedTenantId);
    } catch (e) {
      console.error("[sendToExpiry] 실패:", e);
      alert("만기 관리로 이동 중 오류가 발생했습니다.");
    }
  };

  // 잔금일 경과 매물 (active + 잔금일 today 이전 + 아직 닫지 않은 알림)
  const balanceOverdue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return properties.filter(p =>
      p.status === "active"
      && p.balanceDate
      && p.balanceDate <= today
      && !dismissedAlertIds.has(p.id),
    );
  }, [properties, dismissedAlertIds]);

  const handleUploadConfirm = async (toSave: Property[], strategy: PropMergeStrategy) => {
    if (!user) return;
    if (strategy === "replace") {
      for (const p of properties) {
        await deleteProperty(user.agencyId, p.id);
      }
    }
    for (const p of toSave) {
      await saveProperty(user.agencyId, p);
    }
  };

  const loadSamples = async () => {
    if (!user) return;
    if (properties.length > 0) {
      if (!confirm("기존 매물이 있습니다. 예시 데이터를 추가할까요? (기존 데이터는 유지됩니다)")) return;
    }
    await savePropertiesBatch(user.agencyId, sampleProperties());
  };

  const clearAll = async () => {
    if (!user) return;
    if (!confirm("⚠️ 모든 매물 데이터를 삭제합니다. 정말 진행할까요?")) return;
    for (const p of properties) await deleteProperty(user.agencyId, p.id);
  };


  // 계약진행중 = "계약 진행" 모달에서 contractDate/중도금/잔금일을 입력한 매물
  // (tenantName/tenantPhone은 일반 매물 등록에도 쓰이므로 기준으로 쓰지 않음)
  const isContracted = (p: Property) => !!(p.contractDate || p.downPaymentDate || p.balanceDate);

  // 매물 대표 금액 (만원 int) — 매매/전세=price, 월세=보증금
  const priceNum = (p: Property) => parseInt((p.price || "0").replace(/\D/g, ""), 10) || 0;

  const filtered = useMemo(() => {
    const baseList = showClosed
      ? properties.filter(p => p.status === "closed")
      : properties.filter(p => p.status === "active")
          .filter(p => viewMode === "available" ? !isContracted(p) : isContracted(p));

    const result = baseList
      .filter(p => filterType === "all" || p.dealType === filterType)
      .filter(p => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return p.address.toLowerCase().includes(q)
            || p.ownerName.toLowerCase().includes(q)
            || p.ownerPhone.includes(q)
            || (p.dong || "").includes(q)
            || (p.ho || "").includes(q)
            || (p.tenantName || "").toLowerCase().includes(q)
            || (p.tenantPhone || "").includes(q);
      })
      .filter(p => {
        if (priceRange === "all") return true;
        const n = priceNum(p);
        if (priceRange === "u1")    return n < 10000;
        if (priceRange === "1to2")  return n >= 10000 && n < 20000;
        if (priceRange === "2to3")  return n >= 20000 && n < 30000;
        if (priceRange === "3to5")  return n >= 30000 && n < 50000;
        if (priceRange === "o5")    return n >= 50000;
        return true;
      });

    // 정렬 (즐겨찾기는 항상 상단)
    const sorted = sortBy === "price_asc"  ? [...result].sort((a, b) => priceNum(a) - priceNum(b))
                 : sortBy === "price_desc" ? [...result].sort((a, b) => priceNum(b) - priceNum(a))
                 : [...result].sort((a, b) => b.createdAt - a.createdAt);
    return sorted.sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 0 : 1;
      const bp = pinnedIds.has(b.id) ? 0 : 1;
      return ap - bp;
    });
  }, [properties, showClosed, filterType, query, viewMode, sortBy, priceRange, pinnedIds]);

  const counts = useMemo(() => {
    const active = properties.filter(p => p.status === "active");
    return {
      all: active.length,
      available: active.filter(p => !isContracted(p)).length,
      contracted: active.filter(p => isContracted(p)).length,
      매매: active.filter(p => p.dealType === "매매").length,
      전세: active.filter(p => p.dealType === "전세").length,
      월세: active.filter(p => p.dealType === "월세").length,
    };
  }, [properties]);

  // 월별 수수료 매출 — 잔금일(balanceDate) 기준, 거래완료 포함 전체 집계
  const commissionStats = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const byMonth: Record<string, number> = {};
    let thisMonthTotal = 0;
    let pendingTotal = 0; // 잔금일 미래 = 예정 매출
    const today = new Date().toISOString().slice(0, 10);
    for (const p of properties) {
      const amt = parseInt((p.commission || "0").replace(/\D/g, ""), 10) || 0;
      if (amt === 0 || !p.balanceDate) continue;
      const month = p.balanceDate.slice(0, 7);
      byMonth[month] = (byMonth[month] || 0) + amt;
      if (month === thisMonth) thisMonthTotal += amt;
      if (p.balanceDate >= today) pendingTotal += amt;
    }
    // 최근 6개월 내림차순
    const months = Object.keys(byMonth).sort().reverse().slice(0, 6);
    return { thisMonthTotal, pendingTotal, byMonth, months };
  }, [properties]);

  if (authLoading || !user) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* 사용자 바 */}
        <div className="flex items-center justify-end gap-2 mb-3 text-[11px] text-gray-500">
          <span>👤 {user.displayName || user.email}</span>
          <span className="text-gray-300">·</span>
          <button onClick={() => { if (confirm("로그아웃?")) signOut(); }} className="hover:text-blue-600 hover:underline">로그아웃</button>
        </div>

        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            🏘️ 내 매물 관리
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">내 매물 목록</h1>
          <p className="text-gray-500 text-xs sm:text-sm mb-4">등록 매물에서 바로 전화·문자 연결</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setEditing(emptyProperty())}
              className="px-5 py-2.5 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors"
            >
              + 매물 등록
            </button>
            <button
              onClick={() => setShowUpload(true)}
              title="엑셀 파일에서 한 번에 여러 매물 등록"
              className="px-4 py-2.5 rounded-full border border-gray-300 text-gray-700 text-sm hover:border-emerald-500 hover:text-emerald-700 transition-colors"
            >
              📥 엑셀 업로드
            </button>
            <button
              onClick={() => setShowExport(true)}
              title="현재 매물을 엑셀로 다운로드 — 백업/다른 시스템 이관"
              className="px-4 py-2.5 rounded-full border border-gray-300 text-gray-700 text-sm hover:border-emerald-500 hover:text-emerald-700 transition-colors"
            >
              📤 내보내기
            </button>
            <button
              onClick={loadSamples}
              title="예시 매물 6건 추가 (테스트용)"
              className="px-4 py-2.5 rounded-full border border-gray-300 text-gray-700 text-sm hover:border-emerald-500 hover:text-emerald-700 transition-colors"
            >
              🧪 예시 데이터
            </button>
            {properties.length > 0 && (
              <button
                onClick={clearAll}
                title="모든 매물 데이터 삭제"
                className="px-4 py-2.5 rounded-full border border-gray-300 text-gray-500 text-sm hover:border-red-400 hover:text-red-600 transition-colors"
              >
                🗑️ 전체 삭제
              </button>
            )}
          </div>
        </div>

        {/* 잔금일 경과 알림 — 만기 관리로 이동 권유 */}
        {balanceOverdue.length > 0 && (
          <div className="mb-4 rounded-2xl border-2 border-red-300 bg-red-50 p-3 sm:p-4">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-lg">🔔</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-red-700">잔금일이 지난 매물 {balanceOverdue.length}건</div>
                <div className="text-xs text-red-600 mt-0.5">계약이 완료된 매물입니다. 만기 관리로 옮기시겠어요?</div>
              </div>
            </div>
            <div className="space-y-1.5 mt-2">
              {balanceOverdue.map(p => {
                const daysOver = Math.max(0, Math.round((Date.now() - new Date(p.balanceDate).getTime()) / 86400000));
                return (
                  <div key={p.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-red-200">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0">{p.dealType}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{p.address}</div>
                      <div className="text-[10px] text-red-600">잔금일 {p.balanceDate} ({daysOver}일 지남)</div>
                    </div>
                    <button
                      onClick={() => sendToExpiry(p)}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-red-600 text-white font-semibold hover:bg-red-700 shrink-0"
                    >
                      만기로 보내기
                    </button>
                    <button
                      onClick={() => setDismissedAlertIds(s => new Set(s).add(p.id))}
                      title="이번 세션에서 숨기기"
                      className="text-[10px] text-gray-400 hover:text-gray-600 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 계약 상태 탭 */}
        {!showClosed && (
          <div className="flex rounded-2xl overflow-hidden border border-gray-200 mb-4 shadow-sm">
            <button
              onClick={() => setViewMode("available")}
              className={`flex-1 flex items-center justify-between px-4 py-3.5 transition-all ${
                viewMode === "available"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-gray-600 hover:bg-emerald-50"
              }`}
            >
              <div className="text-left">
                <div className="text-xs font-medium opacity-80">매물 관리</div>
                <div className="text-[11px] opacity-70">계약 없는 매물</div>
              </div>
              <div className={`text-2xl font-bold ml-2 ${viewMode === "available" ? "text-white" : "text-emerald-600"}`}>
                {counts.available}
              </div>
            </button>
            <div className="w-px bg-gray-200" />
            <button
              onClick={() => setViewMode("contracted")}
              className={`flex-1 flex items-center justify-between px-4 py-3.5 transition-all ${
                viewMode === "contracted"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-blue-50"
              }`}
            >
              <div className="text-left">
                <div className="text-xs font-medium opacity-80">🤝 계약진행중</div>
                <div className="text-[11px] opacity-70">계약일 입력한 매물</div>
              </div>
              <div className={`text-2xl font-bold ml-2 ${viewMode === "contracted" ? "text-white" : "text-blue-600"}`}>
                {counts.contracted}
              </div>
            </button>
          </div>
        )}

        {/* 수수료 매출 요약 — 계약진행중 탭에서 항상 표시 */}
        {!showClosed && viewMode === "contracted" && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-xs font-bold text-emerald-800">💰 중개 수수료 매출</div>
              <span className="text-[10px] text-emerald-600">잔금일 기준</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <div className="bg-white rounded-xl p-2.5 border border-emerald-100">
                <div className="text-[10px] text-gray-500">이번 달 매출</div>
                <div className="text-lg font-bold text-emerald-700">{fmtNum(String(commissionStats.thisMonthTotal))}<span className="text-xs font-normal text-gray-400 ml-0.5">만</span></div>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-emerald-100">
                <div className="text-[10px] text-gray-500">예정 매출 (잔금 전)</div>
                <div className="text-lg font-bold text-blue-600">{fmtNum(String(commissionStats.pendingTotal))}<span className="text-xs font-normal text-gray-400 ml-0.5">만</span></div>
              </div>
            </div>
            {commissionStats.months.length > 0 ? (
              <div className="space-y-1">
                {commissionStats.months.map(m => {
                  const [y, mo] = m.split("-");
                  const isThis = m === new Date().toISOString().slice(0, 7);
                  return (
                    <div key={m} className={`flex items-center justify-between text-xs px-2 py-1 rounded-lg ${isThis ? "bg-emerald-100 font-semibold text-emerald-800" : "text-gray-600"}`}>
                      <span>{y}년 {parseInt(mo, 10)}월{isThis ? " (이번 달)" : ""}</span>
                      <span>{fmtNum(String(commissionStats.byMonth[m]))}만</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-emerald-700 bg-white rounded-xl px-3 py-2 border border-emerald-100">
                💡 [계약 정보 수정]에서 <b>수수료</b>와 <b>잔금일</b>을 입력하면 월별 매출이 집계됩니다.
              </p>
            )}
          </div>
        )}

        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {(["all", "매매", "전세", "월세"] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`rounded-2xl border p-3 text-center transition-colors ${filterType === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-gray-200 hover:border-emerald-400"}`}
            >
              <div className="text-lg font-bold">{counts[t === "all" ? "all" : t]}</div>
              <div className="text-[10px] mt-0.5 opacity-80">{t === "all" ? "전체" : t}</div>
            </button>
          ))}
        </div>

        {/* 검색 + 필터 */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-3 mb-4">
          <input
            type="text"
            placeholder="🔍 주소 · 집주인 이름 · 연락처 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2"
          />
          {/* 가격대 빠른 필터 */}
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            <span className="text-[11px] text-gray-500 shrink-0">가격대</span>
            {([
              { key: "all",   label: "전체" },
              { key: "u1",    label: "1억↓" },
              { key: "1to2",  label: "1~2억" },
              { key: "2to3",  label: "2~3억" },
              { key: "3to5",  label: "3~5억" },
              { key: "o5",    label: "5억↑" },
            ] as const).map(r => (
              <button key={r.key} onClick={() => setPriceRange(r.key)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  priceRange === r.key
                    ? "bg-emerald-600 text-white border-emerald-600 font-semibold"
                    : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"
                }`}>
                {r.label}
              </button>
            ))}
          </div>

          {/* 정렬 */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="text-[11px] text-gray-500 shrink-0">정렬</span>
            {([
              { key: "newest",     label: "📅 최신순" },
              { key: "price_asc",  label: "💰 금액 낮은순" },
              { key: "price_desc", label: "💰 금액 높은순" },
            ] as const).map(s => (
              <button key={s.key} onClick={() => setSortBy(s.key)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  sortBy === s.key
                    ? "bg-emerald-600 text-white border-emerald-600 font-semibold"
                    : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"
                }`}>
                {s.label}
              </button>
            ))}
            <div className="flex-1" />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="accent-emerald-600" />
              거래완료 보기
            </label>
          </div>
        </div>

        {/* 목록 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center">
            <div className="text-5xl mb-3">🏘️</div>
            <div className="text-base font-semibold text-gray-900 mb-1">
              {properties.filter(p => p.status === "active").length === 0 ? "등록된 매물이 없습니다" : "조건에 맞는 매물이 없습니다"}
            </div>
            <div className="text-xs text-gray-500 mb-4">매물 등록 버튼을 눌러 추가해보세요</div>
            <button onClick={() => setEditing(emptyProperty())} className="text-sm px-4 py-2 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold">
              + 첫 매물 등록
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(p => (
              <PropertyCard
                key={p.id}
                property={p}
                schedules={schedules.filter(s => s.propertyId === p.id)}
                isPinned={pinnedIds.has(p.id)}
                onPin={() => togglePin(p.id)}
                onEdit={() => setEditing({ ...p })}
                onClose={() => close(p)}
                onDelete={() => remove(p.id)}
                onReopen={() => saveProperty(user.agencyId, { ...p, status: "active" })}
                onProgress={() => setProgressing({ ...p })}
                onSendToExpiry={() => sendToExpiry(p)}
                onCloneSameComplex={() => cloneSameComplex(p)}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <PropertyModal
          property={editing}
          onClose={() => setEditing(null)}
          onSave={async p => { await upsert(p); setEditing(null); }}
        />
      )}

      {progressing && (
        <ContractProgressModal
          property={progressing}
          customers={customers}
          onClose={() => setProgressing(null)}
          onSave={async (updated) => {
            if (!user) return;
            await saveProperty(user.agencyId, { ...updated });
            setProgressing(null);
          }}
        />
      )}

      {showUpload && (
        <PropertiesUploadModal
          existing={properties}
          onClose={() => setShowUpload(false)}
          onConfirm={handleUploadConfirm}
        />
      )}

      {showExport && (
        <ExportModal
          type="properties"
          totalCount={properties.length}
          activeCount={properties.filter(p => p.status === "active").length}
          onClose={() => setShowExport(false)}
          onExport={(opt) => exportProperties(properties, opt)}
        />
      )}

    </div>
  );
}

const STYPE_COLORS: Record<string, string> = {
  "집보기": "bg-blue-100 text-blue-700",
  "계약":   "bg-purple-100 text-purple-700",
  "잔금":   "bg-orange-100 text-orange-700",
  "기타":   "bg-gray-100 text-gray-600",
};

/* ── 매물 카드 ── */
function PropertyCard({ property: p, schedules, isPinned, onPin, onEdit, onClose, onDelete, onReopen, onProgress, onSendToExpiry, onCloneSameComplex }: {
  property: Property;
  schedules: Schedule[];
  isPinned: boolean;
  onPin: () => void;
  onEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
  onReopen: () => void;
  onProgress: () => void;
  onSendToExpiry: () => void;
  onCloneSameComplex: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const isClosed = p.status === "closed";
  const mapUrl = `https://map.kakao.com/?q=${encodeURIComponent(p.address)}`;
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

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${isPinned && !isClosed ? "border-yellow-300 ring-2 ring-yellow-100" : isClosed ? "bg-gray-50/60 border-gray-200 opacity-70" : balanceOverdue ? "bg-white border-red-300 shadow-sm ring-2 ring-red-100" : "bg-white border-gray-200 shadow-sm"}`}>
      {/* 잔금일 경과 카드 내 빨간 배너 */}
      {balanceOverdue && !isClosed && (
        <div className="mb-2 -mt-1 -mx-1 px-2 py-1.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-[11px]">
          <span>🔔</span>
          <span className="text-red-700 font-medium">잔금일이 지났습니다 ({p.balanceDate})</span>
          <button onClick={onSendToExpiry} className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-semibold hover:bg-red-700">만기 관리로 →</button>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* 즐겨찾기 + 지도 버튼 (카드 우상단) */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex flex-wrap items-center gap-1.5 flex-1">
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">{p.dealType}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{p.propertyType}</span>
            {isClosed && <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">거래완료</span>}
            {hasContractDate && !isClosed && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">📝 계약진행중</span>
            )}
            {leaseDD !== null && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${leaseUrgent ? "bg-red-100 text-red-700" : leaseCaution ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"}`}>
                ⏰ 임대만기 {leaseDD < 0 ? `${-leaseDD}일지남` : leaseDD === 0 ? "오늘" : `D-${leaseDD}`}
              </span>
            )}
              <span className="text-sm font-bold text-gray-900 truncate">{priceStr}</span>
            </div>
            {/* 즐겨찾기 + 지도 버튼 */}
            <div className="flex items-center gap-1 shrink-0">
              <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors text-sm"
                title="네이버 지도로 보기">
                🗺️
              </a>
              <button onClick={onPin}
                className={`w-8 h-8 flex items-center justify-center rounded-full border transition-colors text-sm ${isPinned ? "bg-yellow-400 border-yellow-400 text-white" : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-yellow-50 hover:border-yellow-300"}`}
                title={isPinned ? "즐겨찾기 해제" : "즐겨찾기 고정"}>
                ⭐
              </button>
            </div>
          </div>
          <div className="text-sm font-semibold text-gray-800 break-all mb-1">{p.address || "—"}</div>
          <div className="text-xs text-gray-500 flex flex-wrap gap-2">
            {p.dong && <span>{p.dong}동</span>}
            {p.ho && <span>{p.ho}호</span>}
            {p.area && <span>{p.area}㎡</span>}
            {p.floor && <span>{p.floor}층</span>}
            {p.rooms && <span>방{p.rooms}개</span>}
            {p.direction && <span>{p.direction}</span>}
          </div>

          {/* 집주인 연락처 */}
          {p.ownerPhone && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-gray-500 shrink-0">집주인 {p.ownerName || ""}</span>
              <a href={`tel:${p.ownerPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(p.ownerPhone)}</a>
              <a
                href={`sms:${p.ownerPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${p.ownerName ? ` ${p.ownerName}님` : ""}, 미사금빛공인중개사입니다.\n${p.address} 매물 관련하여 연락드립니다.`)}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 ml-auto"
              >
                문자
              </a>
            </div>
          )}

          {/* 임차인 정보 (이름 또는 전화 중 하나라도 있으면 표시) */}
          {(p.tenantName || p.tenantPhone) && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-orange-600 shrink-0">임차인 {p.tenantName || ""}</span>
              {p.tenantPhone ? (
                <>
                  <a href={`tel:${p.tenantPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(p.tenantPhone)}</a>
                  <a
                    href={`sms:${p.tenantPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${p.tenantName ? ` ${p.tenantName}님` : ""}, 미사금빛공인중개사입니다.\n${p.address} 임대차 만기 관련하여 연락드립니다.`)}`}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 ml-auto"
                  >문자</a>
                </>
              ) : (
                <span className="text-gray-400 text-[10px]">연락처 미입력</span>
              )}
            </div>
          )}

          {/* 계약 진행 날짜 (있을 때만) */}
          {(p.contractDate || p.downPaymentDate || p.balanceDate) && !isClosed && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.contractDate && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  📝 계약일 {p.contractDate}
                </span>
              )}
              {p.downPaymentDate && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
                  💰 중도금 {p.downPaymentDate}
                </span>
              )}
              {p.balanceDate && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${balanceOverdue ? "bg-red-50 text-red-700 border-red-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>
                  💵 잔금일 {p.balanceDate}
                </span>
              )}
              {p.commission && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  💵 수수료 {fmtNum(p.commission)}만
                </span>
              )}
            </div>
          )}

          {p.memo && (
            <div className="mt-1.5 text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1 border border-gray-100">💬 {p.memo}</div>
          )}
        </div>
      </div>

      {/* 스케줄 이력 */}
      {schedules.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
          >
            📅 스케줄 이력 {schedules.length}건
            <span className="text-[10px]">{showHistory ? "▲" : "▼"}</span>
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {sortedSchedules.map(s => (
                <div key={s.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${s.status === "done" ? "bg-gray-50 text-gray-400" : "bg-blue-50 text-gray-700"}`}>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${STYPE_COLORS[s.scheduleType]}`}>{s.scheduleType}</span>
                  <span className="font-medium">{new Date(s.date + "T00:00:00").toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" })}</span>
                  <span>{s.time}</span>
                  {s.visitorName && <span className="text-gray-500">· {s.visitorName}</span>}
                  {s.status === "done" && <span className="ml-auto text-[10px] text-green-600">완료</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 액션 — 색 구분감 강화: 수정(회) / 같은단지(에메랄드) / 계약(보) / 만기(빨) / 종료(주황) / 복구(파) / 삭제(빨) */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        <button onClick={onEdit} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors">✏️ 수정</button>
        {!isClosed && (
          <button
            onClick={onCloneSameComplex}
            title={`같은 단지에 다른 호수 빠른 등록 — 단지명·유형은 복사, 동호수·임대인·가격만 입력`}
            className="text-[11px] px-2.5 py-1 rounded-full border border-teal-300 bg-teal-50 text-teal-700 font-semibold hover:bg-teal-100 transition-colors"
          >
            📋 같은 단지 추가
          </button>
        )}
        {!isClosed && (
          <button
            onClick={onProgress}
            title={hasContractDate ? "계약 진행 정보 수정" : "계약 체결 → 4개 날짜 입력"}
            className="text-[11px] px-2.5 py-1 rounded-full border border-purple-300 bg-purple-50 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
          >
            📝 {hasContractDate ? "계약 정보 수정" : "계약 진행"}
          </button>
        )}
        {!isClosed && hasBalanceDate && (
          <button
            onClick={onSendToExpiry}
            title="만기 관리로 옮김 (내 매물에서 사라집니다)"
            className="text-[11px] px-2.5 py-1 rounded-full border-2 border-red-400 bg-red-50 text-red-700 font-bold hover:bg-red-100 transition-colors"
          >
            🚀 만기로 보내기
          </button>
        )}
        {isClosed ? (
          <button onClick={onReopen} className="text-[11px] px-2.5 py-1 rounded-full border border-blue-300 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors">↩️ 진행중으로 복구</button>
        ) : (
          <button
            onClick={onClose}
            title={p.dealType === "매매" ? "매매 거래 완료 → 만기 관리로 이동" : "광고 종료 (만기 관리는 별도 [만기로 보내기] 버튼)"}
            className={
              p.dealType === "매매"
                ? "text-[11px] px-2.5 py-1 rounded-full border-2 border-red-400 bg-red-50 text-red-700 font-bold hover:bg-red-100 transition-colors"
                : "text-[11px] px-2.5 py-1 rounded-full border border-orange-300 bg-orange-50 text-orange-700 font-semibold hover:bg-orange-100 transition-colors"
            }
          >
            {p.dealType === "매매" ? "🚀 거래완료 → 만기" : "⏹️ 광고 종료"}
          </button>
        )}
        <button onClick={onDelete} className="text-[11px] px-2.5 py-1 rounded-full border border-red-300 bg-red-50 text-red-700 font-semibold hover:bg-red-100 transition-colors ml-auto">🗑️ 삭제</button>
      </div>
    </div>
  );
}

/* ── 매물 등록/수정 모달 ── */
function PropertyModal({ property, onClose, onSave }: {
  property: Property;
  onClose: () => void;
  onSave: (p: Property) => Promise<void>;
}) {
  const [form, setForm] = useState<Property>(property);
  const [saving, setSaving] = useState(false);
  const isNew = !property.address;
  const addrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addrSuggestions, setAddrSuggestions] = useState<{ name: string; address: string }[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  // 단지 선택 후 기본 주소 (동/호수 자동합산용)
  const [baseAddress, setBaseAddress] = useState(() => {
    // 기존 수정시: address에서 동/호수 제거한 기본 주소
    if (property.dong || property.ho) {
      return property.address
        .replace(/ ?\d+동/, "").replace(/ ?\d+호/, "").trim();
    }
    return property.address;
  });

  const set = <K extends keyof Property>(k: K, v: Property[K]) => setForm(p => ({ ...p, [k]: v }));

  // 동/호수 변경시 address 자동 업데이트
  const updateFullAddress = (newBase: string, newDong: string, newHo: string) => {
    const parts = [newBase.trim(), newDong ? `${newDong}동` : "", newHo ? `${newHo}호` : ""];
    const full = parts.filter(Boolean).join(" ");
    setForm(p => ({ ...p, address: full }));
  };

  const handleDongChange = (val: string) => {
    setForm(p => {
      const parts = [baseAddress.trim(), val ? `${val}동` : "", p.ho ? `${p.ho}호` : ""];
      return { ...p, dong: val, address: parts.filter(Boolean).join(" ") };
    });
  };

  const handleHoChange = (val: string) => {
    setForm(p => {
      const parts = [baseAddress.trim(), p.dong ? `${p.dong}동` : "", val ? `${val}호` : ""];
      return { ...p, ho: val, address: parts.filter(Boolean).join(" ") };
    });
  };

  const handleAddressChange = (val: string) => {
    setBaseAddress(val);
    updateFullAddress(val, form.dong, form.ho);
    if (addrTimerRef.current) clearTimeout(addrTimerRef.current);
    if (val.trim().length < 2) { setAddrSuggestions([]); return; }
    addrTimerRef.current = setTimeout(async () => {
      setAddrLoading(true);
      try {
        const res = await fetch(`/api/complex-search?q=${encodeURIComponent(val)}`);
        setAddrSuggestions((await res.json()).slice(0, 6));
      } catch { setAddrSuggestions([]); }
      finally { setAddrLoading(false); }
    }, 350);
  };

  // 단지 검색에서 선택시
  const selectComplex = (name: string, addr: string) => {
    const base = `${addr} ${name}`.trim();
    setBaseAddress(base);
    updateFullAddress(base, form.dong, form.ho);
    setAddrSuggestions([]);
  };

  const save = async () => {
    if (!form.address.trim()) { alert("주소를 입력해주세요"); return; }
    setSaving(true);
    try { await onSave({ ...form }); }
    catch { alert("저장 중 오류가 발생했습니다. 다시 시도해주세요."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold">{isNew ? "매물 등록" : "매물 수정"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-3">

          {/* 매물 유형 + 거래 종류 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">매물 유형</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PROPERTY_TYPES.map(t => (
                <button key={t} type="button" onClick={() => set("propertyType", t)}
                  className={`py-1.5 rounded-xl text-xs font-medium border transition-colors ${form.propertyType === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">거래 종류</label>
            <div className="grid grid-cols-3 gap-1.5">
              {DEAL_TYPES.map(t => (
                <button key={t} type="button" onClick={() => set("dealType", t)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.dealType === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 주소 + 동/호수 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">단지명 검색 <span className="text-red-400">*</span></label>
            <div className="relative">
              <input value={baseAddress} onChange={e => handleAddressChange(e.target.value)}
                placeholder="단지명 또는 주소 검색"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" autoComplete="off" />
              {addrLoading && <div className="absolute right-3 top-2.5 text-xs text-gray-400">검색 중…</div>}
              {addrSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {addrSuggestions.map((item, i) => (
                    <button key={i} type="button" onClick={() => selectComplex(item.name, item.address)}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b last:border-0 border-gray-100 transition-colors">
                      <div className="text-sm font-medium text-gray-800">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.address}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-1.5">
              <ComplexPickerWidget
                onSelect={item => selectComplex(item.name, item.address)}
                externalBuildingType={form.propertyType}
              />
            </div>

            {/* 동 / 호수 — 입력하면 주소에 자동 반영 */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">동 번호</label>
                <input type="text" inputMode="numeric" value={form.dong} onChange={e => handleDongChange(e.target.value)}
                  placeholder="101" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">호수</label>
                <input type="text" inputMode="numeric" value={form.ho} onChange={e => handleHoChange(e.target.value)}
                  placeholder="1902" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            {form.address && (
              <div className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                📍 저장 주소: <span className="font-medium">{form.address}</span>
              </div>
            )}
          </div>

          {/* 가격 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{form.dealType === "매매" ? "매매가" : "보증금"} (만원)</label>
              <input type="text" inputMode="numeric" value={form.price ? fmtNum(form.price) : ""} onChange={e => set("price", e.target.value.replace(/\D/g,""))}
                placeholder="29,600" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              {form.price && <div className="mt-1 text-[10px] text-gray-500">≈ {fmtKoreanNum(form.price)}만원</div>}
            </div>
            {form.dealType === "월세" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">월세 (만원)</label>
                <input type="text" inputMode="numeric" value={form.monthly ? fmtNum(form.monthly) : ""} onChange={e => set("monthly", e.target.value.replace(/\D/g,""))}
                  placeholder="70" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            )}
          </div>

          {/* 면적/방수/방향 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전용면적 (㎡)</label>
              <input type="text" inputMode="numeric" value={form.area} onChange={e => set("area", e.target.value)}
                placeholder="84" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">방향</label>
              <select value={form.direction} onChange={e => set("direction", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">선택</option>
                {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">방수</label>
            <input type="text" value={form.rooms} onChange={e => set("rooms", e.target.value)}
              placeholder="3" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>

          {/* 집주인 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">집주인 이름</label>
              <input value={form.ownerName} onChange={e => set("ownerName", e.target.value)}
                placeholder="홍길동" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">집주인 연락처</label>
              <input type="tel" value={form.ownerPhone} onChange={e => set("ownerPhone", e.target.value)}
                placeholder="010-0000-0000" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>

          {/* 임차인 (전세/월세 세입자) */}
          <div className="border border-orange-200 rounded-2xl p-3 bg-orange-50/40">
            <div className="text-xs font-semibold text-orange-700 mb-2">🏠 현재 임차인 (전세·월세 세입자)</div>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">임차인 이름</label>
                <input value={form.tenantName} onChange={e => set("tenantName", e.target.value)}
                  placeholder="홍길동" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">임차인 연락처</label>
                <input type="tel" value={form.tenantPhone} onChange={e => set("tenantPhone", e.target.value)}
                  placeholder="010-0000-0000" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">전세·월세 만기일</label>
              <input type="date" value={form.leaseEndDate} onChange={e => set("leaseEndDate", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <p className="text-[10px] text-orange-600 mt-2">📌 만기일 입력 시 스케줄에서 자동으로 만기 알림 표시</p>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea value={form.memo} onChange={e => set("memo", e.target.value)}
              placeholder="특이사항, 열쇠 위치, 입주 가능일 등"
              rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">취소</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 계약 진행 모달 — 4개 날짜 + 임차인 정보 ── */
function ContractProgressModal({ property, customers, onClose, onSave }: {
  property: Property;
  customers: Customer[];
  onClose: () => void;
  onSave: (p: Property) => Promise<void>;
}) {
  const [form, setForm] = useState<Property>(property);
  const [saving, setSaving] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [showCustList, setShowCustList] = useState(false);
  const set = <K extends keyof Property>(k: K, v: Property[K]) => setForm(p => ({ ...p, [k]: v }));

  // 손님 검색 (이름 또는 전화번호)
  const filteredCustomers = useMemo(() => {
    if (!custQuery.trim()) return customers.slice(0, 8);
    const q = custQuery.toLowerCase().replace(/\D/g, "") || custQuery.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(custQuery.toLowerCase()) ||
      c.phone.replace(/\D/g, "").includes(q)
    ).slice(0, 8);
  }, [custQuery, customers]);

  const selectCustomer = (c: Customer) => {
    setForm(prev => ({ ...prev, tenantName: c.name, tenantPhone: c.phone, linkedTenantId: c.id }));
    setCustQuery(c.name);
    setShowCustList(false);
  };

  const today = new Date().toISOString().slice(0, 10);
  const balanceOverdueLocal = !!form.balanceDate && form.balanceDate <= today;

  const save = async () => {
    if (!form.contractDate && !form.balanceDate) {
      if (!confirm("계약일·잔금일이 비어있습니다. 그래도 저장할까요?")) return;
    }
    // 날짜 순서 검증 — 계약일 ≤ 중도금일 ≤ 잔금일
    const errors: string[] = [];
    if (form.contractDate && form.downPaymentDate && form.contractDate > form.downPaymentDate) {
      errors.push(`• 중도금일(${form.downPaymentDate})이 계약일(${form.contractDate})보다 빠릅니다`);
    }
    if (form.contractDate && form.balanceDate && form.contractDate > form.balanceDate) {
      errors.push(`• 잔금일(${form.balanceDate})이 계약일(${form.contractDate})보다 빠릅니다`);
    }
    if (form.downPaymentDate && form.balanceDate && form.downPaymentDate > form.balanceDate) {
      errors.push(`• 잔금일(${form.balanceDate})이 중도금일(${form.downPaymentDate})보다 빠릅니다`);
    }
    if (errors.length > 0) {
      alert("⚠️ 날짜 순서가 잘못되었습니다:\n\n" + errors.join("\n") + "\n\n순서: 계약일 ≤ 중도금일 ≤ 잔금일");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch {
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <div>
            <h2 className="text-base font-semibold">📝 계약 진행</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">{form.address}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 text-[11px] text-purple-700">
            💡 계약 체결 시 날짜를 입력하면 스케줄에 자동으로 표시됩니다.<br />
            잔금일이 지나면 자동으로 만기 관리로 이동 가능합니다.
          </div>

          {/* 4개 날짜 */}
          <div className="space-y-2.5">
            <div>
              <label className="block text-sm font-medium text-purple-700 mb-1">📝 계약일</label>
              <input type="date" value={form.contractDate} onChange={e => set("contractDate", e.target.value)}
                className="w-full border border-purple-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-pink-700 mb-1">💰 중도금일 <span className="text-gray-400 text-xs font-normal">(선택)</span></label>
              <input type="date" value={form.downPaymentDate} onChange={e => set("downPaymentDate", e.target.value)}
                className="w-full border border-pink-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-red-700 mb-1">💵 잔금일 <span className="text-red-500 text-xs">★</span></label>
              <input type="date" value={form.balanceDate} onChange={e => set("balanceDate", e.target.value)}
                className="w-full border border-red-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400" />
              <p className="text-[10px] text-red-600 mt-1">⚠️ 이 날짜 지나면 자동 알림 → 만기 관리로 이동 가능</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-orange-700 mb-1">⏰ 임대만기일 <span className="text-gray-400 text-xs font-normal">(전·월세만)</span></label>
              <input type="date" value={form.leaseEndDate} onChange={e => set("leaseEndDate", e.target.value)}
                className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-emerald-700 mb-1">💵 중개 수수료 (만원)</label>
              <input type="text" inputMode="numeric" value={form.commission}
                onChange={e => set("commission", e.target.value.replace(/\D/g, ""))}
                placeholder="300"
                className="w-full border border-emerald-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              <p className="text-[10px] text-emerald-600 mt-1">📊 잔금일 기준으로 월별 매출에 합산됩니다</p>
            </div>
          </div>

          {/* 임차인 정보 — 손님관리 검색 연동 */}
          {form.dealType !== "매매" && (
            <div className="border border-orange-200 rounded-2xl p-3 bg-orange-50/40 space-y-2">
              <div className="text-xs font-semibold text-orange-700">🏠 임차인 (손님관리에서 불러오기)</div>

              {/* 손님 검색 드롭다운 */}
              {customers.length > 0 && (
                <div className="relative">
                  <input
                    value={custQuery}
                    onChange={e => { setCustQuery(e.target.value); setShowCustList(true); }}
                    onFocus={() => setShowCustList(true)}
                    placeholder="🔍 손님 이름 또는 전화번호 검색"
                    autoComplete="off"
                    className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  {form.linkedTenantId && (
                    <span className="absolute right-3 top-2 text-[10px] text-blue-600 font-medium">👥 연결됨</span>
                  )}
                  {showCustList && filteredCustomers.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto">
                      {filteredCustomers.map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={e => { e.preventDefault(); selectCustomer(c); }}
                          className="w-full text-left px-3 py-2.5 hover:bg-orange-50 border-b last:border-0 border-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{c.name}</span>
                            <span className="text-xs text-gray-500">{c.phone}</span>
                            {c.vip && <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-100 text-yellow-700">VIP</span>}
                          </div>
                          {c.preferredArea && <div className="text-xs text-gray-400 mt-0.5">희망: {c.preferredArea}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 직접 입력 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">이름</label>
                  <input value={form.tenantName}
                    onChange={e => { set("tenantName", e.target.value); set("linkedTenantId", undefined); setCustQuery(e.target.value); }}
                    placeholder="홍길동"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">연락처</label>
                  <input type="tel" value={form.tenantPhone}
                    onChange={e => { set("tenantPhone", e.target.value); set("linkedTenantId", undefined); }}
                    placeholder="010-0000-0000"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              <p className="text-[10px] text-orange-600">💡 손님관리에 등록된 손님을 검색하거나 직접 입력하세요</p>
            </div>
          )}

          {balanceOverdueLocal && (
            <div className="rounded-xl bg-red-50 border-2 border-red-300 p-3">
              <div className="text-xs font-bold text-red-700 mb-1">🔔 잔금일이 이미 지났습니다</div>
              <div className="text-[11px] text-red-600">저장 후 카드의 &quot;만기로 보내기&quot; 버튼을 누르면 만기 관리로 이동됩니다.</div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">취소</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-60">
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
