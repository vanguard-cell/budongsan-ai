"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeCustomers,
  saveCustomer as fsSaveCustomer,
  deleteCustomer as fsDeleteCustomer,
  saveCustomersBatch,
} from "@/lib/customers-db";
import {
  Customer,
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
  const { user, loading: authLoading, signOut } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  /* 로그인 가드 */
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/customers");
  }, [authLoading, user, router]);

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
        // 진행중인데 후속 연락 필요한 것 먼저
        if (a.c.status !== b.c.status) {
          const order: Record<string, number> = { active: 0, matched: 1, lost: 2, closed: 3 };
          return (order[a.c.status] ?? 9) - (order[b.c.status] ?? 9);
        }
        return a.d - b.d;
      });
  }, [customers, filter, query]);

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
    await fsSaveCustomer(user.agencyId, c);
  };

  const remove = async (id: string) => {
    if (!user) return;
    if (!confirm("이 손님을 영구 삭제할까요? 되돌릴 수 없습니다.")) return;
    await fsDeleteCustomer(user.agencyId, id);
  };

  const changeStatus = async (c: Customer, status: Customer["status"]) => {
    if (!user) return;
    await fsSaveCustomer(user.agencyId, { ...c, status });
  };

  const loadSamples = async () => {
    if (!user) return;
    if (customers.length > 0) {
      if (!confirm("기존 손님 데이터가 있습니다. 예시 데이터를 추가할까요?")) return;
    }
    await saveCustomersBatch(user.agencyId, sampleCustomers());
  };

  const clearAll = async () => {
    if (!user) return;
    if (!confirm("⚠️ 모든 손님 데이터를 삭제합니다. 정말 진행할까요?")) return;
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* 사용자 바 */}
        <div className="flex items-center justify-end gap-2 mb-3 text-[11px] text-gray-500">
          <NotifyBell contracts={contracts} customers={customers} />
          <span className="text-gray-300">·</span>
          <span>👤 {user.displayName || user.email}</span>
          <span className="text-gray-300">·</span>
          <button onClick={() => { if (confirm("로그아웃 하시겠어요?")) signOut(); }} className="hover:text-blue-600 hover:underline">
            로그아웃
          </button>
        </div>

        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            👥 손님 관리
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">손님 사후관리 보드</h1>
          <p className="text-gray-500 text-xs sm:text-sm mb-3">
            예산·관심지역·매물 매칭 이력 관리 + 후속 연락 자동 알림
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link href="/" className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors">
              ← 매물 도우미
            </Link>
            <Link href="/expiry" className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors">
              ⏰ 만기 관리
            </Link>
            <button
              onClick={() => setEditing(emptyCustomer())}
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
            >
              + 손님 추가
            </button>
            <button
              onClick={loadSamples}
              title="예시 손님 5건 추가"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              🧪 예시 데이터
            </button>
            <button
              onClick={() => setShowUpload(true)}
              title="엑셀에서 손님 명단 일괄 업로드"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              📥 엑셀 업로드
            </button>
            <button
              onClick={() => setShowExport(true)}
              title="손님 명단을 엑셀로 다운로드 — 백업·세무사 전달 등"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              📤 내보내기
            </button>
            {customers.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors"
              >
                🗑️ 전체 삭제
              </button>
            )}
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
          <SummaryCard label="후속 연락 필요" count={counts.needFollowup} accent="red" />
          <SummaryCard label="진행 중" count={counts.all} accent="blue" />
          <SummaryCard label="VIP" count={counts.vip} accent="purple" />
          <SummaryCard label="거래 완료" count={counts.closed} accent="gray" />
        </div>

        {/* 필터 / 검색 */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-3 sm:p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>전체 ({counts.all})</FilterChip>
            <FilterChip active={filter === "needFollowup"} onClick={() => setFilter("needFollowup")}>🔔 후속 연락 ({counts.needFollowup})</FilterChip>
            <FilterChip active={filter === "vip"} onClick={() => setFilter("vip")}>⭐ VIP ({counts.vip})</FilterChip>
            <FilterChip active={filter === "matched"} onClick={() => setFilter("matched")}>매칭 ({counts.matched})</FilterChip>
            <FilterChip active={filter === "lost"} onClick={() => setFilter("lost")}>이탈 ({counts.lost})</FilterChip>
            <FilterChip active={filter === "closed"} onClick={() => setFilter("closed")}>완료 ({counts.closed})</FilterChip>
          </div>
          <input
            type="text"
            placeholder="🔍 이름 · 연락처 · 지역 · 메모 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 목록 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <EmptyState isFirstUse={customers.length === 0} onAdd={() => setEditing(emptyCustomer())} />
        ) : (
          <div className="space-y-2.5">
            {filtered.map(({ c, d, s }) => (
              <CustomerRow
                key={c.id}
                customer={c}
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

      {editing && (
        <EditCustomerModal
          customer={editing}
          properties={properties}
          onClose={() => setEditing(null)}
          onSave={async (c) => { await upsert({ ...c, id: c.id || uid() }); setEditing(null); }}
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

/* ───── 손님 행 ───── */
function CustomerRow({
  customer: c, dday, severity,
  onEdit, onDelete, onChangeStatus,
}: {
  customer: Customer;
  dday: number;
  severity: FollowUpSeverity;
  onEdit: () => void;
  onDelete: () => void;
  onChangeStatus: (s: Customer["status"]) => void;
}) {
  const cls = followUpClasses(severity);
  const isInactive = c.status === "lost" || c.status === "closed";

  const buildSmsBody = () => {
    const greeting = `안녕하세요, 미사금빛공인중개사입니다.`;
    const follow = c.nextFollowUp
      ? `${c.preferredArea ? c.preferredArea + " 관련 " : ""}새 매물 찾아보았는데 연락 가능하실까요?`
      : "연락 가능하실 때 알려주세요.";
    return `${greeting}\n${follow}`;
  };

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${isInactive ? "bg-gray-50/60 border-gray-200 opacity-70" : cls.row}`}>
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
              <div>🏠 보여드린 매물 <span className="font-semibold text-blue-600">{c.shownProperties.length}건</span></div>
            )}
          </div>

          {/* 연락처 */}
          {c.phone && (
            <div className="flex items-center gap-2 mt-2 text-xs">
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

      {/* 액션 */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        <button onClick={onEdit} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
          수정
        </button>
        {c.status === "active" && (
          <>
            <button onClick={() => onChangeStatus("matched")} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-600 transition-colors">
              매칭으로
            </button>
            <button onClick={() => onChangeStatus("closed")} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
              거래 완료
            </button>
            <button onClick={() => onChangeStatus("lost")} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 transition-colors">
              이탈
            </button>
          </>
        )}
        {c.status === "matched" && (
          <button onClick={() => onChangeStatus("closed")} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
            거래 완료
          </button>
        )}
        {(c.status === "lost" || c.status === "closed") && (
          <button onClick={() => onChangeStatus("active")} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
            다시 진행 중으로
          </button>
        )}
        <button onClick={onDelete} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600 transition-colors ml-auto">
          삭제
        </button>
      </div>
    </div>
  );
}

function EmptyState({ isFirstUse, onAdd }: { isFirstUse: boolean; onAdd: () => void }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center">
      <div className="text-5xl mb-3">{isFirstUse ? "👋" : "🔍"}</div>
      <div className="text-base font-semibold text-gray-900 mb-1">
        {isFirstUse ? "아직 등록된 손님이 없습니다" : "조건에 맞는 손님이 없습니다"}
      </div>
      <div className="text-xs text-gray-500 mb-4">
        {isFirstUse
          ? "새 손님을 추가하면 후속 연락 일정을 자동 관리해드립니다"
          : "필터를 바꾸거나 검색어를 지워보세요"}
      </div>
      {isFirstUse && (
        <button
          onClick={onAdd}
          className="text-sm px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
        >
          + 첫 손님 추가
        </button>
      )}
    </div>
  );
}
