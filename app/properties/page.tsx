"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeProperties, saveProperty, deleteProperty, emptyProperty,
  sampleProperties, savePropertiesBatch,
  type Property, type PropertyType, type DealType, type Occupancy,
} from "@/lib/properties-db";
import { dDay } from "@/app/expiry/contracts";
import { subscribeSchedules, type Schedule } from "@/lib/schedules-db";
import { moveToContract } from "@/lib/contracts-db";
import { subscribeCustomers, upsertTenantAsCustomer } from "@/lib/customers-db";
import type { Customer } from "@/app/customers/customer-types";
import { computeSalesStats } from "@/lib/sales";
import Link from "next/link";
import ComplexPickerWidget from "@/app/ComplexPicker";
import KoreanDatePicker from "@/app/KoreanDatePicker";
import PropertiesUploadModal, { type PropMergeStrategy } from "./PropertiesUploadModal";
import ExportModal from "../ExportModal";
import { exportProperties } from "@/lib/export";
import SparklineChart from "@/app/dashboard/components/SparklineChart";

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

/** 날짜·시간 한국식 표시 — "2026-06-17" → "6/17(화)" / "2026-06-17T14:00" → "6/17(화) 14:00" */
function formatDateKo(v: string): string {
  if (!v) return "";
  const hasTime = v.includes("T");
  const d = new Date(hasTime ? v : v + "T00:00:00");
  if (isNaN(d.getTime())) return v;
  const m  = d.getMonth() + 1;
  const dd = d.getDate();
  const w  = "일월화수목금토"[d.getDay()];
  const base = `${m}/${dd}(${w})`;
  if (!hasTime) return base;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${base} ${hh}:${mi}`;
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

/** ㎡ → 평 (소수점 1자리 반올림). 1평 = 3.3058㎡ */
function m2ToPyeong(m2: string): string {
  const n = parseFloat((m2 || "").replace(/[^\d.]/g, ""));
  if (!n || isNaN(n)) return "";
  return (Math.round(n / 3.3058 * 10) / 10).toString();
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
  const [filterPropType, setFilterPropType] = useState<"all" | PropertyType>("all"); // 대분류: 매물 유형
  const [showClosed, setShowClosed] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  // 탭: available=계약 없는 매물(주인거주·공실 포함) / contracted=계약진행중
  const [viewMode, setViewMode] = useState<"available" | "contracted">("available");
  // 입주상태 필터: "" 전체 / owner 집주인 / vacant 공실
  const [occFilter, setOccFilter] = useState<"" | "owner" | "vacant">("");
  // 정렬: 등록순 / 금액 낮은순 / 금액 높은순 / 만기일순 / 잔금일순
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc" | "lease_end" | "balance">("newest");
  // 페이지네이션 — 20건/페이지
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  // 수수료 상세는 /sales 페이지로 이동 (showCommission 제거)
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

  // 필터·정렬·검색·탭 변경 시 1페이지로 리셋
  useEffect(() => {
    setPage(1);
  }, [query, filterType, filterPropType, priceRange, sortBy, viewMode, showClosed, occFilter]);

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
   * - 단지 공통 정보 인계: 주소(동/호 제외), 매물유형, 거래종류, 면적, 방수, 방향
   * - 호별로 다른 정보는 비움: 동호수, 임대인·임차인, 가격, 계약일자, 메모
   *   → 단지 내 매물 빠르게 여러 건 등록 가능
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
      // 단지 공통 — 매물끼리 같은 정보 유지
      address:      baseAddress,
      propertyType: p.propertyType,
      dealType:     p.dealType,
      area:         p.area,
      unitType:     p.unitType,
      rooms:        p.rooms,
      direction:    p.direction,
      // 호별 다른 정보는 빈 채로 → 사용자 입력
      // dong, ho, ownerName, ownerPhone, tenantName/Phone, price, monthly, memo 등
    });
  };

  /**
   * 거래완료 처리 — 매매·전세·월세 모두 만기 관리로 이동 (통일)
   * - 전월세는 임차인 정보 있으면 손님관리 자동 등록
   * - moveToContract: Property → Contract 변환 + Property 삭제
   */
  const close = async (p: Property) => {
    if (!user) return;
    if (!confirm(`${p.address}\n\n${p.dealType} 거래완료 처리하시겠어요?\n→ 만기 관리(거래 이력)로 이동됩니다.`)) return;
    try {
      // 전·월세는 임차인 자동 등록
      let linkedCustomerId: string | undefined = p.linkedTenantId;
      if (p.dealType !== "매매" && (p.tenantName || p.tenantPhone)) {
        const id = await upsertTenantAsCustomer(user.agencyId, {
          name: p.tenantName,
          phone: p.tenantPhone,
          propertyAddress: p.address,
          contractDate: p.contractDate,
        });
        linkedCustomerId = id || linkedCustomerId;
      }
      await moveToContract(user.agencyId, p, linkedCustomerId);
      setTimeout(() => alert(`✅ ${p.dealType} 거래완료 — 만기 관리로 이동되었습니다.`), 100);
    } catch (e) {
      console.error("[close] 실패:", e);
      alert("처리 중 오류가 발생했습니다.");
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

  /** 기존 매물 임차인 → 손님관리 일괄 등록 (전·월세, linkedTenantId 없는 것만) */
  const migrateTenantsToCustomers = async () => {
    if (!user) return;
    const targets = properties.filter(p =>
      p.dealType !== "매매" && (p.tenantName || p.tenantPhone) && !p.linkedTenantId,
    );
    if (targets.length === 0) {
      alert("일괄 등록할 임차인이 없습니다.");
      return;
    }
    if (!confirm(`${targets.length}건의 매물 임차인을 손님관리에 일괄 등록할까요?`)) return;
    let ok = 0, fail = 0;
    for (const p of targets) {
      try {
        const id = await upsertTenantAsCustomer(user.agencyId, {
          name: p.tenantName, phone: p.tenantPhone, propertyAddress: p.address, contractDate: p.contractDate,
        });
        if (id) {
          await saveProperty(user.agencyId, { ...p, linkedTenantId: id });
          ok++;
        } else fail++;
      } catch (e) {
        console.error("[migrate]", e);
        fail++;
      }
    }
    alert(`✅ 일괄 등록 완료\n\n성공: ${ok}건\n실패: ${fail}건`);
  };


  // 계약진행중 = "계약 진행" 모달에서 contractDate/중도금/잔금일을 입력한 매물
  // (tenantName/tenantPhone은 일반 매물 등록에도 쓰이므로 기준으로 쓰지 않음)
  const isContracted = (p: Property) => !!(p.contractDate || p.downPaymentDate || p.balanceDate);

  // 매물 대표 금액 (만원 int) — 매매/전세=price, 월세=보증금
  const priceNum = (p: Property) => parseInt((p.price || "0").replace(/\D/g, ""), 10) || 0;

  // 탭별 매물 분류 (계약진행중 / 그 외)
  const matchView = (p: Property) =>
    viewMode === "contracted" ? isContracted(p) : !isContracted(p);

  const filtered = useMemo(() => {
    const baseList = showClosed
      ? properties.filter(p => p.status === "closed")
      : properties.filter(p => p.status === "active").filter(matchView);

    const result = baseList
      .filter(p => filterPropType === "all" || p.propertyType === filterPropType)
      .filter(p => filterType === "all" || p.dealType === filterType)
      .filter(p => !occFilter || p.occupancy === occFilter)
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

    // 날짜 정렬용 — 빈 값은 맨 뒤로
    const dateKey = (v: string) => v && v.length >= 10 ? v.slice(0, 10) : "9999-99-99";
    // 정렬 (즐겨찾기는 항상 상단)
    const sorted =
      sortBy === "price_asc"  ? [...result].sort((a, b) => priceNum(a) - priceNum(b))
    : sortBy === "price_desc" ? [...result].sort((a, b) => priceNum(b) - priceNum(a))
    : sortBy === "lease_end"  ? [...result].sort((a, b) => dateKey(a.leaseEndDate).localeCompare(dateKey(b.leaseEndDate)))
    : sortBy === "balance"    ? [...result].sort((a, b) => dateKey(a.balanceDate).localeCompare(dateKey(b.balanceDate)))
    :                           [...result].sort((a, b) => b.createdAt - a.createdAt);
    return sorted.sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 0 : 1;
      const bp = pinnedIds.has(b.id) ? 0 : 1;
      return ap - bp;
    });
  }, [properties, showClosed, filterType, filterPropType, query, viewMode, sortBy, priceRange, pinnedIds, occFilter]);

  const counts = useMemo(() => {
    const active = properties.filter(p => p.status === "active");
    const available = active.filter(p => !isContracted(p));
    const contracted = active.filter(p => isContracted(p));

    // 보조 메트릭 — Step4 큰 카드 보조 라인
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeekNew = available.filter(p => p.createdAt >= weekAgo).length;

    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const balanceSoon = contracted.filter(p => p.balanceDate && p.balanceDate >= today && p.balanceDate <= in30).length;

    return {
      all: active.length,
      available: available.length,
      contracted: contracted.length,
      매매: active.filter(p => p.dealType === "매매").length,
      전세: active.filter(p => p.dealType === "전세").length,
      월세: active.filter(p => p.dealType === "월세").length,
      thisWeekNew,
      balanceSoon,
    };
  }, [properties]);

  // 매물 유형별 개수 (대분류 칩) — 현재 탭 기준
  const propTypeCounts = useMemo(() => {
    const base = showClosed
      ? properties.filter(p => p.status === "closed")
      : properties.filter(p => p.status === "active").filter(matchView);
    const map: Record<string, number> = { all: base.length };
    for (const t of PROPERTY_TYPES) map[t] = base.filter(p => p.propertyType === t).length;
    return map;
  }, [properties, showClosed, viewMode]);

  // 수수료 매출 요약 — lib/sales.ts 공용 헬퍼 사용 (홈 대시보드도 같이 쓸 거)
  const commissionStats = useMemo(() => {
    const s = computeSalesStats(properties);
    return {
      thisMonthTotal: s.thisMonth,
      pendingTotal: s.pending,
      thisYearTotal: s.thisYear,
      grandTotal: s.grand,
      allMonths: s.allMonths,
      byMonth: s.byMonth,        // YYYY-MM → 매출 — sparkline용
    };
  }, [properties]);

  if (authLoading || !user) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Stitch 톤 페이지 헤더 — 좌측 제목 + 우측 액션 버튼 그룹 */}
        <section className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-6">
          {/* 좌측: 제목 + 부제 */}
          <div>
            <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400" style={{ fontSize: "2rem" }}>domain</span>
              내 매물 관리
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
              광고 중인 매물 목록 — 등록·계약 진행·만기 이동 한눈에
            </p>
          </div>

          {/* 우측: 액션 버튼 그룹 (Stitch 톤) */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* 기존 임차인 일괄 등록 — 조건부, 파랑 강조 */}
            {properties.some(p => p.dealType !== "매매" && (p.tenantName || p.tenantPhone) && !p.linkedTenantId) && (
              <button
                onClick={migrateTenantsToCustomers}
                title="기존 매물의 임차인을 손님관리에 일괄 등록"
                className="px-4 py-2.5 rounded-xl border border-blue-300 bg-blue-50 text-blue-700 text-sm font-bold flex items-center gap-1.5 hover:bg-blue-100 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">sync</span>
                기존 임차인 → 손님관리
              </button>
            )}

            {/* 보조 액션 그룹 (배경 surface-container) */}
            <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setShowUpload(true)}
                title="엑셀 일괄 업로드"
                className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">upload_file</span>
                <span className="hidden sm:inline">엑셀 업로드</span>
              </button>
              <button
                onClick={() => setShowExport(true)}
                title="엑셀 내보내기"
                className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">download</span>
                <span className="hidden sm:inline">내보내기</span>
              </button>
              <button
                onClick={loadSamples}
                title="예시 데이터 추가"
                className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">science</span>
                <span className="hidden sm:inline">예시</span>
              </button>
              {properties.length > 0 && (
                <button
                  onClick={clearAll}
                  title="전체 삭제"
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">delete_sweep</span>
                  <span className="hidden sm:inline">전체 삭제</span>
                </button>
              )}
            </div>

            {/* 메인 액션 — 매물 등록 (solid 에메랄드 큰 버튼) */}
            <button
              onClick={() => setEditing(emptyProperty())}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all shadow-md hover:scale-[1.02] active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              매물 등록
            </button>
          </div>
        </section>

        {/* ── 잔금일 경과 알림 — Stitch 톤 (gradient + Material Symbols + 카드형) ── */}
        {balanceOverdue.length > 0 && (
          <div className="mb-5 rounded-3xl border border-red-200 dark:border-red-800/60 bg-gradient-to-br from-red-50 via-rose-50 to-orange-50 dark:from-red-950/40 dark:via-rose-950/30 dark:to-orange-950/30 shadow-lg shadow-red-100/40 dark:shadow-red-950/20 overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-start gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-red-100 dark:border-red-900/40">
              <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-red-600 dark:text-red-300" style={{ fontVariationSettings: "'FILL' 1" }}>
                  notifications_active
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-red-800 dark:text-red-200">잔금일이 지난 매물</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-600 text-white font-bold">
                    {balanceOverdue.length}건
                  </span>
                </div>
                <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-1">
                  계약이 완료된 매물입니다 — 만기 관리로 옮기면 자동 거래이력으로 정리됩니다
                </p>
              </div>
            </div>

            {/* 매물 리스트 */}
            <div className="p-3 sm:p-4 space-y-2">
              {balanceOverdue.map(p => {
                const daysOver = Math.max(0, Math.round((Date.now() - new Date(p.balanceDate).getTime()) / 86400000));
                return (
                  <div
                    key={p.id}
                    className="group flex items-center gap-2.5 bg-white dark:bg-slate-900/80 rounded-2xl px-3 sm:px-4 py-2.5 border border-red-100 dark:border-red-900/40 hover:shadow-md hover:border-red-300 dark:hover:border-red-700 transition-all"
                  >
                    <span className="material-symbols-outlined text-red-500 text-lg shrink-0">schedule</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold shrink-0">{p.dealType}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{p.address}</div>
                      <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px] leading-none">event</span>
                        잔금일 {formatDateKo(p.balanceDate)}
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/60 font-bold">{daysOver}일 지남</span>
                      </div>
                    </div>
                    <button
                      onClick={() => close(p)}
                      className="text-[11px] px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shrink-0 shadow-sm hover:shadow-md transition-all flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      거래완료 → 만기
                    </button>
                    <button
                      onClick={() => setDismissedAlertIds(s => new Set(s).add(p.id))}
                      title="이번 세션에서 숨기기"
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 shrink-0 transition-colors"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 매물 상태 탭 — Stitch 톤 큰 카드 (Material Symbols + 보조 메트릭) ── */}
        {!showClosed && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-5">
            {/* 미계약 카드 — 에메랄드 */}
            <button
              onClick={() => setViewMode("available")}
              className={`group text-left rounded-3xl p-3 sm:p-4 transition-all border ${
                viewMode === "available"
                  ? "bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white border-emerald-600 shadow-xl shadow-emerald-200 dark:shadow-emerald-900/50 ring-4 ring-emerald-100 dark:ring-emerald-950"
                  : "bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-700 hover:shadow-md hover:-translate-y-0.5"
              }`}
            >
              {/* 헤더: 아이콘 + 라벨 */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                    viewMode === "available"
                      ? "bg-white/20 backdrop-blur-sm"
                      : "bg-emerald-50 dark:bg-emerald-950/60 group-hover:bg-emerald-100"
                  }`}>
                    <span
                      className={`material-symbols-outlined text-xl ${viewMode === "available" ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      storefront
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm sm:text-base font-bold leading-tight ${viewMode === "available" ? "text-white" : "text-gray-900 dark:text-gray-100"}`}>
                      미계약 매물
                    </div>
                    <div className={`text-[10px] sm:text-[11px] mt-0.5 ${viewMode === "available" ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
                      광고 중 · 계약 전
                    </div>
                  </div>
                </div>
              </div>
              {/* 큰 숫자 */}
              <div className="flex items-baseline gap-1 mt-2">
                <span className={`text-3xl sm:text-4xl font-extrabold tabular-nums leading-none ${viewMode === "available" ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {counts.available}
                </span>
                <span className={`text-xs font-medium ${viewMode === "available" ? "text-white/80" : "text-gray-400"}`}>건</span>
              </div>
              {/* 보조 메트릭 */}
              <div className={`mt-3 pt-2.5 border-t flex items-center gap-1 text-[11px] ${
                viewMode === "available"
                  ? "border-white/20 text-white/90"
                  : "border-gray-100 dark:border-slate-700 text-gray-500 dark:text-gray-400"
              }`}>
                <span className="material-symbols-outlined text-sm">fiber_new</span>
                이번 주 신규
                <span className={`ml-auto font-bold ${viewMode === "available" ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {counts.thisWeekNew}건
                </span>
              </div>
            </button>

            {/* 계약진행중 카드 — 블루 */}
            <button
              onClick={() => setViewMode("contracted")}
              className={`group text-left rounded-3xl p-3 sm:p-4 transition-all border ${
                viewMode === "contracted"
                  ? "bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-white border-blue-600 shadow-xl shadow-blue-200 dark:shadow-blue-900/50 ring-4 ring-blue-100 dark:ring-blue-950"
                  : "bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-700 hover:shadow-md hover:-translate-y-0.5"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                    viewMode === "contracted"
                      ? "bg-white/20 backdrop-blur-sm"
                      : "bg-blue-50 dark:bg-blue-950/60 group-hover:bg-blue-100"
                  }`}>
                    <span
                      className={`material-symbols-outlined text-xl ${viewMode === "contracted" ? "text-white" : "text-blue-600 dark:text-blue-400"}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      handshake
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm sm:text-base font-bold leading-tight ${viewMode === "contracted" ? "text-white" : "text-gray-900 dark:text-gray-100"}`}>
                      계약진행중
                    </div>
                    <div className={`text-[10px] sm:text-[11px] mt-0.5 ${viewMode === "contracted" ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
                      계약일 입력 완료
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-baseline gap-1 mt-2">
                <span className={`text-3xl sm:text-4xl font-extrabold tabular-nums leading-none ${viewMode === "contracted" ? "text-white" : "text-blue-600 dark:text-blue-400"}`}>
                  {counts.contracted}
                </span>
                <span className={`text-xs font-medium ${viewMode === "contracted" ? "text-white/80" : "text-gray-400"}`}>건</span>
              </div>
              <div className={`mt-3 pt-2.5 border-t flex items-center gap-1 text-[11px] ${
                viewMode === "contracted"
                  ? "border-white/20 text-white/90"
                  : "border-gray-100 dark:border-slate-700 text-gray-500 dark:text-gray-400"
              }`}>
                <span className="material-symbols-outlined text-sm">event_upcoming</span>
                잔금 30일 이내
                <span className={`ml-auto font-bold ${viewMode === "contracted" ? "text-white" : counts.balanceSoon > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-400"}`}>
                  {counts.balanceSoon}건
                </span>
              </div>
            </button>
          </div>
        )}

        {/* ── 수수료 매출 요약 — Stitch 톤 (grid-12 + sparkline + emerald gradient) ── */}
        {!showClosed && viewMode === "contracted" && (() => {
          // 최근 6개월 sparkline 데이터 — allMonths는 최신순(desc) string[], 오름차순으로 뒤집어서 표시
          const sortedAsc = [...commissionStats.allMonths].sort();   // 오래된 → 최신
          const recent6 = sortedAsc.slice(-6).map(k => commissionStats.byMonth[k] || 0);
          const sparkData = recent6.length >= 2 ? recent6 : [0, 0, 0, 0, 0, 0];
          return (
            <Link
              href="/sales"
              className="group block mb-5 rounded-3xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50 via-teal-50/60 to-white dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-slate-900 p-4 sm:p-5 hover:shadow-xl hover:shadow-emerald-100/60 dark:hover:shadow-emerald-950/30 transition-all"
            >
              <div className="grid grid-cols-12 gap-4 items-center">
                {/* 좌측: 이번 달 매출 (8/12) */}
                <div className="col-span-12 sm:col-span-7 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center shrink-0 shadow-md shadow-emerald-200 dark:shadow-emerald-900/50">
                    <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                      payments
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">이번 달 매출</div>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-200 leading-tight tabular-nums">
                        {fmtNum(String(commissionStats.thisMonthTotal))}
                      </span>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">만원</span>
                    </div>
                  </div>
                  {/* 미니 sparkline */}
                  <div className="hidden sm:flex flex-col items-end shrink-0">
                    <SparklineChart data={sparkData} className="stroke-emerald-500 dark:stroke-emerald-400" />
                    <span className="text-[9px] text-gray-400 mt-0.5">최근 6개월</span>
                  </div>
                </div>

                {/* 우측: KPI 미니 (4/12) */}
                <div className="col-span-12 sm:col-span-5 grid grid-cols-2 gap-2 sm:border-l sm:border-emerald-200 dark:sm:border-emerald-800/60 sm:pl-4">
                  <div className="rounded-2xl bg-white/60 dark:bg-slate-900/40 px-3 py-2 border border-emerald-100 dark:border-emerald-900/40">
                    <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">calendar_today</span>
                      올해
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                      {fmtNum(String(commissionStats.thisYearTotal))}<span className="text-[9px] text-gray-400 ml-0.5">만</span>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/60 dark:bg-slate-900/40 px-3 py-2 border border-emerald-100 dark:border-emerald-900/40">
                    <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">hourglass_top</span>
                      예정
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                      {fmtNum(String(commissionStats.pendingTotal))}<span className="text-[9px] text-gray-400 ml-0.5">만</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 하단: CTA + 안내문 */}
              <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/40">
                {commissionStats.allMonths.length === 0 ? (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">lightbulb</span>
                    [계약 정보 수정]에서 <b>수수료</b>와 <b>잔금일</b>을 입력하면 자동 집계됩니다
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-emerald-600">trending_up</span>
                    누적 매출 <b className="text-emerald-700 dark:text-emerald-300">{fmtNum(String(commissionStats.grandTotal))}만원</b>
                  </p>
                )}
                <span className="text-[11px] px-3 py-1.5 rounded-xl bg-emerald-600 group-hover:bg-emerald-700 text-white font-bold whitespace-nowrap flex items-center gap-1 shrink-0 shadow-sm transition-colors">
                  매출 관리
                  <span className="material-symbols-outlined text-sm group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                </span>
              </div>
            </Link>
          );
        })()}

        {/* 대분류: 매물 유형 필터 */}
        <div className="mb-3">
          <div className="text-[11px] text-gray-500 mb-1.5 ml-1">🏢 매물 유형</div>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", ...PROPERTY_TYPES] as const).map(t => {
              const cnt = propTypeCounts[t] ?? 0;
              const label = t === "all" ? "전체"
                : t === "빌라/다세대" ? "빌라"
                : t === "원룸/투룸" ? "원룸"
                : t;
              return (
                <button
                  key={t}
                  onClick={() => { setFilterPropType(t); setFilterType("all"); }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    filterPropType === t
                      ? "bg-emerald-600 text-white border-emerald-600 font-semibold"
                      : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"
                  }`}
                >
                  {label} <span className={filterPropType === t ? "opacity-90" : "text-gray-400"}>{cnt}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 중분류: 거래종류 요약 카드 */}
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
              { key: "lease_end",  label: "⏰ 만기일순" },
              { key: "balance",    label: "💵 잔금일순" },
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
            {/* 입주상태 필터 — 집주인 / 공실 (토글) */}
            <button onClick={() => setOccFilter(v => v === "owner" ? "" : "owner")}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                occFilter === "owner"
                  ? "bg-indigo-600 text-white border-indigo-600 font-semibold"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400"
              }`}>
              🏠 집주인
            </button>
            <button onClick={() => setOccFilter(v => v === "vacant" ? "" : "vacant")}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                occFilter === "vacant"
                  ? "bg-indigo-600 text-white border-indigo-600 font-semibold"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400"
              }`}>
              🏚️ 공실
            </button>
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
          (() => {
            const hasActive = properties.filter(p => p.status === "active").length > 0;
            const filtersOn = filterPropType !== "all" || filterType !== "all" || priceRange !== "all" || query.trim() !== "";
            // 매물은 있는데 필터 때문에 0건 → 초기화 안내
            if (hasActive && filtersOn) {
              return (
                <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center">
                  <div className="text-5xl mb-3">🔍</div>
                  <div className="text-base font-semibold text-gray-900 mb-1">조건에 맞는 매물이 없습니다</div>
                  <div className="text-xs text-gray-500 mb-4">
                    {filterPropType !== "all" && <span className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-emerald-50 text-emerald-700">{filterPropType}</span>}
                    {filterType !== "all" && <span className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-emerald-50 text-emerald-700">{filterType}</span>}
                    {priceRange !== "all" && <span className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-emerald-50 text-emerald-700">가격대</span>}
                    {" "}조건이 겹쳐서 결과가 없어요
                  </div>
                  <button
                    onClick={() => { setFilterPropType("all"); setFilterType("all"); setPriceRange("all"); setQuery(""); }}
                    className="text-sm px-4 py-2 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold">
                    ↺ 필터 초기화
                  </button>
                </div>
              );
            }
            return (
              <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center">
                <div className="text-5xl mb-3">🏘️</div>
                <div className="text-base font-semibold text-gray-900 mb-1">등록된 매물이 없습니다</div>
                <div className="text-xs text-gray-500 mb-4">매물 등록 버튼을 눌러 추가해보세요</div>
                <button onClick={() => setEditing(emptyProperty())} className="text-sm px-4 py-2 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold">
                  + 첫 매물 등록
                </button>
              </div>
            );
          })()
        ) : (() => {
          /* ── 페이징 — 20건/페이지 ── */
          const total = filtered.length;
          const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
          const safePage = Math.min(page, totalPages);
          const start = (safePage - 1) * PAGE_SIZE;
          const pagedList = filtered.slice(start, start + PAGE_SIZE);
          const showPager = totalPages > 1;

          /* 1·2·3·…·N 페이지 번호 (현재 ±2 + 처음/끝 + ellipsis) */
          const pageNumbers: (number | "…")[] = [];
          if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
          } else {
            const around = new Set<number>([1, totalPages, safePage - 1, safePage, safePage + 1]);
            const sorted = [...around].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
            let prev = 0;
            for (const n of sorted) {
              if (n - prev > 1) pageNumbers.push("…");
              pageNumbers.push(n);
              prev = n;
            }
          }

          return (
            <>
              {/* 표시 개수 안내 */}
              <div className="flex items-center justify-between mb-2.5 text-[11px] text-gray-500 dark:text-gray-400 px-1">
                <span>
                  전체 <b className="text-gray-900 dark:text-gray-100">{total}</b>건 중{" "}
                  <b className="text-emerald-600 dark:text-emerald-400">{start + 1}–{Math.min(start + PAGE_SIZE, total)}</b>건 표시
                </span>
                {showPager && (
                  <span className="font-medium">
                    {safePage}/{totalPages} 페이지
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                {pagedList.map(p => (
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
                    onCloneSameComplex={() => cloneSameComplex(p)}
                  />
                ))}
              </div>

              {/* ── 페이지네이션 UI ── */}
              {showPager && (
                <nav
                  aria-label="페이지 이동"
                  className="mt-5 flex items-center justify-center gap-1 flex-wrap"
                >
                  {/* 이전 */}
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="이전 페이지"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                  </button>

                  {/* 페이지 번호 */}
                  {pageNumbers.map((n, idx) =>
                    n === "…" ? (
                      <span key={`e${idx}`} className="w-9 h-9 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">…</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={`min-w-[2.25rem] h-9 px-2.5 rounded-xl text-sm font-semibold transition-all ${
                          safePage === n
                            ? "bg-emerald-600 text-white shadow-md scale-105"
                            : "bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-300"
                        }`}
                      >
                        {n}
                      </button>
                    ),
                  )}

                  {/* 다음 */}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="다음 페이지"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </nav>
              )}
            </>
          );
        })()}
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
function PropertyCard({ property: p, schedules, isPinned, onPin, onEdit, onClose, onDelete, onReopen, onProgress, onCloneSameComplex }: {
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
    <div className={`rounded-3xl border p-3 sm:p-4 transition-all ${cardClass}`}>
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

      {/* ── 상단: 배지(가격포함) + 우상단 작은 아이콘 ── */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* 배지 라인 — 가격을 좌측 영역 안에 emerald-600 solid 큰 알약으로 배치 (사용자가 한눈에 인지) */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {/* 💰 가격 — 가장 튀는 위치 (좌측 첫 배지) */}
            <span className="text-sm px-2.5 py-1 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white font-extrabold tabular-nums shadow-sm">
              {priceStr === "—" ? "—" : priceStr}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold">{p.dealType}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">{p.propertyType}</span>
            {isClosed && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400 font-medium flex items-center gap-0.5">
                <span className="material-symbols-outlined text-xs">check_circle</span> 거래완료
              </span>
            )}
            {hasContractDate && !isClosed && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold flex items-center gap-0.5">
                <span className="material-symbols-outlined text-xs">edit_document</span> 계약진행중
              </span>
            )}
            {leaseDD !== null && (
              <>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${
                    leaseUrgent
                      ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                      : leaseCaution
                      ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300"
                      : "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300"
                  }`}
                >
                  <span className="material-symbols-outlined text-xs">schedule</span>
                  임대만기 {leaseDD < 0 ? `${-leaseDD}일지남` : leaseDD === 0 ? "오늘" : `D-${leaseDD}`}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400">{p.leaseEndDate}</span>
              </>
            )}
            {p.occupancy && p.occupancy !== "tenant" && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">{OCC_LABEL[p.occupancy]}</span>
            )}
          </div>

          {/* 주소 */}
          <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 break-all mb-1 leading-snug">{p.address || "—"}</div>

          {/* 면적·타입·방·방향 */}
          {(p.area || p.unitType || p.rooms || p.direction) && (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-2 items-center">
              {p.area && <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-sm">square_foot</span>{p.area}㎡{m2ToPyeong(p.area) ? ` (${m2ToPyeong(p.area)}평)` : ""}</span>}
              {p.unitType && <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold"><span className="material-symbols-outlined text-sm">grid_view</span>{p.unitType}</span>}
              {p.rooms && <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-sm">meeting_room</span>방{p.rooms}개</span>}
              {p.direction && <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-sm">explore</span>{p.direction}</span>}
            </div>
          )}
        </div>

        {/* 우상단 — 지도·즐겨찾기만 작게 (가격은 좌측 알약으로 이동) */}
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
            title="카카오 지도로 보기"
          >
            <span className="material-symbols-outlined text-sm">location_on</span>
          </a>
          <button
            onClick={onPin}
            className={`w-7 h-7 flex items-center justify-center rounded-full border transition-colors ${
              isPinned
                ? "bg-amber-400 border-amber-400 text-white"
                : "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-400 hover:bg-amber-50"
            }`}
            title={isPinned ? "즐겨찾기 해제" : "즐겨찾기 고정"}
          >
            <span className="material-symbols-outlined text-sm" style={isPinned ? { fontVariationSettings: "'FILL' 1" } : undefined}>star</span>
          </button>
        </div>
      </div>

      {/* ── 본문 정보 (집주인·임차인·계약일·메모) ── */}
      <div className="mt-3 space-y-2">
        {/* 집주인 연락처 — 아이콘 작게, 텍스트 위주 (이전 톤 복귀) */}
        {p.ownerPhone && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400 shrink-0">👤 집주인 {p.ownerName || ""}</span>
            <a href={`tel:${p.ownerPhone.replace(/\D/g,"")}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              📞 {formatPhone(p.ownerPhone)}
            </a>
            <a
              href={`sms:${p.ownerPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${p.ownerName ? ` ${p.ownerName}님` : ""}, 미사금빛공인중개사입니다.\n${p.address} 매물 관련하여 연락드립니다.`)}`}
              className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 ml-auto"
            >
              💬 문자
            </a>
          </div>
        )}

        {/* 임차인 정보 — 동일 톤 */}
        {(p.tenantName || p.tenantPhone || p.tenantDeposit || p.tenantMonthly) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-orange-600 dark:text-orange-400 shrink-0">👤 임차인 {p.tenantName || ""}</span>
            {p.tenantPhone && (
              <a href={`tel:${p.tenantPhone.replace(/\D/g,"")}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                📞 {formatPhone(p.tenantPhone)}
              </a>
            )}
            {(p.tenantDeposit || p.tenantMonthly) && (
              <span className="text-[11px] text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 rounded-full px-2.5 py-0.5 border border-orange-200 dark:border-orange-800/60 font-medium">
                보증금 {p.tenantDeposit ? `${fmtNum(p.tenantDeposit)}만` : "—"}
                {p.tenantMonthly && Number(p.tenantMonthly) > 0 ? ` / 월세 ${fmtNum(p.tenantMonthly)}만` : " (전세)"}
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

      {/* ── 액션 버튼 (Material Symbols로 통일) ── */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
        <button
          onClick={onEdit}
          className="text-[11px] px-2.5 py-1 rounded-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-0.5"
        >
          <span className="material-symbols-outlined text-sm">edit</span> 수정
        </button>
        {!isClosed && (
          <button
            onClick={onCloneSameComplex}
            title="같은 단지에 다른 호수 빠른 등록"
            className="text-[11px] px-2.5 py-1 rounded-full border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors flex items-center gap-0.5"
          >
            <span className="material-symbols-outlined text-sm">content_copy</span> 같은 단지 추가
          </button>
        )}
        {!isClosed && (
          <button
            onClick={onProgress}
            title={hasContractDate ? "계약 진행 정보 수정" : "계약 체결 → 4개 날짜 입력"}
            className="text-[11px] px-2.5 py-1 rounded-full border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors flex items-center gap-0.5"
          >
            <span className="material-symbols-outlined text-sm">edit_document</span>
            {hasContractDate ? "계약 정보 수정" : "계약 진행"}
          </button>
        )}
        {isClosed ? (
          <button
            onClick={onReopen}
            className="text-[11px] px-2.5 py-1 rounded-full border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-0.5"
          >
            <span className="material-symbols-outlined text-sm">undo</span> 진행중으로 복구
          </button>
        ) : (
          <button
            onClick={onClose}
            title="거래 완료 → 만기 관리로 이동 (매매·전세·월세 모두 동일)"
            className="text-[11px] px-2.5 py-1 rounded-full border-2 border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center gap-0.5"
          >
            <span className="material-symbols-outlined text-sm">rocket_launch</span> 거래완료 → 만기
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-[11px] px-2.5 py-1 rounded-full border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors ml-auto flex items-center gap-0.5"
        >
          <span className="material-symbols-outlined text-sm">delete</span> 삭제
        </button>
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[calc(100dvh-5rem)] sm:max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold">{isNew ? "매물 등록" : "매물 수정"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-3">

          {/* 같은 단지 빠른 등록 안내 (신규 등록 시만) */}
          {isNew && (
            <div className="rounded-xl bg-teal-50 border border-teal-200 p-2.5 text-[11px] text-teal-700 leading-relaxed">
              💡 <strong>같은 단지에 여러 매물</strong>이 있으신가요?<br />
              먼저 한 건 등록 후, 그 매물 카드의 <strong>📋 같은 단지 추가</strong> 버튼을 누르면<br />
              단지명·유형·면적·방향이 자동 복사되어 동/호수만 입력하면 됩니다.
            </div>
          )}

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

          {/* 면적 / 평면도 타입 — 면적란엔 숫자만, 타입은 별도 (어머니 피드백) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전용면적 (㎡)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.area}
                onChange={e => {
                  // 숫자·소수점만 허용 — "44c-3" 같은 오입력 방지
                  const cleaned = e.target.value.replace(/[^\d.]/g, "");
                  set("area", cleaned);
                }}
                placeholder="84"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {m2ToPyeong(form.area) && <div className="mt-1 text-[10px] text-gray-500">≈ {m2ToPyeong(form.area)}평</div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                평면도 타입 <span className="text-[10px] text-gray-400">(선택)</span>
              </label>
              <input
                type="text"
                value={form.unitType}
                onChange={e => set("unitType", e.target.value)}
                placeholder="예: 84A, C-3타입"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="mt-1 text-[10px] text-gray-400">A/B/C타입 등 평면 구분</div>
            </div>
          </div>
          {/* 방향 / 방수 한 줄 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">방향</label>
              <select value={form.direction} onChange={e => set("direction", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">선택</option>
                {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">방수</label>
              <input type="text" inputMode="numeric" value={form.rooms}
                onChange={e => set("rooms", e.target.value.replace(/\D/g, ""))}
                placeholder="3"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
{/* 방수는 위 방향/방수 그리드로 통합됨 */}

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
            {/* 현재 임차인 보증금/월세 — 매매 매물에도 세입자 있을 수 있음 */}
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">보증금 (만원)</label>
                <input type="text" inputMode="numeric" value={form.tenantDeposit}
                  onChange={e => set("tenantDeposit", e.target.value.replace(/\D/g, ""))}
                  placeholder="1000" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">월세 (만원)</label>
                <input type="text" inputMode="numeric" value={form.tenantMonthly}
                  onChange={e => set("tenantMonthly", e.target.value.replace(/\D/g, ""))}
                  placeholder="70 (전세는 0)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">전세·월세 만기일</label>
              <input type="date" value={form.leaseEndDate} onChange={e => set("leaseEndDate", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <p className="text-[10px] text-orange-600 mt-2">📌 만기일 입력 시 스케줄에서 자동으로 만기 알림 표시</p>
          </div>

          {/* 입주 상태 — 주인거주·공실 분류 (집주인/공실 필터 기준) */}
          <div className="border border-indigo-200 rounded-2xl p-3 bg-indigo-50/40">
            <label className="block text-xs font-semibold text-indigo-700 mb-2">🏘️ 입주 상태</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { v: "", label: "미설정" },
                { v: "owner", label: "주인거주" },
                { v: "vacant", label: "공실" },
              ] as const).map(o => (
                <button key={o.v} type="button" onClick={() => set("occupancy", o.v as Occupancy)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.occupancy === o.v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-indigo-600 mt-2">📌 주인거주·공실로 지정하면 목록에서 [🏠 집주인/공실] 필터로 모아볼 수 있어요</p>
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
    // 날짜 순서 검증 — 계약일 ≤ 중도금일 ≤ 잔금일 (계약일은 시간 포함 가능)
    const dateOnly = (v: string) => v ? v.slice(0, 10) : "";
    const cd = dateOnly(form.contractDate);
    const errors: string[] = [];
    if (cd && form.downPaymentDate && cd > form.downPaymentDate) {
      errors.push(`• 중도금일(${form.downPaymentDate})이 계약일(${cd})보다 빠릅니다`);
    }
    if (cd && form.balanceDate && cd > form.balanceDate) {
      errors.push(`• 잔금일(${form.balanceDate})이 계약일(${cd})보다 빠릅니다`);
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[calc(100dvh-5rem)] sm:max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
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

          {/* 4개 날짜 — 한국어 캘린더, 계약일은 시간 포함·라벨 강조 */}
          <div className="space-y-3">
            <KoreanDatePicker
              value={form.contractDate}
              onChange={(v) => set("contractDate", v)}
              showTime={true}
              label="📝 계약일 (날짜·시간)"
              accent="purple"
              placeholder="계약 일시 선택"
            />
            <KoreanDatePicker
              value={form.downPaymentDate}
              onChange={(v) => set("downPaymentDate", v)}
              label="💰 중도금일 (선택)"
              accent="pink"
              placeholder="중도금일 선택"
            />
            <div>
              <KoreanDatePicker
                value={form.balanceDate}
                onChange={(v) => set("balanceDate", v)}
                label="💵 잔금일 ★"
                accent="amber"
                placeholder="잔금일 선택"
              />
              <p className="text-[11px] text-red-600 mt-1.5">⚠️ 이 날짜 지나면 자동 알림 → 만기 관리로 이동 가능</p>
            </div>
            <KoreanDatePicker
              value={form.leaseEndDate}
              onChange={(v) => set("leaseEndDate", v)}
              label="⏰ 임대만기일 (전·월세만)"
              accent="orange"
              placeholder="만기일 선택"
            />
            <div>
              <label className="block text-sm font-medium text-emerald-700 mb-1">💵 중개 수수료 (만원)</label>
              <input type="text" inputMode="numeric" value={form.commission}
                onChange={e => set("commission", e.target.value.replace(/\D/g, ""))}
                placeholder="300"
                className="w-full border border-emerald-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              <p className="text-[10px] text-emerald-600 mt-1">📊 잔금일 기준으로 월별 매출에 합산됩니다</p>
            </div>
          </div>

          {/* 계약 상대방 정보 — 매매=매수인 / 전월세=임차인, 손님관리 검색 연동 */}
          {(() => {
            const partyLabel = form.dealType === "매매" ? "매수인" : "임차인";
            return (
            <div className="border border-orange-200 rounded-2xl p-3 bg-orange-50/40 space-y-2">
              <div className="text-xs font-semibold text-orange-700">🤝 {partyLabel} (손님관리에서 불러오기)</div>

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
                  <label className="block text-xs font-medium text-gray-700 mb-1">{partyLabel} 이름</label>
                  <input value={form.tenantName}
                    onChange={e => { set("tenantName", e.target.value); set("linkedTenantId", ""); setCustQuery(e.target.value); }}
                    placeholder="홍길동"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">연락처</label>
                  <input type="tel" value={form.tenantPhone}
                    onChange={e => { set("tenantPhone", e.target.value); set("linkedTenantId", ""); }}
                    placeholder="010-0000-0000"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              {/* 보증금/월세 */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">보증금 (만원)</label>
                  <input type="text" inputMode="numeric" value={form.tenantDeposit}
                    onChange={e => set("tenantDeposit", e.target.value.replace(/\D/g, ""))}
                    placeholder="1000" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">월세 (만원)</label>
                  <input type="text" inputMode="numeric" value={form.tenantMonthly}
                    onChange={e => set("tenantMonthly", e.target.value.replace(/\D/g, ""))}
                    placeholder="70 (전세는 0)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              <p className="text-[10px] text-orange-600 mt-1">💡 손님관리에 등록된 손님을 검색하거나 직접 입력하세요</p>
            </div>
            );
          })()}

          {balanceOverdueLocal && (
            <div className="rounded-xl bg-red-50 border-2 border-red-300 p-3">
              <div className="text-xs font-bold text-red-700 mb-1">🔔 잔금일이 이미 지났습니다</div>
              <div className="text-[11px] text-red-600">저장 후 카드의 &quot;거래완료 → 만기&quot; 버튼을 누르면 만기 관리로 이동됩니다.</div>
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

/* CommissionDetailModal → /sales 페이지로 이전됨 (lib/sales.ts) */
