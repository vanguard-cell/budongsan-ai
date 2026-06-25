"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth, recordFeatureUse } from "@/lib/auth-context";
import {
  subscribeCustomers,
  saveCustomer as fsSaveCustomer,
  deleteCustomer as fsDeleteCustomer,
  saveCustomersBatch,
  logCustomerEvent,
  setCustomerHistory,
} from "@/lib/customers-db";
import {
  Customer,
  type CustomerEvent,
  type CustomerStage,
  STAGE_META,
  STAGE_FLOW,
  effectiveStage,
  stageToStatus,
  FollowUpSeverity,
  SIDE_LABELS,
  DEAL_KIND_LABELS,
  STATUS_LABELS,
  followUpDDay,
  followUpDDayLabel,
  followUpSeverity,
  followUpClasses,
  formatPhone,
  telUrl,
  smsUrl,
  emptyCustomer,
  sampleCustomers,
  uid,
} from "./customer-types";
import EditCustomerModal from "./EditCustomerModal";
import KakaoParseModal from "./KakaoParseModal";
import CustomerTable, { type CustSort } from "./CustomerTable";
import CustomerPanel from "./CustomerPanel";
import CustomerBoard from "./CustomerBoard";
import NotifyBell from "../NotifyBell";
import ExportModal from "../ExportModal";
import CustomersUploadModal, { type CustMergeStrategy } from "./CustomersUploadModal";
import { subscribeContracts } from "@/lib/contracts-db";
import { subscribeProperties, type Property } from "@/lib/properties-db";
import { exportCustomers } from "@/lib/export";
import type { Contract } from "../expiry/contracts";

type FilterKey = "all" | "needFollowup" | "vip" | "matched" | "lost" | "closed";

export default function CustomersPage() {
  const router = useRouter();

  // ?focus=<customerId> 들어오면 해당 카드로 스크롤 + 강조 (Suspense 회피용 직접 읽기)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const focusId = new URLSearchParams(window.location.search).get("focus");
    if (!focusId) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`customer-${focusId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-4", "ring-blue-300");
        setTimeout(() => el.classList.remove("ring-4", "ring-blue-300"), 2400);
      }
    }, 800);  // 데이터 로딩 대기
    return () => clearTimeout(t);
  }, []);
  const { user, loading: authLoading } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showKakaoParse, setShowKakaoParse] = useState(false);
  // 뷰: 카드(기존) / 표(엑셀형) — 마지막 선택 기억. (보드는 상단 상시 노출로 이동)
  const [viewStyle, setViewStyleState] = useState<"card" | "table">(() => {
    try { const v = localStorage.getItem("dealdone_customers_view"); return v === "table" ? "table" : "card"; } catch { return "card"; }
  });
  const setViewStyle = (v: "card" | "table") => {
    setViewStyleState(v);
    if (v === "table") recordFeatureUse(user?.uid, "cust_view_table");
    try { localStorage.setItem("dealdone_customers_view", v); } catch {}
  };
  const [boardOpen, setBoardOpen] = useState(true);              // 상단 파이프라인 보드 접기
  const [panelId, setPanelId] = useState<string | null>(null);   // 우측 패널 (표/카드 공용)
  const [sortBy, setSortBy] = useState<CustSort>("followup");    // 표 헤더 정렬
  const [colSearch, setColSearch] = useState<Record<string, string>>({});   // 표 컬럼 헤더 검색
  const onColSearch = (col: string, term: string) => setColSearch(s => ({ ...s, [col]: term }));

  /* 로그인 가드 */
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/customers");
  }, [authLoading, user, router]);

  // 홈 빠른 실행 "고객 추가" 진입 (?new=1) → 추가 모달 바로 열기
  // 파이프라인 보드 직접 진입 (?view=board) → 보드 뷰로 열기
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("new") === "1") setEditing(emptyCustomer());
    const v = p.get("view");
    if (v === "table" || v === "card") setViewStyle(v);
    else if (v === "board") { setViewStyle("card"); setBoardOpen(true); }  // 보드는 상단 상시 노출
  }, []);

  /* 실시간 구독 */
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeCustomers(user.agencyId, (list) => {
      setCustomers(list);
      setLoaded(true);
    });
    const unsubC = subscribeContracts(user.agencyId, setContracts);
    const unsubP = subscribeProperties(user.agencyId, setProperties);
    return () => { unsub(); unsubC(); unsubP(); };
  }, [user]);

  // ?focus=<id> 진입 시 — 표/카드 어느 뷰든 해당 고객 상세 패널 열기 (연계)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const focusId = new URLSearchParams(window.location.search).get("focus");
    if (focusId) setPanelId(focusId);
  }, []);

  /* 정렬 + 필터 — 후속 연락 일정 빠른 순 */
  const filtered = useMemo(() => {
    const withDday = customers.map(c => ({
      c,
      d: followUpDDay(c.nextFollowUp),
      s: followUpSeverity(followUpDDay(c.nextFollowUp)),
    }));

    return withDday
      .filter(({ c, s }) => {
        if (filter === "all") return c.status !== "lost" && c.status !== "closed";
        if (filter === "needFollowup") return c.status === "active" && (s === "overdue" || s === "today" || s === "soon");
        if (filter === "vip") return c.vip && c.status !== "lost" && c.status !== "closed";
        if (filter === "matched") return c.status === "matched";
        if (filter === "lost") return c.status === "lost";
        if (filter === "closed") return c.status === "closed";
        return true;
      })
      .filter(({ c }) => {
        const nameTerm = (colSearch.name || "").trim().toLowerCase();
        return !nameTerm || (c.name || "").toLowerCase().includes(nameTerm);
      })
      .filter(({ c }) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.preferredArea.toLowerCase().includes(q) ||
          c.memo.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "name") return (a.c.name || "").localeCompare(b.c.name || "", "ko");
        if (sortBy === "newest") return b.c.createdAt - a.c.createdAt;
        // followup(기본): 진행중·후속 연락 필요한 것 먼저
        if (a.c.status !== b.c.status) {
          const order: Record<string, number> = { active: 0, matched: 1, lost: 2, closed: 3 };
          return (order[a.c.status] ?? 9) - (order[b.c.status] ?? 9);
        }
        return a.d - b.d;
      });
  }, [customers, filter, query, sortBy, colSearch]);

  /* 보드용 — 상태 필터 무시, 검색만 적용한 전체 고객 (계약 성사·실패 칼럼도 채워짐) */
  // 완료 시점 추정 — '거래 완료/계약 성사' 이벤트 시각 → 없으면 마지막 활동 → 생성일
  const wonAt = (c: Customer): number => {
    const evs = c.history || [];
    const done = evs.filter(e => { const t = e.text || ""; return t.includes("거래 완료") || t.includes("계약 성사"); }).map(e => e.at);
    if (done.length) return Math.max(...done);
    if (evs.length) return Math.max(...evs.map(e => e.at));
    return c.createdAt;
  };
  const WON_RECENT_DAYS = 30;

  const boardCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      // 검색 중엔 완료 포함 전부 (찾는 고객이 보드에서도 보이게)
      return customers.filter(c =>
        c.name.toLowerCase().includes(q) || c.phone.includes(q) ||
        c.preferredArea.toLowerCase().includes(q) || c.memo.toLowerCase().includes(q),
      );
    }
    // 기본 보드: 오래된 완료건(계약 성사)은 숨김 — 데이터는 그대로, '완료' 필터에서 전부 보임
    const cutoff = Date.now() - WON_RECENT_DAYS * 86400000;
    return customers.filter(c => effectiveStage(c) !== "won" || wonAt(c) >= cutoff);
  }, [customers, query]);

  // 보드에서 숨긴 지난 완료 건수 (검색 중 아닐 때만 의미)
  const hiddenWonCount = useMemo(() => {
    if (query.trim()) return 0;
    const totalWon = customers.filter(c => effectiveStage(c) === "won").length;
    const shownWon = boardCustomers.filter(c => effectiveStage(c) === "won").length;
    return totalWon - shownWon;
  }, [customers, boardCustomers, query]);

  /* 보드 단계별 건수 — 헤더 옆 한눈 요약 (펼치든 접든 항상 보임) */
  const stageSummary = useMemo(() => {
    const order: CustomerStage[] = [...STAGE_FLOW, "lost"];
    const tally = Object.fromEntries(order.map(s => [s, 0])) as Record<CustomerStage, number>;
    for (const c of boardCustomers) tally[effectiveStage(c)]++;
    return order.map(s => ({ stage: s, meta: STAGE_META[s], n: tally[s] }));
  }, [boardCustomers]);

  /* 카운트 */
  const counts = useMemo(() => {
    const result = { all: 0, needFollowup: 0, vip: 0, matched: 0, lost: 0, closed: 0 };
    for (const c of customers) {
      const d = followUpDDay(c.nextFollowUp);
      const s = followUpSeverity(d);
      const isActive = c.status !== "lost" && c.status !== "closed";

      if (isActive) result.all++;
      if (c.status === "active" && (s === "overdue" || s === "today" || s === "soon")) result.needFollowup++;
      if (c.vip && isActive) result.vip++;
      if (c.status === "matched") result.matched++;
      if (c.status === "lost") result.lost++;
      if (c.status === "closed") result.closed++;
    }
    return result;
  }, [customers]);

  /* CRUD */
  const upsert = async (c: Customer) => {
    if (!user) return;
    const isNew = !customers.some(x => x.id === c.id);
    await fsSaveCustomer(user.agencyId, c);
    if (isNew) recordFeatureUse(user.uid, "cust_add");
  };

  const remove = async (id: string) => {
    if (!user) return;
    if (!confirm("이 고객을 영구 삭제할까요? 되돌릴 수 없습니다.")) return;
    await fsDeleteCustomer(user.agencyId, id);
  };

  const STATUS_LABEL: Record<Customer["status"], string> = { active: "진행 중", matched: "매칭", closed: "거래 완료", lost: "이탈" };
  const by = () => user?.displayName || user?.email || "나";
  const changeStatus = async (c: Customer, status: Customer["status"]) => {
    if (!user) return;
    if (c.status === status) return;
    // 포기·이탈 → 사유 수집 + drop 이벤트(단계가 '실패'로 이동)
    if (status === "lost") {
      if (!confirm(`${c.name || "이 고객"} 거래를 포기(이탈) 처리할까요?\n상단 [이탈] 필터에서 다시 복구할 수 있습니다.`)) return;
      const r = (prompt("포기·이탈 사유 (선택 — 예: 가격 부담 / 위치 / 타이밍 / 연락두절)") ?? "").trim();
      await fsSaveCustomer(user.agencyId, { ...c, status });
      await logCustomerEvent(user.agencyId, c.id, {
        by: by(), kind: "drop",
        text: r ? `포기 — ${r}` : "포기(이탈)",
        ...(r ? { reason: r } : {}),
      });
      return;
    }
    await fsSaveCustomer(user.agencyId, { ...c, status });
    await logCustomerEvent(user.agencyId, c.id, { by: by(), kind: "status", text: `상태 변경 → ${STATUS_LABEL[status]}` });
  };

  // 보드 드래그 — 단계 이동 (단계 + 상태 동기화)
  const moveStage = async (c: Customer, stage: CustomerStage) => {
    if (!user) return;
    if (stage === "lost") { await changeStatus(c, "lost"); return; }   // 사유 prompt 포함
    await fsSaveCustomer(user.agencyId, { ...c, stage, status: stageToStatus(stage) });
    await logCustomerEvent(user.agencyId, c.id, { by: by(), kind: "status", text: `단계 → ${STAGE_META[stage].label}` });
    recordFeatureUse(user.uid, "cust_stage");
  };

  const addCustomerEvent = async (c: Customer, ev: Omit<CustomerEvent, "at" | "by">) => {
    if (!user) return;
    recordFeatureUse(user.uid, "cust_log");
    await logCustomerEvent(user.agencyId, c.id, {
      by: user.displayName || user.email || "나",
      kind: ev.kind,
      text: ev.text,
      ...(ev.reaction ? { reaction: ev.reaction } : {}),
    });
  };
  const editCustomerEvent = async (c: Customer, idx: number, text: string) => {
    if (!user) return;
    const h = [...(c.history || [])];
    if (!h[idx]) return;
    h[idx] = { ...h[idx], text };
    await setCustomerHistory(user.agencyId, c.id, h);
  };
  const deleteCustomerEvent = async (c: Customer, idx: number) => {
    if (!user) return;
    const h = (c.history || []).filter((_, i) => i !== idx);
    await setCustomerHistory(user.agencyId, c.id, h);
  };

  const loadSamples = async () => {
    if (!user) return;
    if (customers.length > 0) {
      if (!confirm("기존 고객 데이터가 있습니다. 예시 데이터를 추가할까요?")) return;
    }
    await saveCustomersBatch(user.agencyId, sampleCustomers());
  };

  const clearAll = async () => {
    if (!user) return;
    if (!confirm("⚠️ 모든 고객 데이터를 삭제합니다. 정말 진행할까요?")) return;
    for (const c of customers) await fsDeleteCustomer(user.agencyId, c.id);
  };

  const handleUploadConfirm = async (toSave: Customer[], strategy: CustMergeStrategy) => {
    if (!user) return;
    if (strategy === "replace") {
      for (const c of customers) await fsDeleteCustomer(user.agencyId, c.id);
    }
    await saveCustomersBatch(user.agencyId, toSave);
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  const panelCustomer = panelId ? customers.find(x => x.id === panelId) || null : null;

  return (
    <div className={`transition-[padding] duration-300 ease-out ${panelCustomer ? "lg:pr-[400px]" : ""}`}>
      <div className="w-full">

        {/* Stitch 톤 페이지 헤더 — 좌측 제목 + 우측 액션 */}
        <section className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-6">
          <div>
            <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400" style={{ fontSize: "2rem" }}>group</span>
              고객 관리
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
              예산·관심지역·매물 매칭 이력 + 후속 연락 자동 알림
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <NotifyBell contracts={contracts} customers={customers} />
            {/* 카톡 붙여넣기 — 특별 강조 (AI 기능) */}
            <button
              onClick={() => setShowKakaoParse(true)}
              title="카톡/문자 대화를 붙여넣으면 AI가 자동으로 고객 정보 추출"
              className="px-4 py-2.5 rounded-xl border border-yellow-300 bg-yellow-50 text-yellow-700 text-sm font-bold flex items-center gap-1.5 hover:bg-yellow-100 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-lg">chat</span>
              카톡 붙여넣기
            </button>
            {/* 보조 액션 그룹 */}
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
                title="예시 고객 5건 추가"
                className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">science</span>
                <span className="hidden sm:inline">예시</span>
              </button>
              {customers.length > 0 && (
                <button
                  onClick={clearAll}
                  title="모든 고객 데이터 삭제"
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">delete_sweep</span>
                  <span className="hidden sm:inline">전체 삭제</span>
                </button>
              )}
            </div>
            {/* 뷰 토글 — 카드 / 표 */}
            <div className="inline-flex rounded-lg border border-[var(--sidebar-bd)] overflow-hidden text-xs font-semibold">
              <button onClick={() => setViewStyle("card")}
                className={`px-3 py-2 flex items-center gap-1 transition-colors ${viewStyle === "card" ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)]" : "bg-white dark:bg-slate-900 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"}`}>
                <span className="material-symbols-outlined text-[15px] leading-none">grid_view</span>카드
              </button>
              <button onClick={() => setViewStyle("table")}
                className={`px-3 py-2 flex items-center gap-1 border-l border-[var(--sidebar-bd)] transition-colors ${viewStyle === "table" ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)]" : "bg-white dark:bg-slate-900 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"}`}>
                <span className="material-symbols-outlined text-[15px] leading-none">table_rows</span>표
              </button>
            </div>

            {/* 메인 액션 */}
            <button
              onClick={() => setEditing(emptyCustomer())}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all shadow-md hover:scale-[1.02] active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">person_add</span>
              고객 추가
            </button>
          </div>
        </section>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
          <SummaryCard label="후속 연락 필요" count={counts.needFollowup} accent="red" />
          <SummaryCard label="진행 중" count={counts.all} accent="blue" />
          <SummaryCard label="VIP" count={counts.vip} accent="purple" />
          <SummaryCard label="거래 완료" count={counts.closed} accent="gray" />
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>전체 ({counts.all})</FilterChip>
            <FilterChip active={filter === "needFollowup"} onClick={() => { setFilter("needFollowup"); recordFeatureUse(user?.uid, "cust_filter"); }}>🔔 후속 연락 ({counts.needFollowup})</FilterChip>
            <FilterChip active={filter === "vip"} onClick={() => { setFilter("vip"); recordFeatureUse(user?.uid, "cust_filter"); }}>⭐ VIP ({counts.vip})</FilterChip>
            <FilterChip active={filter === "matched"} onClick={() => { setFilter("matched"); recordFeatureUse(user?.uid, "cust_filter"); }}>매칭 ({counts.matched})</FilterChip>
            <FilterChip active={filter === "lost"} onClick={() => { setFilter("lost"); recordFeatureUse(user?.uid, "cust_filter"); }}>이탈 ({counts.lost})</FilterChip>
            <FilterChip active={filter === "closed"} onClick={() => { setFilter("closed"); recordFeatureUse(user?.uid, "cust_filter"); }}>완료 ({counts.closed})</FilterChip>
          </div>
        </div>

        {/* 상단 — 고객 파이프라인 보드 (단계 한눈 + 드래그 이동). 아래 목록이 걸쳐 보이도록 높이 제한 */}
        {loaded && customers.length > 0 && (
          <div className="mb-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
              <button onClick={() => setBoardOpen(o => { if (!o) recordFeatureUse(user?.uid, "cust_board_open"); return !o; })}
                className="flex items-center gap-1.5 text-sm font-bold text-gray-800 dark:text-gray-100 hover:text-[var(--brand-blue)] transition-colors shrink-0">
                <span className="material-symbols-outlined text-[18px] text-[var(--brand-blue)]">view_kanban</span>
                진행 파이프라인 <span className="text-gray-400 font-medium">{boardCustomers.length}</span>
                <span className={`material-symbols-outlined text-[18px] text-gray-400 transition-transform ${boardOpen ? "" : "-rotate-90"}`}>expand_more</span>
              </button>
              {/* 한눈 요약 — 단계별 건수 (보드 안 펼쳐도/스크롤 안 해도 분포 파악) */}
              <div className="flex flex-wrap items-center gap-1">
                {stageSummary.map(({ stage, meta, n }, i) => (
                  <span key={stage} className="inline-flex items-center gap-1">
                    {i > 0 && <span className="text-gray-300 dark:text-slate-600 text-[11px]">·</span>}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-opacity ${n === 0 ? "opacity-40" : ""}`}
                      style={{ background: meta.bg, color: meta.fg }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.fg }} />
                      {meta.short} {n}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            {boardOpen && (
              <div className="rounded-2xl border border-[var(--sidebar-bd)] bg-gray-50/50 dark:bg-slate-800/30 p-2">
                <CustomerBoard
                  customers={boardCustomers}
                  selectedId={panelId || undefined}
                  onSelect={id => setPanelId(id)}
                  onMoveStage={moveStage}
                  heightClass="max-h-[42vh]"
                />
                {hiddenWonCount > 0 && (
                  <button
                    onClick={() => setFilter("closed")}
                    className="mt-1 w-full text-center text-[11px] text-gray-400 hover:text-[var(--brand-blue)] transition-colors py-1"
                    title="지난 완료 건은 아래 [완료] 필터에서 전부 볼 수 있어요"
                  >
                    계약 성사 칸은 최근 30일만 표시 · 지난 완료 {hiddenWonCount}건 더 보기 →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 검색 — 상단 보드와 전체 명단 사이 */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="🔍 이름 · 연락처 · 지역 · 메모 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 목록 — 전체 고객 리스트 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <EmptyState isFirstUse={customers.length === 0} onAdd={() => setEditing(emptyCustomer())} />
        ) : viewStyle === "table" ? (
          <CustomerTable
            list={filtered}
            selectedId={panelId || undefined}
            onRowClick={c => setPanelId(c.id)}
            sortBy={sortBy}
            onSortChange={setSortBy}
            filter={filter}
            onFilterChange={setFilter}
            colSearch={colSearch}
            onColSearch={onColSearch}
            onPatch={async (c, patch) => { await fsSaveCustomer(user.agencyId, { ...c, ...patch }); }}
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map(({ c, d, s }) => (
              <CustomerRow
                key={c.id}
                customer={c}
                properties={properties}
                dday={d}
                severity={s}
                onEdit={() => setEditing({ ...c })}
                onDelete={() => remove(c.id)}
                onChangeStatus={(st) => changeStatus(c, st)}
              />
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6 leading-relaxed">
          💡 어머니 카톡 응대 자료 받으면 답변 초안 생성 기능 추가 예정 (Phase 2)
        </p>
      </div>

      {/* 우측 패널 — 표/카드 행 선택 시 상세 */}
      <CustomerPanel
        customer={panelCustomer}
        onClose={() => setPanelId(null)}
        onEdit={c => setEditing({ ...c })}
        onChangeStatus={(c, st) => changeStatus(c, st)}
        onAddEvent={addCustomerEvent}
        onEditEvent={editCustomerEvent}
        onDeleteEvent={deleteCustomerEvent}
      />

      {editing && (
        <EditCustomerModal
          customer={editing}
          properties={properties}
          onClose={() => setEditing(null)}
          onSave={async (c) => { await upsert({ ...c, id: c.id || uid() }); setEditing(null); }}
        />
      )}

      {/* 카톡 파싱 모달 — AI가 대화에서 고객 정보 추출 */}
      {showKakaoParse && (
        <KakaoParseModal
          onClose={() => setShowKakaoParse(false)}
          onSave={async (c) => {
            await upsert({ ...c, id: c.id || uid() });
            recordFeatureUse(user.uid, "cust_kakao");
            setShowKakaoParse(false);
            alert(`✅ 고객 "${c.name || c.phone || "(이름없음)"}"이(가) 등록되었습니다.`);
          }}
        />
      )}

      {/* 내보내기 모달 */}
      {showExport && (
        <ExportModal
          type="customers"
          totalCount={customers.length}
          activeCount={customers.filter(c => c.status === "active" || c.status === "matched").length}
          onClose={() => setShowExport(false)}
          onExport={(opt) => exportCustomers(customers, opt)}
        />
      )}

      {/* 엑셀 업로드 모달 */}
      {showUpload && (
        <CustomersUploadModal
          existing={customers}
          onClose={() => setShowUpload(false)}
          onConfirm={handleUploadConfirm}
        />
      )}
    </div>
  );
}

/* ───── 요약 카드 ───── */
function SummaryCard({ label, count, accent }: { label: string; count: number; accent: "red" | "blue" | "purple" | "gray" }) {
  const cls = {
    red:    { bg: "bg-red-50/50 border-red-200", dot: "bg-red-500" },
    blue:   { bg: "bg-blue-50/50 border-blue-200", dot: "bg-blue-500" },
    purple: { bg: "bg-purple-50/50 border-purple-200", dot: "bg-purple-500" },
    gray:   { bg: "bg-white border-gray-200", dot: "bg-gray-400" },
  }[accent];
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${cls.bg}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${cls.dot}`} />
        <div className="text-[11px] sm:text-xs text-gray-600">{label}</div>
      </div>
      <div className="text-xl sm:text-2xl font-bold text-gray-900">{count}<span className="text-sm font-normal text-gray-500 ml-1">명</span></div>
    </div>
  );
}

function FilterChip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  const base = "text-xs px-3 py-1.5 rounded-full border transition-colors";
  return (
    <button
      onClick={onClick}
      className={active
        ? `${base} font-semibold bg-blue-600 text-white border-blue-600`
        : `${base} bg-white text-gray-600 border-gray-200 hover:border-blue-400`}
    >
      {children}
    </button>
  );
}

/* ───── 고객 행 ───── */
function CustomerRow({
  customer: c, properties, dday, severity,
  onEdit, onDelete, onChangeStatus,
}: {
  customer: Customer;
  properties: Property[];
  dday: number;
  severity: FollowUpSeverity;
  onEdit: () => void;
  onDelete: () => void;
  onChangeStatus: (s: Customer["status"]) => void;
}) {
  const cls = followUpClasses(severity);
  const isInactive = c.status === "lost" || c.status === "closed";
  const [showShown, setShowShown] = useState(false);

  // shownProperties와 내 매물 매칭 — address 비교 (정확/부분 매칭)
  const matchProperty = (shownAddr: string): Property | null => {
    if (!shownAddr) return null;
    // 정확 매칭 우선
    const exact = properties.find(p => p.address === shownAddr);
    if (exact) return exact;
    // 부분 매칭 (동/호수 차이 등)
    const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
    const sn = norm(shownAddr);
    return properties.find(p => norm(p.address).includes(sn) || sn.includes(norm(p.address))) || null;
  };

  const buildSmsBody = () => {
    const greeting = `안녕하세요, 미사금빛공인중개사입니다.`;
    const follow = c.nextFollowUp
      ? `${c.preferredArea ? c.preferredArea + " 관련 " : ""}새 매물 찾아보았는데 연락 가능하실까요?`
      : "연락 가능하실 때 알려주세요.";
    return `${greeting}\n${follow}`;
  };

  return (
    <div id={`customer-${c.id}`} className={`rounded-2xl border p-3 sm:p-4 transition-all ${isInactive ? "bg-gray-50/60 border-gray-200 opacity-70" : cls.row}`}>
      <div className="flex items-start gap-3">
        {/* 후속 D-day 배지 */}
        <div className="flex-shrink-0">
          {c.nextFollowUp ? (
            <div className={`inline-flex flex-col items-center justify-center min-w-[64px] px-2 py-1.5 rounded-xl border ${cls.badge} text-center`}>
              <div className="text-[10px] font-medium leading-tight">후속</div>
              <div className="text-sm font-bold leading-tight">{followUpDDayLabel(dday)}</div>
            </div>
          ) : (
            <div className="inline-flex flex-col items-center justify-center min-w-[64px] px-2 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 text-center">
              <div className="text-[10px] leading-tight">후속</div>
              <div className="text-sm font-bold leading-tight">—</div>
            </div>
          )}
        </div>

        {/* 메인 */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{SIDE_LABELS[c.side]}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{DEAL_KIND_LABELS[c.dealKind]}</span>
            {c.vip && <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">⭐ VIP</span>}
            <span className="text-sm font-semibold text-gray-900">{c.name || "(이름 없음)"}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{STATUS_LABELS[c.status]}</span>
          </div>

          <div className="text-xs text-gray-600 mt-1 space-y-0.5">
            {c.budget && <div>💰 예산: <span className="text-gray-800">{c.budget}</span></div>}
            {c.preferredArea && <div>📍 지역: <span className="text-gray-800">{c.preferredArea}</span></div>}
            {c.moveInDate && <div>📅 입주 가능: <span className="text-gray-800">{c.moveInDate}</span></div>}
            {c.nextFollowUp && <div>🔔 후속 예정: <span className="text-gray-800">{c.nextFollowUp}</span></div>}
            {c.shownProperties.length > 0 && (
              <div>
                <button
                  onClick={() => setShowShown(v => !v)}
                  className="text-left hover:text-blue-700 transition-colors"
                  title="클릭하면 내 매물 연동 정보가 표시됩니다"
                >
                  🏠 보여드린 매물 <span className="font-semibold text-blue-600 underline decoration-dotted">{c.shownProperties.length}건</span>
                  <span className="ml-1 text-[10px] text-gray-400">{showShown ? "▲" : "▼"}</span>
                </button>
              </div>
            )}
          </div>

          {/* 보여드린 매물 펼침 — 내 매물장 연동 */}
          {showShown && c.shownProperties.length > 0 && (
            <div className="mt-2 space-y-1.5 bg-blue-50/40 rounded-xl p-2 border border-blue-100">
              {c.shownProperties.map((sp, idx) => {
                const matched = matchProperty(sp.address);
                const reactionEmoji = sp.reaction === "positive" ? "😊" : sp.reaction === "negative" ? "😕" : sp.reaction === "neutral" ? "😐" : "";
                return (
                  <div key={idx} className="bg-white rounded-lg p-2 border border-gray-200">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">{sp.shownAt || "—"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {matched ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium shrink-0">🔗 내 매물장</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0" title="내 매물 관리에 없는 외부 매물">외부매물</span>
                          )}
                          {reactionEmoji && <span className="text-[11px]">{reactionEmoji}</span>}
                        </div>
                        <div className="text-[11px] text-gray-800 font-medium break-all mt-0.5">{sp.address || "(주소 없음)"}</div>
                        {matched && (
                          <div className="text-[10px] text-emerald-700 mt-0.5">
                            {matched.dealType} · {matched.propertyType}
                            {matched.price ? ` · ${matched.dealType === "월세" ? `${matched.price}/${matched.monthly || 0}만` : `${matched.price}만`}` : ""}
                            {matched.ownerName ? ` · 집주인 ${matched.ownerName}` : ""}
                          </div>
                        )}
                        {sp.note && (
                          <div className="text-[10px] text-gray-500 mt-0.5">💬 {sp.note}</div>
                        )}
                      </div>
                      {matched && (
                        <a
                          href={`/properties#${matched.id}`}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
                          title="내 매물 관리로 이동"
                        >
                          →
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="text-[10px] text-blue-600 text-center pt-1">
                💡 매물 정보 수정은 &quot;수정&quot; 버튼에서, 내 매물장에서 자동완성 검색 가능
              </div>
            </div>
          )}

          {/* 연락처 */}
          {c.phone && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs">
              <a href={telUrl(c.phone)} className="text-blue-600 hover:underline">📞 {formatPhone(c.phone)}</a>
              {!isInactive && (
                <a
                  href={smsUrl(c.phone, buildSmsBody())}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  문자
                </a>
              )}
            </div>
          )}

          {c.memo && (
            <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1 border border-gray-100">
              💬 {c.memo}
            </div>
          )}
        </div>
      </div>

      {/* 액션 — 색 구분감 강화 */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        <button onClick={onEdit} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors">
          ✏️ 수정
        </button>
        {c.status === "active" && (
          <>
            <button onClick={() => onChangeStatus("matched")} className="text-[11px] px-2.5 py-1 rounded-full border border-green-300 bg-green-50 text-green-700 font-semibold hover:bg-green-100 transition-colors">
              🤝 매칭으로
            </button>
            <button onClick={() => onChangeStatus("closed")} className="text-[11px] px-2.5 py-1 rounded-full border border-blue-300 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors">
              ✅ 거래 완료
            </button>
            <button onClick={() => onChangeStatus("lost")} className="text-[11px] px-2.5 py-1 rounded-full border border-orange-300 bg-orange-50 text-orange-700 font-semibold hover:bg-orange-100 transition-colors">
              ⚠️ 이탈
            </button>
          </>
        )}
        {c.status === "matched" && (
          <button onClick={() => onChangeStatus("closed")} className="text-[11px] px-2.5 py-1 rounded-full border border-blue-300 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors">
            ✅ 거래 완료
          </button>
        )}
        {(c.status === "lost" || c.status === "closed") && (
          <button onClick={() => onChangeStatus("active")} className="text-[11px] px-2.5 py-1 rounded-full border border-purple-300 bg-purple-50 text-purple-700 font-semibold hover:bg-purple-100 transition-colors">
            ↩️ 다시 진행 중으로
          </button>
        )}
        <button onClick={onDelete} className="text-[11px] px-2.5 py-1 rounded-full border border-red-300 bg-red-50 text-red-700 font-semibold hover:bg-red-100 transition-colors ml-auto">
          🗑️ 삭제
        </button>
      </div>
    </div>
  );
}

function EmptyState({ isFirstUse, onAdd }: { isFirstUse: boolean; onAdd: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
      <div className="text-5xl mb-3">{isFirstUse ? "👋" : "🔍"}</div>
      <div className="text-base font-semibold text-gray-900 mb-1">
        {isFirstUse ? "아직 등록된 고객이 없습니다" : "조건에 맞는 고객이 없습니다"}
      </div>
      <div className="text-xs text-gray-500 mb-4">
        {isFirstUse
          ? "새 고객을 추가하면 후속 연락 일정을 자동 관리해드립니다"
          : "필터를 바꾸거나 검색어를 지워보세요"}
      </div>
      {isFirstUse && (
        <button
          onClick={onAdd}
          className="text-sm px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
        >
          + 첫 고객 추가
        </button>
      )}
    </div>
  );
}
