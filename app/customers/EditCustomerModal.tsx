"use client";

import KoreanDatePicker from "@/app/KoreanDatePicker";
import { useState, useEffect, useMemo } from "react";
import {
  Customer,
  DealKind,
  CustomerStatus,
  ShownProperty,
  DEAL_KIND_LABELS,
  STATUS_LABELS,
  composeBudget,
} from "./customer-types";
import { subscribeMyComplexes, type Property, type MyComplex } from "@/lib/properties-db";
import { useAuth } from "@/lib/auth-context";
import { PROPERTY_TYPES, DEAL_TYPES } from "@/app/properties/helpers";
import DatedMemo from "@/app/components/DatedMemo";

interface Props {
  customer: Customer;
  properties?: Property[];   // 내 매물장 — 보여드린 매물에서 검색 가능
  onClose: () => void;
  onSave: (c: Customer) => Promise<void> | void;
  existing?: Customer[];   // 이미 등록된 고객 — 같은 이름·전화번호 안내용
}

export default function EditCustomerModal({ customer, properties = [], onClose, onSave, existing = [] }: Props) {
  const [form, setForm] = useState<Customer>(customer);
  const [saving, setSaving] = useState(false);
  const isNew = !customer.name;
  const { user } = useAuth();
  const [myComplexes, setMyComplexes] = useState<MyComplex[]>([]);
  useEffect(() => {
    if (!user?.agencyId) return;
    return subscribeMyComplexes(user.agencyId, setMyComplexes);
  }, [user?.agencyId]);

  // 관심 단지: 쉼표로 구분된 글자에 단지 이름을 넣고 빼기
  const areaList = (form.preferredArea || "").split(",").map(x => x.trim()).filter(Boolean);
  const toggleComplex = (name: string) =>
    setField("preferredArea", (areaList.includes(name) ? areaList.filter(x => x !== name) : [...areaList, name]).join(", "));
  const wanted = form.wantedTypes ?? [];
  const shownComplexes = myComplexes.filter(c => wanted.length === 0 || wanted.includes(c.propertyType)).sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const setField = <K extends keyof Customer>(k: K, v: Customer[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const toggleIn = (k: "wantedTypes" | "wantedDeals", v: string) =>
    setForm(p => {
      const cur = p[k] ?? [];
      return { ...p, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] };
    });

  const addShown = () => {
    const today = new Date().toISOString().slice(0, 10);
    setForm(p => ({
      ...p,
      shownProperties: [...p.shownProperties, { address: "", shownAt: today, reaction: "", note: "" }],
    }));
  };

  const updateShown = (idx: number, patch: Partial<ShownProperty>) => {
    setForm(p => ({
      ...p,
      shownProperties: p.shownProperties.map((s, i) => i === idx ? { ...s, ...patch } : s),
    }));
  };

  const removeShown = (idx: number) => {
    setForm(p => ({
      ...p,
      shownProperties: p.shownProperties.filter((_, i) => i !== idx),
    }));
  };

  const digits = (v: string) => (v || "").replace(/\D/g, "");
  const phoneDigits = digits(form.phone);
  const isDuplicate = !!phoneDigits && !!form.name.trim() &&
    existing.some(c => c.id !== form.id && (c.name || "").trim() === form.name.trim() && digits(c.phone) === phoneDigits);

  const save = async () => {
    if (!form.name.trim()) {
      alert("이름을 입력해주세요");
      return;
    }
    if (isDuplicate) {
      alert("이미 등록된 고객이에요.\n같은 이름, 같은 전화번호의 고객이 있어요.");
      return;
    }
    setSaving(true);
    try {
      const hasRange = [form.saleMin, form.saleMax, form.depositMin, form.depositMax, form.rentMin, form.rentMax].some(v => (v || "").trim());
      await onSave(hasRange ? { ...form, budget: composeBudget(form) } : form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isNew ? "매수자 추가" : "매수자 수정"}>
      <div className="space-y-3">
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="이름" required>
            <input
              value={form.name}
              onChange={e => setField("name", e.target.value)}
              placeholder="예: 이지영"
              className={fieldCls}
              autoFocus
            />
          </Field>
          <Field label="연락처">
            <input
              type="tel"
              value={form.phone}
              onChange={e => setField("phone", e.target.value)}
              placeholder="010-0000-0000"
              className={fieldCls}
            />
          </Field>
        </div>
        {isDuplicate && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-semibold px-3 py-2">
            ⚠️ 이미 등록된 고객이에요 (같은 이름, 같은 전화번호)
          </div>
        )}

        <Field label="구분 (여러 개 선택 가능)">
          <div className="flex flex-col gap-1.5">
            {[["wantedTypes", PROPERTY_TYPES], ["wantedDeals", DEAL_TYPES]].map(([k, list]) => {
              const key = k as "wantedTypes" | "wantedDeals";
              const cur = form[key] ?? [];
              return (
                <div key={key} className="flex flex-wrap gap-1.5 w-full">
                  {(list as string[]).map(t => {
                    const sel = cur.includes(t);
                    return (
                      <button key={t} type="button" onClick={() => toggleIn(key, t)}
                        className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors ${sel ? "bg-sky-400 border-sky-400 text-white" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {shownComplexes.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1">
                내 단지 목록{wanted.length > 0 ? ` (${wanted.join("·")})` : ""} — 가나다 순, 위아래로 밀어서 보고 눌러서 고르세요
              </div>
              <div className="flex flex-col gap-1.5 overflow-y-auto max-h-56 rounded-xl border border-teal-200 bg-teal-50/40 p-1.5">
                {shownComplexes.map(c => {
                  const sel = areaList.includes(c.name);
                  return (
                    <button key={c.propertyType + c.name} type="button" onClick={() => toggleComplex(c.name)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors break-keep ${sel ? "bg-sky-400 border-sky-400 text-white font-semibold" : "bg-white text-gray-700 border-teal-200"}`}>
                      {sel ? "✓ " : ""}{c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Field>

        <Field label="목적">
          <select value={form.dealKind} onChange={e => setField("dealKind", e.target.value as DealKind)} className={fieldCls}>
            {(Object.keys(DEAL_KIND_LABELS) as DealKind[]).map(s => (
              <option key={s} value={s}>{DEAL_KIND_LABELS[s]}</option>
            ))}
          </select>
        </Field>

        {/* VIP 토글 */}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.vip}
            onChange={e => setField("vip", e.target.checked)}
            className="w-4 h-4 accent-purple-600"
          />
          <span className="font-medium text-gray-700">⭐ VIP 고객</span>
          <span className="text-[11px] text-gray-400">(수수료 큰 매물 / 우선 응대)</span>
        </label>

        <Field label="예산 (만원 단위, 숫자만)">
          {form.budget && ![form.saleMin, form.saleMax, form.depositMin, form.depositMax, form.rentMin, form.rentMax].some(Boolean) && (
            <div className="text-xs text-gray-500 mb-1.5">기존 예산: <span className="font-semibold">{form.budget}</span> (아래에 넣으면 바뀌어요)</div>
          )}
          <div className="space-y-2">
            {([
              ["매매", "saleMin", "saleMax"],
              ["보증금", "depositMin", "depositMax"],
              ["월세", "rentMin", "rentMax"],
            ] as const).map(([label, kMin, kMax]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="w-12 shrink-0 text-sm font-semibold text-gray-600 whitespace-nowrap">{label}</span>
                <input inputMode="numeric" value={form[kMin] || ""} onChange={e => setField(kMin, e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="최소" className={`${fieldCls} min-w-0 text-right`} />
                <span className="text-xs text-gray-500 whitespace-nowrap">만원~</span>
                <input inputMode="numeric" value={form[kMax] || ""} onChange={e => setField(kMax, e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="최대" className={`${fieldCls} min-w-0 text-right`} />
                <span className="text-xs text-gray-500 whitespace-nowrap">만원</span>
              </div>
            ))}
          </div>
        </Field>

        <Field label="관심 지역·단지">
          <input
            value={form.preferredArea}
            onChange={e => setField("preferredArea", e.target.value)}
            placeholder="예: 미사강변동, 미사역 인근"
            className={fieldCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="입주 가능일">
            <KoreanDatePicker value={form.moveInDate} onChange={v => setField("moveInDate", v)} accent="blue" />
            {form.moveInDate && (
              <button type="button" onClick={() => setField("moveInDate", "")}
                className="whitespace-nowrap mt-1 text-xs text-red-600 hover:underline">
                지우기
              </button>
            )}
          </Field>
          <Field label="다음 후속 연락">
            <KoreanDatePicker value={form.nextFollowUp} onChange={v => setField("nextFollowUp", v)} accent="blue" />
            {form.nextFollowUp && (
              <button type="button" onClick={() => setField("nextFollowUp", "")}
                className="whitespace-nowrap mt-1 text-xs text-red-600 hover:underline">
                지우기
              </button>
            )}
          </Field>
        </div>

        <Field label="상태">
          <select value={form.status} onChange={e => setField("status", e.target.value as CustomerStatus)} className={fieldCls}>
            {(Object.keys(STATUS_LABELS) as CustomerStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>

        {form.status === "matched" && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-2">
            <div className="text-sm font-medium text-sky-800">🚪 방문 일정</div>
            <div className="grid grid-cols-2 gap-2">
              <KoreanDatePicker value={form.visitDate ?? ""} onChange={v => setField("visitDate", v)} accent="blue" />
              <input type="time" value={form.visitTime ?? ""} onChange={e => setField("visitTime", e.target.value)} className={fieldCls} />
            </div>
            <input value={form.visitAddress ?? ""} onChange={e => setField("visitAddress", e.target.value)}
              placeholder="방문할 매물 주소 (선택)" className={fieldCls} list="visit-address-list" />
            <datalist id="visit-address-list">
              {properties.filter(p => p.status === "active").slice(0, 100).map(p => <option key={p.id} value={p.address} />)}
            </datalist>
            <div>
              <div className="text-xs text-gray-600 mb-1">방문 결과</div>
              <div className="flex gap-1.5">
                {([["positive", "👍 좋아함"], ["neutral", "😐 보통"], ["negative", "👎 별로"]] as const).map(([k, label]) => {
                  const sel = form.visitResult === k;
                  return (
                    <button key={k} type="button" onClick={() => setField("visitResult", sel ? "" : k)}
                      className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors ${sel ? "bg-sky-400 border-sky-400 text-white" : "bg-white text-sky-700 border-sky-200"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-gray-500">저장하면 스케줄의 방문 일정에도 같이 들어가요</p>
          </div>
        )}

        {/* 매물 매칭 이력 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">보여드린 매물 ({form.shownProperties.length})</label>
            <button
              onClick={addShown}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + 추가
            </button>
          </div>
          {form.shownProperties.length === 0 ? (
            <div className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2 border border-dashed border-gray-200">
              아직 보여드린 매물이 없습니다. &quot;+ 추가&quot;로 매칭 이력을 기록하세요.
            </div>
          ) : (
            <div className="space-y-2">
              {form.shownProperties.map((s, idx) => (
                <ShownPropertyRow
                  key={idx}
                  shown={s}
                  properties={properties}
                  onChange={(patch) => updateShown(idx, patch)}
                  onRemove={() => removeShown(idx)}
                />
              ))}
            </div>
          )}
        </div>

        <Field label="메모 (엔터 = 다음 줄 + 오늘 날짜 자동)">
          <DatedMemo
            value={form.memo}
            onChange={v => setField("memo", v)}
            placeholder="기억해야 할 특이사항 (예: 주말 임장 선호, 1층 NO)"
            rows={3}
            className={fieldCls + " resize-y"}
          />
        </Field>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors">
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

/* ── 보여드린 매물 한 행 — 내 매물장 자동완성 검색 ── */
function ShownPropertyRow({
  shown: s, properties, onChange, onRemove,
}: {
  shown: ShownProperty;
  properties: Property[];
  onChange: (patch: Partial<ShownProperty>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [dealFilter, setDealFilter] = useState("");

  const typeOptions = useMemo(() => {
    const seen = new Set<string>(PROPERTY_TYPES);
    properties.forEach(p => { if (p.status === "active" && p.propertyType) seen.add(p.propertyType); });
    return Array.from(seen);
  }, [properties]);

  const suggestions = useMemo(() => {
    const base = properties.filter(p => p.status === "active" && (!typeFilter || p.propertyType === typeFilter) && (!dealFilter || p.dealType === dealFilter));
    const limit = typeFilter || dealFilter ? 30 : 6;
    if (!s.address.trim()) return base.slice(0, limit);
    const q = s.address.toLowerCase();
    return base.filter(p => p.address.toLowerCase().includes(q)).slice(0, 30);
  }, [s.address, properties, typeFilter, dealFilter]);

  const select = (p: Property) => {
    onChange({ address: p.address });
    setOpen(false);
  };

  return (
    <div className="border border-gray-200 rounded-xl p-2.5 space-y-1.5 bg-gray-50/50 relative">
      {properties.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["", ...typeOptions].map(t => (
            <button key={t || "all"} type="button"
              onClick={() => { setTypeFilter(t); setOpen(true); }}
              className={`shrink-0 whitespace-nowrap px-2.5 py-0.5 rounded-full text-[11px] border transition-colors ${typeFilter === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
              {t || "전체"}
            </button>
          ))}
        </div>
      )}
      {properties.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["", "매매", "전세", "월세"].map(t => (
            <button key={t || "all"} type="button"
              onClick={() => { setDealFilter(t); setOpen(true); }}
              className={`shrink-0 whitespace-nowrap px-2.5 py-0.5 rounded-full text-[11px] border transition-colors ${dealFilter === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
              {t || "전체"}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <div className="flex-1 relative">
          <input
            value={s.address}
            onChange={e => { onChange({ address: e.target.value }); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder="매물 주소 — 내 매물장에서 검색 또는 직접 입력"
            className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {open && suggestions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto">
              <div className="px-2 py-1 bg-blue-50 text-[10px] text-blue-700 font-medium border-b border-blue-100">
                🏘️ 내 매물장에서 선택
              </div>
              {suggestions.map(p => (
                <button
                  key={p.id} type="button"
                  onMouseDown={e => { e.preventDefault(); select(p); }}
                  className="w-full text-left px-2 py-1.5 hover:bg-blue-50 border-b last:border-0 border-gray-100 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">{p.dealType}</span>
                    <span className="font-medium text-gray-800 truncate">{p.address}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5 truncate">{p.propertyType}{p.price ? ` · ${p.price}만` : ""}{p.ownerName ? ` · 집주인 ${p.ownerName}` : ""}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          className="text-[11px] px-2 rounded-lg border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600 transition-colors"
          title="삭제"
        >
          ✕
        </button>
      </div>
      <div className="flex gap-1.5">
        <input
          type="date"
          value={s.shownAt}
          onChange={e => onChange({ shownAt: e.target.value })}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={s.reaction}
          onChange={e => onChange({ reaction: e.target.value as ShownProperty["reaction"] })}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">반응 선택</option>
          <option value="positive">👍 좋아함</option>
          <option value="neutral">😐 보통</option>
          <option value="negative">👎 별로</option>
        </select>
      </div>
      <textarea
        value={s.note}
        onChange={e => onChange({ note: e.target.value })}
        placeholder="메모 (선택) — 엔터로 줄바꿈"
        rows={2}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />
    </div>
  );
}

const fieldCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500";

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

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[calc(100dvh-5rem)] sm:max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-2xl">
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
