"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Contract,
  ContractType,
  ContactTarget,
  NotifyStage,
  Severity,
  loadContracts,
  saveContracts,
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
} from "./contracts";

type FilterKey = "all" | Severity;

export default function ExpiryPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState<Contract | null>(null);
  const [smsTarget, setSmsTarget] = useState<{ contract: Contract; target: ContactTarget } | null>(null);

  /* ── 데이터 로드 ── */
  useEffect(() => {
    setContracts(loadContracts());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveContracts(contracts);
  }, [contracts, loaded]);

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

  /* ── CRUD ── */
  const upsertContract = (c: Contract) => {
    setContracts(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      if (idx === -1) return [...prev, c];
      const next = [...prev];
      next[idx] = c;
      return next;
    });
  };

  const closeContract = (id: string) => {
    if (!confirm("이 계약을 '종료' 상태로 변경할까요? (삭제는 아니며 종료된 계약 보기에서 확인 가능합니다)")) return;
    setContracts(prev => prev.map(c => (c.id === id ? { ...c, status: "closed" as const } : c)));
  };

  const reopenContract = (id: string) => {
    setContracts(prev => prev.map(c => (c.id === id ? { ...c, status: "active" as const } : c)));
  };

  const deleteContract = (id: string) => {
    if (!confirm("이 계약을 영구 삭제할까요? 되돌릴 수 없습니다.")) return;
    setContracts(prev => prev.filter(c => c.id !== id));
  };

  const loadSampleData = () => {
    if (contracts.length > 0) {
      if (!confirm("기존 계약 데이터가 있습니다. 예시 데이터를 추가할까요? (기존 데이터는 유지됩니다)")) return;
    }
    setContracts(prev => [...prev, ...sampleContracts()]);
  };

  const clearAllData = () => {
    if (!confirm("⚠️ 모든 계약 데이터를 삭제합니다. 정말 진행할까요?")) return;
    setContracts([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            ⏰ 만기 관리
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">임대차 계약 만기 알림 보드</h1>
          <p className="text-gray-500 text-xs sm:text-sm mb-3">
            만기 3개월 / 2개월 전 자동 분류 — 임차인·임대인에게 바로 연락
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href="/"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              ← 매물 도우미
            </Link>
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
              disabled
              title="한방 엑셀 파일 받으면 컬럼 매핑 추가 예정"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-200 text-gray-400 cursor-not-allowed"
            >
              📥 한방 엑셀 업로드 (준비중)
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
          <SummaryCard label="위험 D-30 이내" count={counts.danger} severity="danger" />
          <SummaryCard label="주의 D-60 이내" count={counts.warning} severity="warning" />
          <SummaryCard label="예고 D-90 이내" count={counts.caution} severity="caution" />
          <SummaryCard label="안전 D-90 초과" count={counts.safe} severity="safe" />
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
              />
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6 leading-relaxed">
          💡 localStorage에 저장 — 이 기기에서만 보관됩니다. 폰 변경 시 데이터 이전 필요.
        </p>
      </div>

      {/* 추가/수정 모달 */}
      {editing && (
        <EditModal
          contract={editing}
          onClose={() => setEditing(null)}
          onSave={c => {
            upsertContract(c);
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
}: {
  contract: Contract;
  dday: number;
  severity: Severity;
  onEdit: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onSms: (target: ContactTarget) => void;
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
  onSave: (c: Contract) => void;
}) {
  const [form, setForm] = useState<Contract>(contract);
  const isNew = !contract.id || !loadContracts().find(c => c.id === contract.id);

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

  const save = () => {
    if (!form.address.trim()) {
      alert("주소를 입력해주세요");
      return;
    }
    if (!form.endDate) {
      alert("만기일을 입력해주세요");
      return;
    }
    onSave({ ...form, id: form.id || uid() });
  };

  return (
    <Modal onClose={onClose} title={isNew ? "계약 추가" : "계약 수정"}>
      <div className="space-y-3">
        <Field label="주소" required>
          <input
            value={form.address}
            onChange={e => setField("address", e.target.value)}
            placeholder="예: 미사강변동 1100 힐스테이트 101동 1902호"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Field>

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
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            저장
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
  const [stage, setStage] = useState<NotifyStage>("3m");
  const [text, setText] = useState(() => buildSmsTemplate(contract, target, "3m"));
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
            {(["3m", "2m", "1m"] as NotifyStage[]).map(s => (
              <button
                key={s}
                onClick={() => changeStage(s)}
                className={`py-2 rounded-xl text-xs font-medium border transition-colors ${
                  stage === s
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"
                }`}
              >
                {s === "3m" ? "3개월 전" : s === "2m" ? "2개월 전" : "1개월 전"}
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
