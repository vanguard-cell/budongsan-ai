"use client";

/**
 * 광고 양식 자동 생성 모달
 *
 * 한 번 등록한 매물을 6개 플랫폼 양식으로 변환:
 *  네이버 / 직방 / 다방 / 카톡 / SMS / 블로그
 *
 * 각 양식 옆에 [복사] 버튼 — 클릭하면 클립보드에 복사
 * 중개사는 각 플랫폼 앱에서 붙여넣기만 하면 됨
 */

import { useState } from "react";
import type { Property } from "@/lib/properties-db";
import { AD_FORMATS, formatByKey, type AdFormatKey } from "@/lib/property-formats";

interface Props {
  property: Property;
  onClose: () => void;
}

export default function AdFormatsModal({ property, onClose }: Props) {
  const [activeKey, setActiveKey] = useState<AdFormatKey>("naver");
  const [copiedKey, setCopiedKey] = useState<AdFormatKey | null>(null);

  const activeFormat = AD_FORMATS.find(f => f.key === activeKey)!;
  const generatedText = formatByKey(activeKey, property);

  const copy = async (key: AdFormatKey, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl z-10">
          <div>
            <h2 className="text-base font-semibold">📤 광고 양식 자동 생성</h2>
            <p className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[280px]">{property.address}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-[11px] text-blue-700">
            💡 한 번 등록한 매물을 <strong>6개 플랫폼 양식</strong>으로 자동 정리해드립니다.<br />
            아래 탭에서 양식을 선택하고 <strong>[복사]</strong>를 누른 다음, 해당 앱에서 붙여넣기 하세요.
          </div>

          {/* 플랫폼 탭 */}
          <div className="grid grid-cols-3 gap-1.5">
            {AD_FORMATS.map(f => (
              <button
                key={f.key}
                onClick={() => setActiveKey(f.key)}
                className={`rounded-xl border p-2 text-center transition-colors ${
                  activeKey === f.key
                    ? "bg-emerald-600 text-white border-emerald-600 font-semibold"
                    : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"
                }`}
              >
                <div className="text-base leading-none">{f.icon}</div>
                <div className="text-[10px] mt-1">{f.label}</div>
              </button>
            ))}
          </div>

          {/* 설명 */}
          <div className="text-[11px] text-gray-500 px-1">
            <span className="text-base mr-1">{activeFormat.icon}</span>
            <strong className="text-gray-700">{activeFormat.label}</strong> — {activeFormat.description}
          </div>

          {/* 생성된 텍스트 */}
          <div className="relative">
            <textarea
              value={generatedText}
              readOnly
              rows={Math.min(20, Math.max(8, generatedText.split("\n").length + 1))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-mono leading-relaxed"
              onClick={e => (e.target as HTMLTextAreaElement).select()}
            />
            <div className="absolute top-2 right-2 flex flex-col gap-1">
              <button
                onClick={() => copy(activeKey, generatedText)}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold shadow-sm transition-colors ${
                  copiedKey === activeKey
                    ? "bg-green-600 text-white"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {copiedKey === activeKey ? "✅ 복사됨" : "📋 복사"}
              </button>
              <div className="text-[10px] text-gray-400 text-center">{generatedText.length}자</div>
            </div>
          </div>

          {/* 빠른 복사 — 모든 양식 한 번에 */}
          <details className="rounded-xl border border-gray-200 bg-gray-50">
            <summary className="px-3 py-2 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900">
              📋 모든 양식 한 번에 보기·복사
            </summary>
            <div className="p-3 space-y-2 border-t border-gray-200">
              {AD_FORMATS.map(f => {
                const text = formatByKey(f.key, property);
                return (
                  <div key={f.key} className="bg-white rounded-lg border border-gray-200 p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-gray-700">{f.icon} {f.label}</span>
                      <button
                        onClick={() => copy(f.key, text)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          copiedKey === f.key
                            ? "bg-green-100 text-green-700"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}
                      >
                        {copiedKey === f.key ? "✅" : "📋 복사"}
                      </button>
                    </div>
                    <pre className="text-[10px] text-gray-600 whitespace-pre-wrap break-all leading-snug max-h-24 overflow-y-auto">{text}</pre>
                  </div>
                );
              })}
            </div>
          </details>

          {/* Pro 안내 */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[10px] text-amber-700">
            💼 <strong>유료 Pro 플랜 예고</strong> — 향후 클릭 한 번에 6개 플랫폼 직접 전송, 사진 일괄 첨부, 카톡 알림톡 자동 발송 지원 예정
          </div>

          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
