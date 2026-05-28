"use client";

import { useState, useEffect } from "react";
import {
  Customer,
  CustomerSide,
  DealKind,
  CustomerStatus,
  ShownProperty,
  SIDE_LABELS,
  DEAL_KIND_LABELS,
  STATUS_LABELS,
} from "./customer-types";

interface Props {
  customer: Customer;
  onClose: () => void;
  onSave: (c: Customer) => Promise<void> | void;
}

export default function EditCustomerModal({ customer, onClose, onSave }: Props) {
  const [form, setForm] = useState<Customer>(customer);
  const [saving, setSaving] = useState(false);
  const isNew = !customer.name;

  const setField = <K extends keyof Customer>(k: K, v: Customer[K]) =>
    setForm(p => ({ ...p, [k]: v }));

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

  const save = async () => {
    if (!form.name.trim()) {
      alert("이름을 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isNew ? "손님 추가" : "손님 수정"}>
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="구분">
            <select value={form.side} onChange={e => setField("side", e.target.value as CustomerSide)} className={fieldCls}>
              {(Object.keys(SIDE_LABELS) as CustomerSide[]).map(s => (
                <option key={s} value={s}>{SIDE_LABELS[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="목적">
            <select value={form.dealKind} onChange={e => setField("dealKind", e.target.value as DealKind)} className={fieldCls}>
              {(Object.keys(DEAL_KIND_LABELS) as DealKind[]).map(s => (
                <option key={s} value={s}>{DEAL_KIND_LABELS[s]}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* VIP 토글 */}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.vip}
            onChange={e => setField("vip", e.target.checked)}
            className="w-4 h-4 accent-purple-600"
          />
          <span className="font-medium text-gray-700">⭐ VIP 손님</span>
          <span className="text-[11px] text-gray-400">(수수료 큰 매물 / 우선 응대)</span>
        </label>

        <Field label="예산">
          <input
            value={form.budget}
            onChange={e => setField("budget", e.target.value)}
            placeholder="예: 5억 이하 / 보증금 1억·월세 100"
            className={fieldCls}
          />
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
            <input
              type="date"
              value={form.moveInDate}
              onChange={e => setField("moveInDate", e.target.value)}
              className={fieldCls}
            />
          </Field>
          <Field label="다음 후속 연락">
            <input
              type="date"
              value={form.nextFollowUp}
              onChange={e => setField("nextFollowUp", e.target.value)}
              className={fieldCls}
            />
          </Field>
        </div>

        <Field label="상태">
          <select value={form.status} onChange={e => setField("status", e.target.value as CustomerStatus)} className={fieldCls}>
            {(Object.keys(STATUS_LABELS) as CustomerStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>

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
              아직 보여드린 매물이 없습니다. "+ 추가"로 매칭 이력을 기록하세요.
            </div>
          ) : (
            <div className="space-y-2">
              {form.shownProperties.map((s, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl p-2.5 space-y-1.5 bg-gray-50/50">
                  <div className="flex gap-1.5">
                    <input
                      value={s.address}
                      onChange={e => updateShown(idx, { address: e.target.value })}
                      placeholder="매물 주소"
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => removeShown(idx)}
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
                      onChange={e => updateShown(idx, { shownAt: e.target.value })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={s.reaction}
                      onChange={e => updateShown(idx, { reaction: e.target.value as ShownProperty["reaction"] })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">반응 선택</option>
                      <option value="positive">👍 좋아함</option>
                      <option value="neutral">😐 보통</option>
                      <option value="negative">👎 별로</option>
                    </select>
                  </div>
                  <input
                    value={s.note}
                    onChange={e => updateShown(idx, { note: e.target.value })}
                    placeholder="메모 (선택)"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <Field label="메모">
          <textarea
            value={form.memo}
            onChange={e => setField("memo", e.target.value)}
            placeholder="기억해야 할 특이사항 (예: 주말 임장 선호, 1층 NO)"
            rows={2}
            className={fieldCls + " resize-none"}
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
