"use client";

/**
 * 데이터 내보내기 모달 — 계약·손님 공용
 *
 * - 범위: 진행중만 / 전체
 * - 개인정보 마스킹 옵션
 * - 형식: xlsx / csv
 * - 인쇄용 PDF는 별도 옵션
 */

import { useEffect, useState } from "react";
import type { ExportFormat, ExportOptions, ExportScope } from "@/lib/export";

export type ExportType = "contracts" | "customers";

interface Props {
  type: ExportType;
  totalCount: number;       // 전체 데이터 수
  activeCount: number;      // 진행중만
  onClose: () => void;
  onExport: (opt: ExportOptions) => Promise<{ count: number; filename: string }> | { count: number; filename: string };
  onPrintPDF?: () => void;  // 인쇄 PDF 옵션 (계약만)
}

export default function ExportModal({
  type, totalCount, activeCount, onClose, onExport, onPrintPDF,
}: Props) {
  const [scope, setScope] = useState<ExportScope>("active");
  const [maskPersonal, setMaskPersonal] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ count: number; filename: string } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleExport = async () => {
    setBusy(true);
    try {
      const result = await onExport({ scope, maskPersonal, format });
      setDone(result);
    } finally {
      setBusy(false);
    }
  };

  const label = type === "contracts" ? "계약" : "손님";
  const targetCount = scope === "active" ? activeCount : totalCount;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold text-gray-900">📤 {label} 데이터 내보내기</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          {done ? (
            <DoneView done={done} onClose={onClose} />
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-900">
                💡 데이터는 브라우저에서 직접 다운로드됩니다. 외부 서버로 전송되지 않습니다.
              </div>

              {/* 범위 */}
              <FieldGroup label="어떤 데이터를 내보낼까요?">
                <RadioOption
                  checked={scope === "active"}
                  onClick={() => setScope("active")}
                  title={`진행중인 ${label}만`}
                  desc={`${activeCount}건 — 종료/이탈 제외`}
                />
                <RadioOption
                  checked={scope === "all"}
                  onClick={() => setScope("all")}
                  title="전체 (종료 포함)"
                  desc={`${totalCount}건 — 모든 이력 포함`}
                />
              </FieldGroup>

              {/* 마스킹 */}
              <FieldGroup label="개인정보 처리">
                <RadioOption
                  checked={!maskPersonal}
                  onClick={() => setMaskPersonal(false)}
                  title="원본 그대로"
                  desc="이름·전화 그대로 출력 (본인 백업용)"
                />
                <RadioOption
                  checked={maskPersonal}
                  onClick={() => setMaskPersonal(true)}
                  title="가리고 출력"
                  desc='이름 "김○수", 전화 "010-****-5678" 처리 (외부 공유용)'
                />
              </FieldGroup>

              {/* 형식 */}
              <FieldGroup label="파일 형식">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setFormat("xlsx")}
                    className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                      format === "xlsx"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"
                    }`}
                  >
                    Excel (.xlsx)
                  </button>
                  <button
                    onClick={() => setFormat("csv")}
                    className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                      format === "csv"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"
                    }`}
                  >
                    CSV (.csv)
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5">
                  xlsx는 Excel·한방·4989에서 바로 열림 / csv는 데이터 분석·다른 프로그램 이전용
                </p>
              </FieldGroup>

              {/* 액션 */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={handleExport}
                  disabled={busy || targetCount === 0}
                  className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {busy ? "준비 중…" : `📤 ${targetCount}건 다운로드`}
                </button>

                {onPrintPDF && (
                  <button
                    onClick={() => { onPrintPDF(); onClose(); }}
                    className="w-full py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-semibold hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    🖨️ 인쇄용 PDF (만기 알림판)
                  </button>
                )}

                <button
                  onClick={onClose}
                  className="w-full py-2 rounded-xl text-gray-500 text-sm hover:text-gray-700"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-900 mb-2">{label}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RadioOption({
  checked, onClick, title, desc,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors ${
        checked
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white hover:border-blue-300"
      }`}
    >
      <div className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
        checked ? "border-blue-600" : "border-gray-300"
      }`}>
        {checked && <div className="w-2 h-2 rounded-full bg-blue-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="text-[11px] text-gray-500 mt-0.5">{desc}</div>
      </div>
    </button>
  );
}

function DoneView({ done, onClose }: { done: { count: number; filename: string }; onClose: () => void }) {
  return (
    <div className="text-center py-6 space-y-3">
      <div className="text-5xl">✅</div>
      <div className="text-base font-semibold text-gray-900">
        {done.count}건 다운로드 완료
      </div>
      <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 inline-block">
        📁 {done.filename}
      </div>
      <div className="text-[11px] text-gray-500 mt-2">
        다운로드 폴더에서 확인하세요
      </div>
      <button
        onClick={onClose}
        className="mt-4 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
      >
        닫기
      </button>
    </div>
  );
}
