"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import ComplexPickerWidget from "@/app/ComplexPicker";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeContracts,
  saveContract as fsSaveContract,
  deleteContract as fsDeleteContract,
  saveContractsBatch,
  migrateFromLocalStorage,
} from "@/lib/contracts-db";
import UploadModal, { type MergeStrategy } from "./UploadModal";
import NotifyBell from "../NotifyBell";
import ExportModal from "../ExportModal";
import { subscribeCustomers } from "@/lib/customers-db";
import { saveProperty, contractBackToProperty } from "@/lib/properties-db";
import { exportContracts } from "@/lib/export";
import { printExpiryBoardHTML } from "@/lib/print-pdf";
import type { Customer } from "../customers/customer-types";
import {
  Contract,
  ContractType,
  ContactTarget,
  NotifyStage,
  Severity,
  loadContracts,
  dDay,
  dDayLabel,
  severityOf,
  severityLabel,
  severityClasses,
  formatPhone,
  defaultEndDate,
  emptyContract,
  buildSmsTemplate,
  smsUrl,
  telUrl,
  uid,
  sampleContracts,
  DEFAULT_SMS_TEMPLATES,
  loadCustomSmsTemplates,
  saveCustomSmsTemplate,
  resetCustomSmsTemplate,
  applyTemplate,
} from "./contracts";

type FilterKey = "all" | Severity;

export default function ExpiryPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [migratedCount, setMigratedCount] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState<Contract | null>(null);
  const [smsTarget, setSmsTarget] = useState<{ contract: Contract; target: ContactTarget } | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSmsSettings, setShowSmsSettings] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // 알림용 손님 데이터 (가벼운 구독)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeCustomers(user.agencyId, setCustomers);
    return () => unsub();
  }, [user]);

  /* 비로그인 → /login 으로 */
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?redirect=/expiry");
    }
  }, [authLoading, user, router]);

  /* 데이터 실시간 구독 + 첫 진입 시 localStorage 마이그레이션 */
  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | undefined;

    (async () => {
      // 1) localStorage에 남아있는 기존 데이터 마이그레이션 (1회)
      try {
        const moved = await migrateFromLocalStorage(user.agencyId);
        if (moved > 0) setMigratedCount(moved);
      } catch (e) {
        console.error("마이그레이션 오류:", e);
      }

      // 2) 실시간 구독 시작 — 다른 기기에서 변경 시 자동 반영
      unsub = subscribeContracts(user.agencyId, (list) => {
        setContracts(list);
        setLoaded(true);
      });
    })();

    return () => { if (unsub) unsub(); };
  }, [user]);

  /* ── 정렬 + 필터 ── */
  const filtered = useMemo(() => {
    const withDday = contracts.map(c => ({ c, d: dDay(c.endDate), s: severityOf(dDay(c.endDate)) }));

    return withDday
      .filter(({ c }) => (showClosed ? c.status === "closed" : c.status === "active"))
      .filter(({ s }) => (filter === "all" ? true : s === filter))
      .filter(({ c }) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          c.address.toLowerCase().includes(q) ||
          c.tenantName.toLowerCase().includes(q) ||
          c.landlordName.toLowerCase().includes(q) ||
          c.tenantPhone.includes(q) ||
          c.landlordPhone.includes(q)
        );
      })
      .sort((a, b) => a.d - b.d);
  }, [contracts, filter, showClosed, query]);

  /* ── 요약 카운트 ── */
  const counts = useMemo(() => {
    const active = contracts.filter(c => c.status === "active");
    const result = { danger: 0, warning: 0, caution: 0, safe: 0, all: active.length };
    for (const c of active) {
      result[severityOf(dDay(c.endDate))]++;
    }
    return result;
  }, [contracts]);

  /* ── CRUD (Firestore) ── */
  const upsertContract = async (c: Contract) => {
    if (!user) return;
    await fsSaveContract(user.agencyId, c);
    // 실시간 구독이 자동 반영하지만, 즉시 반응 위해 낙관적 업데이트
    setContracts(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      if (idx === -1) return [...prev, c];
      const next = [...prev];
      next[idx] = c;
      return next;
    });
  };

  const closeContract = async (id: string) => {
    if (!user) return;
    if (!confirm("이 계약을 '종료' 상태로 변경할까요? (삭제는 아니며 종료된 계약 보기에서 확인 가능합니다)")) return;
    const target = contracts.find(c => c.id === id);
    if (!target) return;
    await fsSaveContract(user.agencyId, { ...target, status: "closed" });
  };

  const reopenContract = async (id: string) => {
    if (!user) return;
    const target = contracts.find(c => c.id === id);
    if (!target) return;
    await fsSaveContract(user.agencyId, { ...target, status: "active" });
  };

  const deleteContract = async (id: string) => {
    if (!user) return;
    if (!confirm("이 계약을 영구 삭제할까요? 되돌릴 수 없습니다.")) return;
    await fsDeleteContract(user.agencyId, id);
  };

  /**
   * 만기관리 → 매물 관리로 되돌리기 (재모집)
   * - Contract를 closed로 변경 (이력 보존)
   * - Property로 새로 생성하여 광고 시작
   */
  const jumpReopenAsProperty = async (c: Contract) => {
    if (!user) return;
    if (!confirm(
      `${c.address}\n\n매물 관리로 되돌릴까요? (재모집)\n→ 새 매물로 광고 시작\n→ 이 만기 카드는 '종료'로 보존됩니다\n→ 매물 관리 페이지로 이동합니다`,
    )) return;
    try {
      const prop = contractBackToProperty({
        address: c.address, type: c.type, deposit: c.deposit, monthly: c.monthly,
        landlordName: c.landlordName, landlordPhone: c.landlordPhone, memo: c.memo,
      });
      // 1. 새 매물 저장
      await saveProperty(user.agencyId, prop);
      // 2. 원 계약을 closed로 (이력 보존)
      await fsSaveContract(user.agencyId, { ...c, status: "closed" });
      // 3. 매물 관리 페이지로 자동 이동 — 사용자가 결과 즉시 확인
      router.push("/properties");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[reopenAsProperty] 실패:", e);
      alert(`처리 중 오류가 발생했습니다.\n\n${msg}\n\n권한 오류라면 Firebase Console에서 Rules 재배포가 필요할 수 있습니다.`);
    }
  };

  const loadSampleData = async () => {
    if (!user) return;
    if (contracts.length > 0) {
      if (!confirm("기존 계약 데이터가 있습니다. 예시 데이터를 추가할까요? (기존 데이터는 유지됩니다)")) return;
    }
    await saveContractsBatch(user.agencyId, sampleContracts());
  };

  const clearAllData = async () => {
    if (!user) return;
    if (!confirm("⚠️ 모든 계약 데이터를 삭제합니다. 정말 진행할까요?")) return;
    // 직렬 삭제 (한 사용자 범위라 일반 사용량에서 충분)
    for (const c of contracts) {
      await fsDeleteContract(user.agencyId, c.id);
    }
  };

  const handleUploadConfirm = async (toSave: Contract[], strategy: MergeStrategy) => {
    if (!user) return;
    if (strategy === "replace") {
      // 기존 데이터 전부 삭제 후 일괄 저장
      for (const c of contracts) {
        await fsDeleteContract(user.agencyId, c.id);
      }
    }
    await saveContractsBatch(user.agencyId, toSave);
  };

  /* 인증 처리 중 / 로그인 안 됨 */
  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* 사용자 바 */}
        <div className="flex items-center justify-end gap-2 mb-3 text-[11px] text-gray-500">
          <NotifyBell contracts={contracts} customers={customers} />
          <span className="text-gray-300">·</span>
          <span>👤 {user.displayName || user.email}</span>
          <span className="text-gray-300">·</span>
          <button
            onClick={() => { if (confirm("로그아웃 하시겠어요?")) signOut(); }}
            className="hover:text-blue-600 hover:underline"
          >
            로그아웃
          </button>
        </div>

        {/* 마이그레이션 안내 */}
        {migratedCount !== null && migratedCount > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-3 py-2 mb-4 text-xs text-green-800">
            ✅ 기존 기기 저장 데이터 {migratedCount}건을 클라우드로 옮겼습니다. 이제 PC·폰에서 같이 보실 수 있어요.
          </div>
        )}

        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            ⏰ 만기 관리
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">임대차 계약 만기 알림 보드</h1>
          <p className="text-gray-500 text-xs sm:text-sm mb-3">
            만기 4개월 / 3개월 / 2개월 전 자동 분류 — 임차인·임대인에게 바로 연락
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setShowSmsSettings(true)}
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              📝 문구 설정
            </button>
            <button
              onClick={() => setEditing(emptyContract())}
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
            >
              + 계약 추가
            </button>
            <button
              onClick={loadSampleData}
              title="예시 계약 6건 추가 (위험·주의·예고·안전·종료 각 단계 포함)"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              🧪 예시 데이터
            </button>
            <button
              onClick={() => setShowUpload(true)}
              title="한방·4989·자체 엑셀 모두 가능 — 컬럼 매핑 후 일괄 가져오기"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              📥 엑셀 업로드
            </button>
            <button
              onClick={() => setShowExport(true)}
              title="현재 데이터를 엑셀로 다운로드 — 백업 또는 다른 프로그램으로 이관용"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              📤 내보내기
            </button>
            {contracts.length > 0 && (
              <button
                onClick={clearAllData}
                title="모든 계약 데이터 삭제"
                className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors"
              >
                🗑️ 전체 삭제
              </button>
            )}
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
          <SummaryCard label="위험 D-60 이내" count={counts.danger} severity="danger" />
          <SummaryCard label="주의 D-90 이내" count={counts.warning} severity="warning" />
          <SummaryCard label="예고 D-120 이내" count={counts.caution} severity="caution" />
          <SummaryCard label="안전 D-120 초과" count={counts.safe} severity="safe" />
        </div>

        {/* 필터 / 검색 */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-3 sm:p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              전체 ({counts.all})
            </FilterChip>
            <FilterChip active={filter === "danger"} onClick={() => setFilter("danger")} severity="danger">
              🔴 위험 ({counts.danger})
            </FilterChip>
            <FilterChip active={filter === "warning"} onClick={() => setFilter("warning")} severity="warning">
              🟠 주의 ({counts.warning})
            </FilterChip>
            <FilterChip active={filter === "caution"} onClick={() => setFilter("caution")} severity="caution">
              🟡 예고 ({counts.caution})
            </FilterChip>
            <div className="flex-1" />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={e => setShowClosed(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600"
              />
              종료된 계약 보기
            </label>
          </div>
          <input
            type="text"
            placeholder="🔍 주소 · 이름 · 연락처 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 목록 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            isFirstUse={contracts.length === 0}
            onAdd={() => setEditing(emptyContract())}
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map(({ c, d, s }) => (
              <ContractRow
                key={c.id}
                contract={c}
                dday={d}
                severity={s}
                onEdit={() => setEditing({ ...c })}
                onClose={() => closeContract(c.id)}
                onReopen={() => reopenContract(c.id)}
                onDelete={() => deleteContract(c.id)}
                onSms={target => setSmsTarget({ contract: c, target })}
                onJumpCustomer={c.linkedCustomerId && customers.some(cu => cu.id === c.linkedCustomerId)
                  ? () => router.push(`/customers?focus=${c.linkedCustomerId}`)
                  : undefined}
                onReopenAsProperty={() => jumpReopenAsProperty(c)}
              />
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6 leading-relaxed">
          ☁️ Google Cloud 서울 리전에 암호화 저장 — PC·폰 자동 동기화
        </p>
      </div>

      {/* 추가/수정 모달 */}
      {editing && (
        <EditModal
          contract={editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            await upsertContract(c);
            setEditing(null);
          }}
        />
      )}

      {/* 문자 모달 */}
      {smsTarget && (
        <SmsModal
          contract={smsTarget.contract}
          target={smsTarget.target}
          onClose={() => setSmsTarget(null)}
        />
      )}

      {/* 엑셀 업로드 모달 */}
      {showUpload && (
        <UploadModal
          existing={contracts}
          onClose={() => setShowUpload(false)}
          onConfirm={handleUploadConfirm}
        />
      )}

      {/* 문구 설정 모달 */}
      {showSmsSettings && (
        <SmsTemplateSettingsModal onClose={() => setShowSmsSettings(false)} />
      )}

      {/* 내보내기 모달 */}
      {showExport && (
        <ExportModal
          type="contracts"
          totalCount={contracts.length}
          activeCount={contracts.filter(c => c.status === "active").length}
          onClose={() => setShowExport(false)}
          onExport={(opt) => exportContracts(contracts, opt)}
          onPrintPDF={() => printExpiryBoardHTML(contracts)}
        />
      )}
    </div>
  );
}

/* ───────── 요약 카드 ───────── */
function SummaryCard({ label, count, severity }: { label: string; count: number; severity: Severity }) {
  const cls = severityClasses(severity);
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${cls.row}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${cls.dot}`} />
        <div className="text-[11px] sm:text-xs text-gray-600">{label}</div>
      </div>
      <div className="text-xl sm:text-2xl font-bold text-gray-900">{count}<span className="text-sm font-normal text-gray-500 ml-1">건</span></div>
    </div>
  );
}

/* ───────── 필터 칩 ───────── */
function FilterChip({
  children,
  active,
  onClick,
  severity,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  severity?: Severity;
}) {
  const base = "text-xs px-3 py-1.5 rounded-full border transition-colors";
  if (active) {
    const cls = severity ? severityClasses(severity) : null;
    return (
      <button
        onClick={onClick}
        className={`${base} font-semibold ${
          cls ? cls.badge : "bg-blue-600 text-white border-blue-600"
        }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`${base} bg-white text-gray-600 border-gray-200 hover:border-blue-400`}
    >
      {children}
    </button>
  );
}

/* ───────── 계약 행 ───────── */
function ContractRow({
  contract: c,
  dday,
  severity,
  onEdit,
  onClose,
  onReopen,
  onDelete,
  onSms,
  onJumpCustomer,
  onReopenAsProperty,
}: {
  contract: Contract;
  dday: number;
  severity: Severity;
  onEdit: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onSms: (target: ContactTarget) => void;
  onJumpCustomer?: () => void;        // 연결된 손님 점프
  onReopenAsProperty?: () => void;    // 매물로 되돌리기 (재모집)
}) {
  const cls = severityClasses(severity);
  const isClosed = c.status === "closed";

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${isClosed ? "bg-gray-50/60 border-gray-200 opacity-70" : cls.row}`}>
      <div className="flex items-start gap-3">
        {/* D-day 배지 */}
        <div className="flex-shrink-0">
          <div className={`inline-flex flex-col items-center justify-center min-w-[64px] px-2 py-1.5 rounded-xl border ${cls.badge} text-center`}>
            <div className="text-[10px] font-medium leading-tight">{severityLabel(severity)}</div>
            <div className="text-sm font-bold leading-tight">{dDayLabel(dday)}</div>
          </div>
        </div>

        {/* 메인 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{c.type}</span>
            <span className="text-sm font-semibold text-gray-900 break-all">{c.address}</span>
            {isClosed && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">종료</span>
            )}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            만기 <span className="font-medium text-gray-800">{c.endDate || "—"}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            보증금 <span className="font-medium text-gray-800">{c.deposit || "—"}{c.deposit && "만"}</span>
            {c.type === "월세" && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                월세 <span className="font-medium text-gray-800">{c.monthly || "—"}{c.monthly && "만"}</span>
              </>
            )}
          </div>

          {/* 연락처 */}
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <ContactLine
              label="임차인"
              name={c.tenantName}
              phone={c.tenantPhone}
              onSms={() => onSms("tenant")}
              disabled={isClosed}
            />
            <ContactLine
              label="임대인"
              name={c.landlordName}
              phone={c.landlordPhone}
              onSms={() => onSms("landlord")}
              disabled={isClosed}
            />
          </div>

          {c.memo && (
            <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1 border border-gray-100">
              💬 {c.memo}
            </div>
          )}
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        <button
          onClick={onEdit}
          className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          수정
        </button>
        {onJumpCustomer && (
          <button
            onClick={onJumpCustomer}
            title="연결된 손님 보기 (손님관리로 이동)"
            className="text-[11px] px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors"
          >
            👥 손님 보기
          </button>
        )}
        {onReopenAsProperty && !isClosed && (
          <button
            onClick={onReopenAsProperty}
            title="재모집 — 매물 관리로 되돌립니다 (계약 정보는 이력 보존)"
            className="text-[11px] px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 transition-colors"
          >
            🔄 매물로 되돌리기
          </button>
        )}
        {isClosed ? (
          <button
            onClick={onReopen}
            className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            진행중으로 복구
          </button>
        ) : (
          <button
            onClick={onClose}
            className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-orange-400 hover:text-orange-600 transition-colors"
          >
            종료
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600 transition-colors"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

/* ───────── 연락처 줄 ───────── */
function ContactLine({
  label,
  name,
  phone,
  onSms,
  disabled,
}: {
  label: string;
  name: string;
  phone: string;
  onSms: () => void;
  disabled?: boolean;
}) {
  const hasPhone = !!phone.replace(/\D/g, "");
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-gray-500 w-10 flex-shrink-0">{label}</span>
      <span className="text-gray-800 truncate">{name || "—"}</span>
      {hasPhone && (
        <>
          <a
            href={telUrl(phone)}
            className="text-blue-600 hover:underline whitespace-nowrap"
            aria-disabled={disabled}
          >
            📞 {formatPhone(phone)}
          </a>
          <button
            onClick={onSms}
            disabled={disabled || !hasPhone}
            className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            문자
          </button>
        </>
      )}
    </div>
  );
}

/* ───────── 빈 상태 ───────── */
function EmptyState({ isFirstUse, onAdd }: { isFirstUse: boolean; onAdd: () => void }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center">
      <div className="text-5xl mb-3">{isFirstUse ? "👋" : "🔍"}</div>
      <div className="text-base font-semibold text-gray-900 mb-1">
        {isFirstUse ? "아직 등록된 계약이 없습니다" : "조건에 맞는 계약이 없습니다"}
      </div>
      <div className="text-xs text-gray-500 mb-4">
        {isFirstUse
          ? "새 계약을 추가하면 만기일 기준으로 자동 분류됩니다"
          : "필터를 바꾸거나 검색어를 지워보세요"}
      </div>
      {isFirstUse && (
        <button
          onClick={onAdd}
          className="text-sm px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
        >
          + 첫 계약 추가
        </button>
      )}
    </div>
  );
}

/* ───────── 추가·수정 모달 ───────── */
function EditModal({
  contract,
  onClose,
  onSave,
}: {
  contract: Contract;
  onClose: () => void;
  onSave: (c: Contract) => Promise<void> | void;
}) {
  const [form, setForm] = useState<Contract>(contract);
  // 빈 계약(emptyContract)으로 생성된 항목은 createdAt이 0에 가까운 최근 시점이지만
  // 사실상 "기존 데이터에 같은 id가 있는지"는 부모가 알고 있으므로,
  // 단순히 contract.address 같은 필드가 비어있으면 신규로 간주
  const isNew = !contract.address;

  const setField = <K extends keyof Contract>(k: K, v: Contract[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const handleStartDate = (v: string) => {
    setForm(p => {
      const next = { ...p, startDate: v };
      if (!p.endDate && v) next.endDate = defaultEndDate(v, p.type === "전세" ? 2 : 1);
      return next;
    });
  };

  const handleType = (t: ContractType) => {
    setForm(p => {
      const next = { ...p, type: t };
      // 전세로 변경 시 월세 비움
      if (t === "전세") next.monthly = "";
      // 시작일 있고 만기일 비어있으면 자동
      if (p.startDate && !p.endDate) next.endDate = defaultEndDate(p.startDate, t === "전세" ? 2 : 1);
      return next;
    });
  };

  const [saving, setSaving] = useState(false);

  // 주소 자동완성
  const [addrSuggestions, setAddrSuggestions] = useState<{ name: string; address: string }[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const addrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAddressChange = (val: string) => {
    setField("address", val);
    if (addrTimerRef.current) clearTimeout(addrTimerRef.current);
    if (val.trim().length < 2) { setAddrSuggestions([]); return; }
    addrTimerRef.current = setTimeout(async () => {
      setAddrLoading(true);
      try {
        const res = await fetch(`/api/complex-search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        setAddrSuggestions(data.slice(0, 6));
      } catch { setAddrSuggestions([]); }
      finally { setAddrLoading(false); }
    }, 350);
  };

  const selectAddress = (item: { name: string; address: string }) => {
    setField("address", `${item.address} ${item.name}`.trim());
    setAddrSuggestions([]);
  };

  const save = async () => {
    if (!form.address.trim()) {
      alert("주소를 입력해주세요");
      return;
    }
    if (!form.endDate) {
      alert("만기일을 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...form, id: form.id || uid() });
    } catch (e) {
      console.error("계약 저장 오류:", e);
      alert("저장 중 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isNew ? "계약 추가" : "계약 수정"}>
      <div className="space-y-3">
        <Field label="주소" required>
          <div className="relative">
            <input
              value={form.address}
              onChange={e => handleAddressChange(e.target.value)}
              placeholder="단지명 또는 주소 검색 (예: 힐스테이트 미사역)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
            />
            {addrLoading && (
              <div className="absolute right-3 top-2.5 text-xs text-gray-400">검색 중…</div>
            )}
            {addrSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {addrSuggestions.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectAddress(item)}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b last:border-0 border-gray-100 transition-colors"
                  >
                    <div className="text-sm font-medium text-gray-800">{item.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.address}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">단지명 직접 입력 또는 아래에서 지역+유형으로 검색</p>
        </Field>

        {/* 지역+유형 단지 검색 */}
        <ComplexPickerWidget onSelect={item => setField("address", `${item.address} ${item.name}`.trim())} />

        <Field label="계약 종류">
          <div className="grid grid-cols-2 gap-1.5">
            {(["전세", "월세"] as ContractType[]).map(t => (
              <button
                key={t}
                onClick={() => handleType(t)}
                className={`py-2 rounded-xl text-xs font-medium border transition-colors ${
                  form.type === t
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="보증금 (만원)">
            <input
              type="text"
              inputMode="numeric"
              value={form.deposit}
              onChange={e => setField("deposit", e.target.value.replace(/\D/g, ""))}
              placeholder="29600"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          {form.type === "월세" && (
            <Field label="월세 (만원)">
              <input
                type="text"
                inputMode="numeric"
                value={form.monthly}
                onChange={e => setField("monthly", e.target.value.replace(/\D/g, ""))}
                placeholder="25"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="계약 시작일">
            <input
              type="date"
              value={form.startDate}
              onChange={e => handleStartDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <Field label="만기일" required>
            <input
              type="date"
              value={form.endDate}
              onChange={e => setField("endDate", e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="임차인 이름">
            <input
              value={form.tenantName}
              onChange={e => setField("tenantName", e.target.value)}
              placeholder="김철수"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <Field label="임차인 연락처">
            <input
              type="tel"
              value={form.tenantPhone}
              onChange={e => setField("tenantPhone", e.target.value)}
              placeholder="010-0000-0000"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="임대인 이름">
            <input
              value={form.landlordName}
              onChange={e => setField("landlordName", e.target.value)}
              placeholder="박영희"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <Field label="임대인 연락처">
            <input
              type="tel"
              value={form.landlordPhone}
              onChange={e => setField("landlordPhone", e.target.value)}
              placeholder="010-0000-0000"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
        </div>

        <Field label="메모 (선택)">
          <textarea
            value={form.memo}
            onChange={e => setField("memo", e.target.value)}
            placeholder="기억해야 할 특이사항"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </Field>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ───────── 문자 모달 ───────── */
function SmsModal({
  contract,
  target,
  onClose,
}: {
  contract: Contract;
  target: ContactTarget;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<NotifyStage>("4m");
  const [text, setText] = useState(() => buildSmsTemplate(contract, target, "4m"));
  const [savedMsg, setSavedMsg] = useState(false);
  const [copied, setCopied] = useState(false);

  const changeStage = (s: NotifyStage) => {
    setStage(s);
    setText(buildSmsTemplate(contract, target, s));
  };

  const phone = target === "tenant" ? contract.tenantPhone : contract.landlordPhone;
  const name = target === "tenant" ? contract.tenantName : contract.landlordName;
  const targetLabel = target === "tenant" ? "임차인" : "임대인";

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal onClose={onClose} title="문자 보내기">
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-gray-700">
          <div><span className="text-gray-500">받는 사람:</span> <span className="font-semibold">{targetLabel} {name || "—"}</span></div>
          <div><span className="text-gray-500">번호:</span> {formatPhone(phone) || "—"}</div>
          <div><span className="text-gray-500">매물:</span> {contract.address}</div>
        </div>

        <Field label="시점">
          <div className="grid grid-cols-3 gap-1.5">
            {(["4m", "3m", "2m"] as NotifyStage[]).map(s => (
              <button
                key={s}
                onClick={() => changeStage(s)}
                className={`py-2 rounded-xl text-xs font-medium border transition-colors ${
                  stage === s
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"
                }`}
              >
                {s === "4m" ? "4개월 전" : s === "3m" ? "3개월 전" : "2개월 전"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="미리보기 (수정 가능)">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
          />
        </Field>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // 현재 텍스트에서 주소·만기일을 플레이스홀더로 바꿔 저장
              const tpl = text
                .replace(new RegExp(contract.address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "{주소}")
                .replace(new RegExp(contract.endDate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "{만기일}");
              saveCustomSmsTemplate(stage, target, tpl);
              setSavedMsg(true);
              setTimeout(() => setSavedMsg(false), 2000);
            }}
            className="text-[11px] px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            {savedMsg ? "✓ 저장됨" : "💾 이 문구를 기본값으로 저장"}
          </button>
          <span className="text-[10px] text-gray-400">({target === "tenant" ? "임차인" : "임대인"} {stage === "4m" ? "4개월" : stage === "3m" ? "3개월" : "2개월"} 전 기본값)</span>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          💡 폰에서 [문자 보내기] 클릭 시 문자앱이 열립니다 (번호·문구 자동 입력) — 최종 확인 후 직접 전송하세요.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
          >
            닫기
          </button>
          <button
            onClick={copy}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            {copied ? "✓ 복사됨" : "복사"}
          </button>
          <a
            href={smsUrl(phone, text)}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors text-center"
          >
            문자 보내기
          </a>
        </div>
      </div>
    </Modal>
  );
}

/* ───────── 공통 모달 ───────── */
function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ───────── 지역+유형 단지 검색 ───────── */
const BUILDING_TYPES = ["아파트", "오피스텔", "빌라", "원룸/투룸", "상가", "사무실"];

const REGION_DATA: Record<string, Record<string, string[]>> = {
  "경기도": {
    "하남시": ["미사강변동", "망월동", "풍산동", "덕풍동", "창우동", "신장동", "감북동", "초일동"],
    "성남시 분당구": ["정자동", "서현동", "야탑동", "판교동", "삼평동"],
    "성남시 수정구": ["수진동", "신흥동", "태평동"],
    "광주시": ["오포읍", "곤지암읍", "초월읍"],
  },
  "서울특별시": {
    "강동구": ["천호동", "길동", "성내동", "암사동", "고덕동"],
    "송파구": ["잠실동", "가락동", "문정동", "방이동"],
    "강남구": ["역삼동", "삼성동", "대치동", "개포동"],
  },
  "인천광역시": {
    "서구": ["검단동", "당하동", "마전동"],
    "연수구": ["송도동", "연수동", "청학동"],
  },
};

function ComplexPicker({ onSelect }: { onSelect: (addr: string) => void }) {
  const [open, setOpen] = useState(false);
  const [sido, setSido] = useState("경기도");
  const [sigungu, setSigungu] = useState("하남시");
  const [dong, setDong] = useState("");
  const [buildingType, setBuildingType] = useState("");
  const [results, setResults] = useState<{ name: string; address: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const sigunguList = Object.keys(REGION_DATA[sido] ?? {});
  const dongList = REGION_DATA[sido]?.[sigungu] ?? [];

  const search = async () => {
    const location = [sido, sigungu, dong].filter(Boolean).join(" ");
    if (!location || !buildingType) return;
    setLoading(true);
    setResults([]);
    try {
      const q = `${location} ${buildingType}`;
      const res = await fetch(`/api/complex-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.slice(0, 12));
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  const pick = (item: { name: string; address: string }) => {
    onSelect(`${item.address} ${item.name}`.trim());
    setOpen(false);
    setResults([]);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-2 rounded-xl border border-dashed border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
      >
        🔍 시/도·시/군/구·동 선택으로 단지 검색
      </button>
    );
  }

  return (
    <div className="border border-blue-200 rounded-2xl p-3 bg-blue-50/40 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-700">🔍 단지 검색</span>
        <button type="button" onClick={() => { setOpen(false); setResults([]); }} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
      </div>

      {/* 시/도 → 시/군/구 → 읍/면/동 */}
      <div className="grid grid-cols-3 gap-1.5">
        <select
          value={sido}
          onChange={e => { setSido(e.target.value); setSigungu(""); setDong(""); setResults([]); }}
          className="border border-gray-200 rounded-xl px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.keys(REGION_DATA).map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={sigungu}
          onChange={e => { setSigungu(e.target.value); setDong(""); setResults([]); }}
          className="border border-gray-200 rounded-xl px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">시/군/구</option>
          {sigunguList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={dong}
          onChange={e => { setDong(e.target.value); setResults([]); }}
          className="border border-gray-200 rounded-xl px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">읍/면/동</option>
          {dongList.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* 건물 유형 */}
      <div className="grid grid-cols-3 gap-1.5">
        {BUILDING_TYPES.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setBuildingType(t); setResults([]); }}
            className={`py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              buildingType === t
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={search}
        disabled={loading || !sigungu || !buildingType}
        className="w-full py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "검색 중…" : "단지 목록 조회"}
      </button>

      {/* 결과 목록 */}
      {results.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto">
          {results.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(item)}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b last:border-0 border-gray-100 transition-colors"
            >
              <div className="text-sm font-medium text-gray-800">{item.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.address}</div>
            </button>
          ))}
        </div>
      )}
      {!loading && results.length === 0 && sigungu && buildingType && (
        <p className="text-xs text-gray-400 text-center py-1">검색 버튼을 눌러 단지를 조회하세요</p>
      )}
    </div>
  );
}

/* ───────── 문자 문구 설정 모달 ───────── */
function SmsTemplateSettingsModal({ onClose }: { onClose: () => void }) {
  const STAGES: NotifyStage[] = ["4m", "3m", "2m"];
  const STAGE_LABELS: Record<NotifyStage, string> = { "4m": "4개월 전", "3m": "3개월 전", "2m": "2개월 전" };
  const TARGETS: ContactTarget[] = ["tenant", "landlord"];
  const TARGET_LABELS: Record<ContactTarget, string> = { tenant: "임차인", landlord: "임대인" };

  const [templates, setTemplates] = useState<Record<string, string>>(() => {
    const saved = loadCustomSmsTemplates();
    const merged: Record<string, string> = {};
    for (const s of STAGES) {
      for (const t of TARGETS) {
        const key = `${s}_${t}`;
        merged[key] = saved[key] ?? DEFAULT_SMS_TEMPLATES[key] ?? "";
      }
    }
    return merged;
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    for (const s of STAGES) {
      for (const t of TARGETS) {
        const key = `${s}_${t}`;
        saveCustomSmsTemplate(s, t, templates[key]);
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = (s: NotifyStage, t: ContactTarget) => {
    const key = `${s}_${t}`;
    resetCustomSmsTemplate(s, t);
    setTemplates(prev => ({ ...prev, [key]: DEFAULT_SMS_TEMPLATES[key] ?? "" }));
  };

  return (
    <Modal onClose={onClose} title="📝 문자 문구 설정">
      <div className="space-y-4">
        <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 leading-relaxed">
          💡 <span className="font-medium text-blue-700">{"{주소}"}</span>와 <span className="font-medium text-blue-700">{"{만기일}"}</span>은 문자 보낼 때 자동으로 실제 값으로 바뀝니다.
        </div>

        {STAGES.map(s => (
          <div key={s} className="border border-gray-200 rounded-2xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-700 border-b border-gray-200">
              📅 {STAGE_LABELS[s]}
            </div>
            {TARGETS.map(t => (
              <div key={t} className="px-4 py-3 border-b last:border-0 border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-700">{TARGET_LABELS[t]}</span>
                  <button
                    onClick={() => handleReset(s, t)}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors"
                  >
                    기본값으로 초기화
                  </button>
                </div>
                <textarea
                  value={templates[`${s}_${t}`]}
                  onChange={e => setTemplates(prev => ({ ...prev, [`${s}_${t}`]: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed resize-none"
                />
              </div>
            ))}
          </div>
        ))}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors">
            닫기
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            {saved ? "✓ 저장됨" : "전체 저장"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
