"use client";

/** 계약 진행 모달 — page.tsx 분리 리팩토링으로 추출 */

import { useState } from "react";
import type { Property } from "@/lib/properties-db";
import type { Customer } from "@/app/customers/customer-types";
import KoreanDatePicker from "@/app/KoreanDatePicker";

export default function ContractProgressModal({ property, onClose, onSave }: {
  property: Property;
  customers?: Customer[];
  onClose: () => void;
  onSave: (p: Property) => Promise<void>;
}) {
  const [form, setForm] = useState<Property>(property);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Property>(k: K, v: Property[K]) => setForm(p => ({ ...p, [k]: v }));

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
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[calc(100dvh-5rem)] sm:max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-2xl">
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

          {/* 계약 상대방 정보 — 매매=매수인 / 전월세=임차인, 고객관리 검색 연동 */}
          {(() => {
            const isSale = form.dealType === "매매";
            const partyLabel = isSale ? "매수인" : "임차인";
            const nameKey = isSale ? "ownerName" : "tenantName";
            const phoneKey = isSale ? "ownerPhone" : "tenantPhone";
            return (
            <div className="border border-orange-200 rounded-2xl p-3 bg-orange-50/40 space-y-2">
              <div className="text-xs font-semibold text-orange-700">🤝 {partyLabel}</div>

              {/* 직접 입력 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{partyLabel} 이름</label>
                  <input value={form[nameKey]}
                    onChange={e => { set(nameKey, e.target.value); if (!isSale) set("linkedTenantId", "") }}
                    placeholder="홍길동"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">연락처</label>
                  <input type="tel" value={form[phoneKey]}
                    onChange={e => { set(phoneKey, e.target.value); if (!isSale) set("linkedTenantId", ""); }}
                    placeholder="010-0000-0000"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              {/* 보증금/월세 — 전월세만 (매매는 기존 임차인 정보 유지) */}
              {!isSale && <div className="grid grid-cols-2 gap-2 mt-2">
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
              </div>}
              {isSale && <p className="text-[10px] text-orange-600">💡 매수인은 새 집주인(매도인 칸)으로 바뀌고, 기존 임차인 정보는 그대로 유지됩니다</p>}
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
