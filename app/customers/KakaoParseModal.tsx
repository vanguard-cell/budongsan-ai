"use client";

/**
 * 카톡/문자 대화 붙여넣기 → AI 파싱 → 손님 자동 등록
 *
 * 흐름:
 *  1. 어머니가 카톡 대화 복사 후 textarea에 붙여넣기
 *  2. [AI 파싱] 클릭 → /api/parse-customer 호출
 *  3. 추출된 정보 확인 + 수정 가능
 *  4. [손님 등록] 클릭 → 저장
 */

import { useState } from "react";
import type { Customer, CustomerSide, DealKind } from "./customer-types";
import { emptyCustomer, SIDE_LABELS, DEAL_KIND_LABELS } from "./customer-types";

interface Props {
  onClose: () => void;
  onSave: (c: Customer) => Promise<void>;
}

const SIDES: CustomerSide[] = ["buyer", "seller", "tenant", "landlord", "etc"];
const DEAL_KINDS: DealKind[] = ["live", "invest", "etc"];

export default function KakaoParseModal({ onClose, onSave }: Props) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<"input" | "preview">("input");
  const [draft, setDraft] = useState<Customer | null>(null);

  const parse = async () => {
    if (text.trim().length < 5) {
      setErr("대화 내용이 너무 짧습니다");
      return;
    }
    setErr(null);
    setParsing(true);
    try {
      const res = await fetch("/api/parse-customer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const c: Customer = {
        ...emptyCustomer(),
        name:          data.name          || "",
        phone:         data.phone         || "",
        side:          data.side          || "buyer",
        dealKind:      data.dealKind      || "live",
        budget:        data.budget        || "",
        preferredArea: data.preferredArea || "",
        moveInDate:    data.moveInDate    || "",
        memo:          (data.memo ? `${data.memo}\n\n` : "") + `📩 카톡 파싱 원문:\n${text.slice(0, 500)}${text.length > 500 ? "…" : ""}`,
      };
      setDraft(c);
      setStep("preview");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "파싱 실패");
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name && !draft.phone) {
      if (!confirm("이름과 연락처가 모두 비어있습니다. 그래도 저장할까요?")) return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => {
    if (!draft) return;
    setDraft({ ...draft, [k]: v });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <div>
            <h2 className="text-base font-semibold">📩 카톡 붙여넣기 → 손님 자동 등록</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {step === "input" ? "1단계: 대화 붙여넣고 AI 파싱" : "2단계: 추출 결과 확인 후 저장"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>

        {step === "input" ? (
          <div className="p-5 space-y-3">
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-[11px] text-blue-700">
              💡 카톡에서 손님과의 대화 전체를 복사해서 아래 붙여넣으세요.<br />
              AI가 이름·연락처·예산·희망 지역·입주일을 자동 추출합니다.
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">카톡/문자 대화 내용</label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={`예시:
[김지영] 안녕하세요, 미사강변동 3룸 매물 보고 연락드려요
010-1234-5678입니다
보증금 1억에 월세 80만원 이하로 찾고 있어요
7월 15일 이후 입주 가능하면 좋겠어요
남편이랑 같이 보러 갈 예정이에요`}
                rows={10}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
              />
              <p className="text-[10px] text-gray-400 mt-1 text-right">{text.length}자</p>
            </div>

            {err && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                ⚠️ {err}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">취소</button>
              <button
                onClick={parse}
                disabled={parsing || text.trim().length < 5}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {parsing ? "AI 분석 중…" : "🤖 AI 파싱"}
              </button>
            </div>
          </div>
        ) : draft && (
          <div className="p-5 space-y-3">
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-[11px] text-green-700">
              ✅ AI 추출 완료. 필요시 직접 수정 후 저장하세요.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">이름</label>
                <input value={draft.name} onChange={e => set("name", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">연락처</label>
                <input value={draft.phone} onChange={e => set("phone", e.target.value)} type="tel"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">구분</label>
                <select value={draft.side} onChange={e => set("side", e.target.value as CustomerSide)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50">
                  {SIDES.map(s => <option key={s} value={s}>{SIDE_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">의도</label>
                <select value={draft.dealKind} onChange={e => set("dealKind", e.target.value as DealKind)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50">
                  {DEAL_KINDS.map(k => <option key={k} value={k}>{DEAL_KIND_LABELS[k]}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">예산</label>
              <input value={draft.budget} onChange={e => set("budget", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">희망 지역·단지</label>
              <input value={draft.preferredArea} onChange={e => set("preferredArea", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">입주 가능일</label>
              <input type="date" value={draft.moveInDate} onChange={e => set("moveInDate", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">메모 (원문 포함)</label>
              <textarea value={draft.memo} onChange={e => set("memo", e.target.value)} rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 resize-none font-mono" />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep("input")} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">← 다시 파싱</button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "저장 중…" : "✅ 손님 등록"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
