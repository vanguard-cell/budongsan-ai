"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeProperties, saveProperty, deleteProperty, emptyProperty,
  sampleProperties, savePropertiesBatch, logPropertyEvent,
  type Property, type PropertyType, type DealType, type Occupancy,
} from "@/lib/properties-db";
import { dDay, type Contract } from "@/app/expiry/contracts";
import { subscribeSchedules, type Schedule } from "@/lib/schedules-db";
import { moveToContract, subscribeContracts } from "@/lib/contracts-db";
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
import { fmtNum, formatDateKo, PROPERTY_TYPES } from "./helpers";
import PropertyCard from "./PropertyCard";
import PropertyModal from "./PropertyModal";
import ContractProgressModal from "./ContractProgressModal";
import PropertyTable from "./PropertyTable";
import PropertyPanel from "./PropertyPanel";

export default function PropertiesPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);  // 만기로 이전된 계약 (매출 집계 보존용)
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [progressing, setProgressing] = useState<Property | null>(null);   // 계약 진행 모달
  const [showUpload, setShowUpload] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [query, setQuery] = useState(() => {
    // 헤더 통합검색에서 ?q= 로 들어오면 검색창에 반영
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") || "";
  });
  const [filterType, setFilterType] = useState<"all" | DealType>("all");
  const [filterPropType, setFilterPropType] = useState<"all" | PropertyType>("all"); // 대분류: 매물 유형
  const [showClosed, setShowClosed] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  // 탭: available=계약 없는 매물(주인거주·공실 포함) / contracted=계약진행중
  const [viewMode, setViewMode] = useState<"available" | "contracted">("available");
  // 입주상태 필터: "" 전체 / owner 집주인 / vacant 공실
  const [occFilter, setOccFilter] = useState<"" | "owner" | "vacant">("");
  // 정렬: 등록순 / 금액 / 만기일 / 잔금일 / 동·호순
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc" | "lease_end" | "balance" | "dongho">("newest");
  // 단지→동→호 조회 (선방 스타일): 단지(베이스주소) / 동 / 호
  const [selectedComplex, setSelectedComplex] = useState<string>("");
  const [selectedDong, setSelectedDong] = useState<string>("");
  const [selectedHo, setSelectedHo] = useState<string>("");
  // 페이지네이션 — 20건/페이지
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  // 수수료 상세는 /sales 페이지로 이동 (showCommission 제거)
  // 가격대 빠른 필터 (만원 기준)
  const [priceRange, setPriceRange] = useState<"all" | "u1" | "1to2" | "2to3" | "3to5" | "o5">("all");
  // 뷰: 카드(기존) / 표(엑셀형) — 마지막 선택 기억
  const [viewStyle, setViewStyleState] = useState<"card" | "table">(() => {
    try { return localStorage.getItem("dealdone_properties_view") === "table" ? "table" : "card"; } catch { return "card"; }
  });
  const setViewStyle = (v: "card" | "table") => {
    setViewStyleState(v);
    try { localStorage.setItem("dealdone_properties_view", v); } catch {}
  };
  // 우측 패널 — 표/카드에서 선택된 매물 (id로 보관해 실시간 갱신 반영)
  const [panelId, setPanelId] = useState<string | null>(null);
  const [showComplexSearch, setShowComplexSearch] = useState(false);   // 단지·동·호 조회 접기/펼치기
  const [colSearch, setColSearch] = useState<Record<string, string>>({});   // 표 컬럼 헤더 검색
  const onColSearch = (col: string, term: string) => setColSearch(s => ({ ...s, [col]: term }));
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

  // 홈 "빠른 등록" / "매물 등록" 진입 (?new=1) → 등록 모달 바로 열기
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setEditing(emptyProperty());
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeProperties(user.agencyId, list => { setProperties(list); setLoaded(true); });
    const u2 = subscribeSchedules(user.agencyId, setSchedules);
    const u3 = subscribeCustomers(user.agencyId, setCustomers);
    const u4 = subscribeContracts(user.agencyId, setContracts);  // 만기 계약 — 매출 집계에 포함
    return () => { u1(); u2(); u3(); u4(); };
  }, [user]);

  // 필터·정렬·검색·탭 변경 시 1페이지로 리셋
  useEffect(() => {
    setPage(1);
  }, [query, filterType, filterPropType, priceRange, sortBy, viewMode, showClosed, occFilter, colSearch]);

  const upsert = async (p: Property): Promise<boolean> => {
    if (!user) return false;
    // 중복 검사 — 같은 주소·동·호 매물이 이미 있으면 경고 (자기 자신·거래완료 제외)
    const norm = (s: string) => (s || "").replace(/\s+/g, "").toLowerCase();
    const dup = properties.find(x =>
      x.id !== p.id &&
      x.status !== "closed" &&
      norm(x.address) === norm(p.address) &&
      (x.dong || "") === (p.dong || "") &&
      (x.ho || "") === (p.ho || "") &&
      p.address.trim() !== ""
    );
    if (dup) {
      const where = [dup.address, dup.dong && `${dup.dong}동`, dup.ho && `${dup.ho}호`].filter(Boolean).join(" ");
      if (!confirm(`⚠️ 이미 등록된 매물이 있습니다:\n${where}\n\n그래도 새로 등록할까요?\n(중복이 싫으면 [취소] 후 기존 매물을 수정하세요)`)) {
        return false;
      }
    }
    await saveProperty(user.agencyId, p);
    return true;
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
   * - 전월세는 임차인 정보 있으면 고객관리 자동 등록
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

  /** 기존 매물 임차인 → 고객관리 일괄 등록 (전·월세, linkedTenantId 없는 것만) */
  const migrateTenantsToCustomers = async () => {
    if (!user) return;
    const targets = properties.filter(p =>
      p.dealType !== "매매" && (p.tenantName || p.tenantPhone) && !p.linkedTenantId,
    );
    if (targets.length === 0) {
      alert("일괄 등록할 임차인이 없습니다.");
      return;
    }
    if (!confirm(`${targets.length}건의 매물 임차인을 고객관리에 일괄 등록할까요?`)) return;
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
  // 단지명(주소에서 동/호 제거) · 숫자 추출 — 동·호순 정렬·계층 탐색용
  const baseAddr = (p: Property) => (p.address || "").replace(/\s*\d+동.*$/, "").replace(/\s*\d+호.*$/, "").trim();
  const numOf = (s: string) => parseInt((s || "").replace(/\D/g, ""), 10) || 0;

  // 탭별 매물 분류 (계약진행중 / 그 외)
  const matchView = (p: Property) =>
    viewMode === "contracted" ? isContracted(p) : !isContracted(p);

  const filtered = useMemo(() => {
    const baseList = showClosed
      ? properties.filter(p => p.status === "closed")
      : properties.filter(p => p.status === "active").filter(matchView);

    // 컬럼 헤더 검색 (단지·동호 / 소재지) — 둘 다 전체 주소 텍스트로 매칭
    const addrTerm = (colSearch.address || "").trim().toLowerCase();
    const regionTerm = (colSearch.region || "").trim().toLowerCase();

    const result = baseList
      .filter(p => filterPropType === "all" || p.propertyType === filterPropType)
      .filter(p => filterType === "all" || p.dealType === filterType)
      .filter(p => !occFilter || p.occupancy === occFilter)
      .filter(p => {
        if (!addrTerm && !regionTerm) return true;
        const addr = [p.address, p.dong, p.ho].filter(Boolean).join(" ").toLowerCase();
        return (!addrTerm || addr.includes(addrTerm)) && (!regionTerm || addr.includes(regionTerm));
      })
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
      })
      // 단지→동→호 조회
      .filter(p => !selectedComplex || baseAddr(p) === selectedComplex)
      .filter(p => !selectedDong || p.dong === selectedDong)
      .filter(p => !selectedHo.trim() || (p.ho || "").includes(selectedHo.trim()));

    // 날짜 정렬용 — 빈 값은 맨 뒤로
    const dateKey = (v: string) => v && v.length >= 10 ? v.slice(0, 10) : "9999-99-99";
    // 정렬 (즐겨찾기는 항상 상단)
    const sorted =
      sortBy === "price_asc"  ? [...result].sort((a, b) => priceNum(a) - priceNum(b))
    : sortBy === "price_desc" ? [...result].sort((a, b) => priceNum(b) - priceNum(a))
    : sortBy === "lease_end"  ? [...result].sort((a, b) => dateKey(a.leaseEndDate).localeCompare(dateKey(b.leaseEndDate)))
    : sortBy === "balance"    ? [...result].sort((a, b) => dateKey(a.balanceDate).localeCompare(dateKey(b.balanceDate)))
    : sortBy === "dongho"     ? [...result].sort((a, b) => {
        // 단지명 → 동(숫자) → 호(숫자) 오름차순
        const baseA = baseAddr(a), baseB = baseAddr(b);
        if (baseA !== baseB) return baseA.localeCompare(baseB, "ko");
        const dongA = numOf(a.dong), dongB = numOf(b.dong);
        if (dongA !== dongB) return dongA - dongB;
        return numOf(a.ho) - numOf(b.ho);
      })
    :                           [...result].sort((a, b) => b.createdAt - a.createdAt);
    return sorted.sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 0 : 1;
      const bp = pinnedIds.has(b.id) ? 0 : 1;
      return ap - bp;
    });
  }, [properties, showClosed, filterType, filterPropType, query, viewMode, sortBy, priceRange, pinnedIds, occFilter, selectedComplex, selectedDong, selectedHo, colSearch]);

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
      // 거래종류 집계는 미계약(available) 기준 — 계약진행중 매물은 제외
      all: available.length,
      available: available.length,
      contracted: contracted.length,
      매매: available.filter(p => p.dealType === "매매").length,
      전세: available.filter(p => p.dealType === "전세").length,
      월세: available.filter(p => p.dealType === "월세").length,
      thisWeekNew,
      balanceSoon,
    };
  }, [properties]);

  // 단지→동 계층 탐색용 목록 (현재 탭의 active 매물 기준)
  const complexList = useMemo(() => {
    const base = properties.filter(p => p.status === "active").filter(matchView);
    const map = new Map<string, number>();
    for (const p of base) {
      const c = baseAddr(p);
      if (c) map.set(c, (map.get(c) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [properties, viewMode]);

  // 선택 단지의 동 목록
  const dongList = useMemo(() => {
    if (!selectedComplex) return [];
    const base = properties.filter(p => p.status === "active").filter(matchView).filter(p => baseAddr(p) === selectedComplex);
    const map = new Map<string, number>();
    for (const p of base) {
      if (p.dong) map.set(p.dong, (map.get(p.dong) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => numOf(a[0]) - numOf(b[0]));
  }, [properties, viewMode, selectedComplex]);

  // 매물 유형별 개수 (대분류 칩) — 현재 탭 기준
  const propTypeCounts = useMemo(() => {
    const base = showClosed
      ? properties.filter(p => p.status === "closed")
      : properties.filter(p => p.status === "active").filter(matchView);
    const map: Record<string, number> = { all: base.length };
    for (const t of PROPERTY_TYPES) map[t] = base.filter(p => p.propertyType === t).length;
    return map;
  }, [properties, showClosed, viewMode]);

  // 수수료 매출 요약 — 내 매물 + 만기로 이전된 계약(contracts)을 함께 집계
  // (만기로 보내도 매출에서 빠지지 않도록 — 어머니 피드백 버그픽스)
  const commissionStats = useMemo(() => {
    const s = computeSalesStats(properties, contracts);
    return {
      thisMonthTotal: s.thisMonth,
      pendingTotal: s.pending,
      thisYearTotal: s.thisYear,
      grandTotal: s.grand,
      allMonths: s.allMonths,
      byMonth: s.byMonth,        // YYYY-MM → 매출 — sparkline용
    };
  }, [properties, contracts]);

  if (authLoading || !user) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;

  const panelProp = panelId ? properties.find(x => x.id === panelId) || null : null;

  return (
    <div className={`transition-[padding] duration-300 ease-out ${panelProp ? "xl:pr-[400px]" : ""}`}>
      <div className="w-full">

        {/* Stitch 톤 페이지 헤더 — 좌측 제목 + 우측 액션 버튼 그룹 */}
        <section className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-6">
          {/* 좌측: 제목 + 부제 */}
          <div>
            <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              <span className="material-symbols-outlined text-[var(--brand-blue)] dark:text-blue-400" style={{ fontSize: "2rem" }}>domain</span>
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
                title="기존 매물의 임차인을 고객관리에 일괄 등록"
                className="px-4 py-2.5 rounded-xl border border-blue-300 bg-blue-50 text-blue-700 text-sm font-bold flex items-center gap-1.5 hover:bg-blue-100 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">sync</span>
                기존 임차인 → 고객관리
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

            {/* 뷰 토글 — 카드(기존) / 표(엑셀형) */}
            <div className="inline-flex rounded-lg border border-[var(--sidebar-bd)] overflow-hidden text-xs font-semibold">
              <button
                onClick={() => setViewStyle("card")}
                className={`px-3 py-2 flex items-center gap-1 transition-colors ${viewStyle === "card" ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)]" : "bg-white dark:bg-slate-900 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"}`}
              >
                <span className="material-symbols-outlined text-[15px] leading-none">grid_view</span>
                카드
              </button>
              <button
                onClick={() => setViewStyle("table")}
                className={`px-3 py-2 flex items-center gap-1 border-l border-[var(--sidebar-bd)] transition-colors ${viewStyle === "table" ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)]" : "bg-white dark:bg-slate-900 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"}`}
              >
                <span className="material-symbols-outlined text-[15px] leading-none">table_rows</span>
                표
              </button>
            </div>

            {/* 메인 액션 — 매물 등록 (solid 에메랄드 큰 버튼) */}
            <button
              onClick={() => setEditing(emptyProperty())}
              className="px-5 py-2.5 bg-[var(--brand-blue)] hover:bg-[var(--brand-blue-dark)] text-white rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all shadow-md hover:scale-[1.02] active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              매물 등록
            </button>
          </div>
        </section>

        {/* ── 잔금일 경과 알림 — Stitch 톤 (gradient + Material Symbols + 카드형) ── */}
        {balanceOverdue.length > 0 && (
          <div className="mb-5 rounded-xl border bg-[var(--tint-red-bg)] border-[var(--tint-red-bd)] overflow-hidden">
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
                    className="group bg-white dark:bg-slate-900/80 rounded-2xl px-3 sm:px-4 py-2.5 border border-red-100 dark:border-red-900/40 hover:shadow-md hover:border-red-300 dark:hover:border-red-700 transition-all"
                  >
                    {/* 모바일: 세로 / PC: 가로 */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      {/* 정보 영역 */}
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span className="material-symbols-outlined text-red-500 text-lg shrink-0 mt-0.5">schedule</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold shrink-0 mt-0.5">{p.dealType}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{p.address}</div>
                          <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 flex items-center gap-1 flex-wrap">
                            <span className="material-symbols-outlined text-[13px] leading-none">event</span>
                            <span className="whitespace-nowrap">잔금일 {formatDateKo(p.balanceDate)}</span>
                            <span className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/60 font-bold whitespace-nowrap">{daysOver}일 지남</span>
                          </div>
                        </div>
                        {/* X 닫기 — 모바일에선 우상단 */}
                        <button
                          onClick={() => setDismissedAlertIds(s => new Set(s).add(p.id))}
                          title="이번 세션에서 숨기기"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 shrink-0 transition-colors sm:hidden"
                        >
                          <span className="material-symbols-outlined text-base">close</span>
                        </button>
                      </div>
                      {/* 액션 영역 — 모바일에선 전체 너비 버튼 */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => close(p)}
                          className="flex-1 sm:flex-none justify-center text-[11px] px-3 py-2 sm:py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1 whitespace-nowrap"
                        >
                          <span className="material-symbols-outlined text-sm">arrow_forward</span>
                          거래완료 → 만기
                        </button>
                        {/* X 닫기 — PC에선 버튼 옆 */}
                        <button
                          onClick={() => setDismissedAlertIds(s => new Set(s).add(p.id))}
                          title="이번 세션에서 숨기기"
                          className="w-7 h-7 rounded-full hidden sm:flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 shrink-0 transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">close</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 요약 4카드 (만기·고객 페이지와 동일 구조) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <PropSummaryTile
            tint="green" label="미계약" count={counts.available}
            sub={`이번 주 신규 ${counts.thisWeekNew}건`}
            active={!showClosed && viewMode === "available"}
            onClick={() => { setShowClosed(false); setViewMode("available"); }}
          />
          <PropSummaryTile
            tint="blue" label="계약 진행" count={counts.contracted}
            active={!showClosed && viewMode === "contracted"}
            onClick={() => { setShowClosed(false); setViewMode("contracted"); }}
          />
          <PropSummaryTile
            tint="red" label="잔금 임박" count={counts.balanceSoon} sub="30일 이내"
            active={!showClosed && viewMode === "contracted" && sortBy === "balance"}
            onClick={() => { setShowClosed(false); setViewMode("contracted"); setSortBy("balance"); }}
          />
          <PropSummaryTile
            tint="gray" label="거래완료" count={properties.filter(p => p.status === "closed").length}
            active={showClosed}
            onClick={() => setShowClosed(true)}
          />
        </div>

        {/* ── 수수료 매출 요약 — Stitch 톤 (grid-12 + sparkline + emerald gradient) ── */}
        {!showClosed && viewMode === "contracted" && (() => {
          // 최근 6개월 sparkline 데이터 — allMonths는 최신순(desc) string[], 오름차순으로 뒤집어서 표시
          const sortedAsc = [...commissionStats.allMonths].sort();   // 오래된 → 최신
          const recent6 = sortedAsc.slice(-6).map(k => commissionStats.byMonth[k] || 0);
          const sparkData = recent6.length >= 2 ? recent6 : [0, 0, 0, 0, 0, 0];
          return (
            <Link
              href="/sales"
              className="group block mb-5 rounded-xl border bg-[var(--tint-green-bg)] border-[var(--tint-green-bd)] p-4 sm:p-5 hover:shadow-md transition-all"
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

        {/* 검색 + 필터 (한 박스로 통합 — 거래종류·유형 칩 + 검색 + 단지조회 + 가격대 + 정렬) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-4">
          {/* 거래종류 칩 */}
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <span className="text-[11px] text-gray-500 shrink-0 w-8">거래</span>
            {(["all", "매매", "전세", "월세"] as const).map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filterType === t
                    ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)] font-semibold"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}>
                {t === "all" ? "전체" : t} <span className={filterType === t ? "opacity-90" : "text-gray-400"}>{counts[t === "all" ? "all" : t]}</span>
              </button>
            ))}
          </div>
          {/* 매물유형 칩 */}
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <span className="text-[11px] text-gray-500 shrink-0 w-8">유형</span>
            {(["all", ...PROPERTY_TYPES] as const).map(t => {
              const cnt = propTypeCounts[t] ?? 0;
              const label = t === "all" ? "전체" : t === "빌라/다세대" ? "빌라" : t === "원룸/투룸" ? "원룸" : t;
              return (
                <button key={t} onClick={() => { setFilterPropType(t); setFilterType("all"); }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    filterPropType === t
                      ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)] font-semibold"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                  }`}>
                  {label} <span className={filterPropType === t ? "opacity-90" : "text-gray-400"}>{cnt}</span>
                </button>
              );
            })}
          </div>
          <input
            type="text"
            placeholder="🔍 주소 · 집주인 이름 · 연락처 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2"
          />

          {/* 단지 → 동 → 호 조회 — 평소 접힘, "단지로 찾기" 클릭 시 펼침 */}
          {complexList.length > 0 && (
            <div className="mb-2">
              <button onClick={() => setShowComplexSearch(v => !v)}
                className="flex items-center gap-1 text-[12px] font-semibold text-[var(--brand-blue)] dark:text-blue-400 hover:underline">
                <span className="material-symbols-outlined text-[16px] leading-none">{showComplexSearch ? "expand_less" : "manage_search"}</span>
                단지·동·호로 찾기
                {(selectedComplex || selectedDong || selectedHo) && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[var(--brand-blue)]" />}
              </button>
              {showComplexSearch && (
              <div className="border border-blue-100 rounded-xl bg-blue-50/40 p-2.5 mt-1.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {/* 단지 드롭다운 */}
                <select value={selectedComplex}
                  onChange={e => { setSelectedComplex(e.target.value); setSelectedDong(""); setSelectedHo(""); if (e.target.value) setSortBy("dongho"); }}
                  className="col-span-2 border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">단지 전체</option>
                  {complexList.map(([c, n]) => (
                    <option key={c} value={c}>{c.replace(/^.*[시구동]\s/, "")} ({n})</option>
                  ))}
                </select>
                {/* 동 드롭다운 */}
                <select value={selectedDong} disabled={!selectedComplex}
                  onChange={e => setSelectedDong(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-gray-100 disabled:text-gray-400">
                  <option value="">동 전체</option>
                  {dongList.map(([d, n]) => (
                    <option key={d} value={d}>{d}동 ({n})</option>
                  ))}
                </select>
                {/* 호 입력 */}
                <input type="text" inputMode="numeric" value={selectedHo}
                  onChange={e => setSelectedHo(e.target.value)}
                  placeholder="호수"
                  className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              {(selectedComplex || selectedDong || selectedHo) && (
                <button onClick={() => { setSelectedComplex(""); setSelectedDong(""); setSelectedHo(""); }}
                  className="mt-1.5 text-[11px] text-gray-500 hover:text-red-600">✕ 조회 초기화</button>
              )}
              </div>
              )}
            </div>
          )}

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
                    ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)] font-semibold"
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
              { key: "dongho",     label: "🏢 동·호순" },
            ] as const).map(s => (
              <button key={s.key} onClick={() => setSortBy(s.key)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  sortBy === s.key
                    ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)] font-semibold"
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
              <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="accent-[#2383E2]" />
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
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
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
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
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
                  <b className="text-[var(--brand-blue)] dark:text-blue-400">{start + 1}–{Math.min(start + PAGE_SIZE, total)}</b>건 표시
                </span>
                {showPager && (
                  <span className="font-medium">
                    {safePage}/{totalPages} 페이지
                  </span>
                )}
              </div>

              {viewStyle === "table" ? (
                <PropertyTable
                  list={pagedList}
                  selectedId={panelId || undefined}
                  onRowClick={p => setPanelId(p.id)}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  filterType={filterType}
                  onFilterTypeChange={setFilterType}
                  filterPropType={filterPropType}
                  onFilterPropTypeChange={setFilterPropType}
                  priceRange={priceRange}
                  onPriceRangeChange={setPriceRange}
                  colSearch={colSearch}
                  onColSearch={onColSearch}
                  onPatch={async (p, patch) => { await saveProperty(user.agencyId, { ...p, ...patch }); }}
                />
              ) : (
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
              )}

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
                            ? "bg-[var(--brand-blue)] text-white shadow-md scale-105"
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
          onSave={async p => { const ok = await upsert(p); if (ok) setEditing(null); }}
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
            await logPropertyEvent(user.agencyId, updated.id, {
              by: user.displayName || user.email || "나",
              kind: "progress",
              text: "계약 진행 정보 입력",
            });
            setProgressing(null);
          }}
        />
      )}

      {/* 우측 패널 — 표/카드 행 선택 시 상세 (노션식 사이드 보기) */}
      <PropertyPanel
        property={panelProp}
        onClose={() => setPanelId(null)}
        onEdit={p => setEditing({ ...p })}
        onCloneSameComplex={p => { cloneSameComplex(p); setPanelId(null); }}
        onProgress={p => setProgressing({ ...p })}
        onComplete={p => close(p)}
        onAddNote={async (p, text) => {
          if (!user) return;
          await logPropertyEvent(user.agencyId, p.id, {
            by: user.displayName || user.email || "나",
            kind: "note",
            text,
          });
        }}
      />

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

/* 요약 타일 — 만기·고객 페이지와 동일 구조 (연한 틴트 + 선택 시 진한 테두리·링·체크) */
function PropSummaryTile({ tint, label, count, sub, active, onClick }: {
  tint: "green" | "blue" | "red" | "gray";
  label: string;
  count: number;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  const C = {
    green: { bg: "var(--tint-green-bg)", tx: "var(--tint-green-tx)", tx2: "var(--tint-green-tx2)", ring: "#1D9E75" },
    blue:  { bg: "var(--tint-blue-bg)",  tx: "var(--tint-blue-tx)",  tx2: "var(--tint-blue-tx2)",  ring: "#2383E2" },
    red:   { bg: "var(--tint-red-bg)",   tx: "var(--tint-red-tx)",   tx2: "var(--tint-red-tx2)",   ring: "#E24B4A" },
    gray:  { bg: "var(--tint-gray-bg)",  tx: "#5F5E5B",              tx2: "#9B9A97",               ring: "#888780" },
  }[tint];
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-3 border transition-all hover:-translate-y-0.5 ${active ? "" : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:shadow-md"}`}
      style={active ? { background: C.bg, borderColor: C.ring, boxShadow: `0 0 0 2px ${C.ring}33` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold" style={{ color: active ? C.tx : "#6b7280" }}>{label}</span>
        {active && <span className="material-symbols-outlined text-[16px] leading-none" style={{ color: C.ring }}>check_circle</span>}
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: count > 0 ? C.tx : "#9ca3af" }}>
        {count}<span className="text-xs font-semibold ml-0.5" style={{ color: C.tx2 }}>건</span>
      </div>
      <div className="text-[10.5px] mt-0.5 truncate" style={{ color: C.tx2 }}>{sub || " "}</div>
    </button>
  );
}

