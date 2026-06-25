"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { Contract } from "./contracts";
import {
  type ContractField,
  type ImportResult,
  type ParsedSheet,
  FIELD_LABELS,
  REQUIRED_FIELDS,
  parseExcelFile,
  guessMapping,
  buildImportResult,
  saveMapping,
  loadSavedMapping,
} from "./excel-import";

export type MergeStrategy = "replace" | "addOnly";

interface Props {
  existing: Contract[];
  onClose: () => void;
  onConfirm: (contracts: Contract[], strategy: MergeStrategy) => Promise<void>;
}

type Step = "file" | "mapping" | "preview" | "done";

export default function UploadModal({ existing, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<Step>("file");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, ContractField>>({});
  const [strategy, setStrategy] = useState<MergeStrategy>("addOnly");

  /* ───────── Step 1: 파일 선택 ───────── */
  const handleFile = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const result = await parseExcelFile(file);
      if (result.rows.length === 0) {
        setErr("파일에서 데이터를 찾을 수 없습니다. 첫 번째 시트 확인 후 다시 시도해주세요.");
        return;
      }
      setParsed(result);

      const saved = loadSavedMapping(result.headers);
      const guessed = saved || guessMapping(result.headers);
      setMapping(guessed);
      setStep("mapping");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "파일을 읽지 못했습니다");
    } finally {
      setBusy(false);
    }
  };

  /* ───────── Step 3: 미리보기에서 저장 확정 ───────── */
  const importResult = useMemo<ImportResult | null>(() => {
    if (!parsed) return null;
    return buildImportResult(parsed.rows, mapping, existing);
  }, [parsed, mapping, existing]);

  const handleConfirm = async () => {
    if (!parsed || !importResult) return;
    setBusy(true);
    setErr(null);
    try {
      saveMapping(parsed.headers, mapping);

      let toSave = importResult.contracts;
      if (strategy === "addOnly") {
        // 중복은 제외하고 새것만
        toSave = toSave.filter(c => !importResult.duplicates.some(d => d.id === c.id));
      }
      // strategy === "replace"는 부모(/expiry)에서 기존 데이터 삭제 후 전부 저장하도록 처리

      await onConfirm(toSave, strategy);
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={busy ? () => {} : onClose} title="엑셀 업로드">
      {step === "file" && (
        <FileStep onPick={handleFile} busy={busy} err={err} />
      )}

      {step === "mapping" && parsed && (
        <MappingStep
          parsed={parsed}
          mapping={mapping}
          onChange={setMapping}
          onNext={() => setStep("preview")}
          onBack={() => setStep("file")}
        />
      )}

      {step === "preview" && importResult && parsed && (
        <PreviewStep
          result={importResult}
          strategy={strategy}
          onStrategyChange={setStrategy}
          onConfirm={handleConfirm}
          onBack={() => setStep("mapping")}
          busy={busy}
          err={err}
          existingCount={existing.length}
        />
      )}

      {step === "done" && importResult && (
        <DoneStep
          imported={
            strategy === "addOnly"
              ? importResult.contracts.length - importResult.duplicates.length
              : importResult.contracts.length
          }
          strategy={strategy}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

/* ──────────────────────── Step 1: 파일 선택 ──────────────────────── */
function FileStep({ onPick, busy, err }: { onPick: (f: File) => void; busy: boolean; err: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    const file = e.dataTransfer.files[0];
    if (file) onPick(file);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
          hover ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-400 bg-gray-50"
        }`}
      >
        <div className="text-4xl mb-2">📥</div>
        <div className="text-sm font-semibold text-gray-900 mb-1">
          {busy ? "파일 읽는 중…" : "엑셀 파일을 끌어 놓거나 클릭"}
        </div>
        <div className="text-xs text-gray-500">
          .xlsx · .xls · .csv 지원
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); }}
          className="hidden"
        />
      </div>

      {err && <ErrBox>{err}</ErrBox>}

      <div className="text-[11px] text-gray-500 bg-gray-50 rounded-xl px-3 py-2 space-y-1">
        <div>💡 한방·4989·자체 엑셀 모두 사용 가능합니다.</div>
        <div>💡 파일은 외부 서버로 전송되지 않고 브라우저에서만 처리됩니다.</div>
        <div>💡 첫 번째 시트의 헤더 행을 자동 인식합니다.</div>
      </div>
    </div>
  );
}

/* ──────────────────────── Step 2: 컬럼 매핑 ──────────────────────── */
function MappingStep({
  parsed, mapping, onChange, onNext, onBack,
}: {
  parsed: ParsedSheet;
  mapping: Record<string, ContractField>;
  onChange: (m: Record<string, ContractField>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const usedFields = new Set<ContractField>(Object.values(mapping).filter((v): v is Exclude<ContractField, "_ignore"> => v !== "_ignore"));
  const missingRequired = REQUIRED_FIELDS.filter(f => !usedFields.has(f));

  const setField = (header: string, field: ContractField) => {
    onChange({ ...mapping, [header]: field });
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-600">
        엑셀의 <b>총 {parsed.rows.length}건</b>이 발견됐습니다. 컬럼을 우리 앱의 어떤 항목과 연결할지 확인해주세요.
      </div>

      {missingRequired.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-800">
          ⚠️ 필수 항목 누락: <b>{missingRequired.map(f => FIELD_LABELS[f as Exclude<ContractField, "_ignore">]).join(", ")}</b>
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
        {parsed.headers.map(header => (
          <div key={header} className="flex items-center gap-2 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{header}</div>
              <div className="text-[10px] text-gray-400 truncate">
                예시: {firstNonEmpty(parsed.rows, header)}
              </div>
            </div>
            <div className="text-gray-300 text-xs">→</div>
            <select
              value={mapping[header] || "_ignore"}
              onChange={e => setField(header, e.target.value as ContractField)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[110px]"
            >
              <option value="_ignore">— 사용 안 함 —</option>
              {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).map(field => {
                const taken = usedFields.has(field) && mapping[header] !== field;
                const isRequired = REQUIRED_FIELDS.includes(field);
                return (
                  <option key={field} value={field} disabled={taken}>
                    {FIELD_LABELS[field]}{isRequired ? " *" : ""}{taken ? " (다른 컬럼에 사용중)" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors">
          ← 파일 다시 선택
        </button>
        <button
          onClick={onNext}
          disabled={missingRequired.length > 0}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          다음 — 미리보기 확인
        </button>
      </div>
    </div>
  );
}

function firstNonEmpty(rows: Record<string, unknown>[], header: string): string {
  for (const row of rows) {
    const v = row[header];
    if (v !== "" && v !== null && v !== undefined) {
      if (v instanceof Date) return v.toLocaleDateString("ko-KR");
      return String(v).slice(0, 30);
    }
  }
  return "(빈 값)";
}

/* ──────────────────────── Step 3: 미리보기 + 병합옵션 ──────────────────────── */
function PreviewStep({
  result, strategy, onStrategyChange,
  onConfirm, onBack, busy, err, existingCount,
}: {
  result: ImportResult;
  strategy: MergeStrategy;
  onStrategyChange: (s: MergeStrategy) => void;
  onConfirm: () => void;
  onBack: () => void;
  busy: boolean;
  err: string | null;
  existingCount: number;
}) {
  const total = result.contracts.length;
  const warnCount = result.warnings.length;
  const dupCount = result.duplicates.length;
  const newCount = total - dupCount;

  const previewRows = result.contracts.slice(0, 5);

  return (
    <div className="space-y-3">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="총 발견" count={total} tone="blue" />
        <Stat label="경고" count={warnCount} tone={warnCount > 0 ? "orange" : "gray"} />
        <Stat label="중복 의심" count={dupCount} tone={dupCount > 0 ? "yellow" : "gray"} />
      </div>

      {/* 미리보기 5건 */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-600 border-b border-gray-200">
          미리보기 (처음 5건)
        </div>
        <div className="divide-y divide-gray-100 max-h-[30vh] overflow-y-auto">
          {previewRows.map((c, i) => (
            <div key={i} className="px-3 py-2 text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] px-1.5 rounded bg-gray-100 text-gray-600">{c.type}</span>
                <span className="font-medium text-gray-800 truncate">{c.address || <span className="text-red-500">주소 없음</span>}</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                만기 {c.endDate || <span className="text-red-500">없음</span>} · 임차인 {c.tenantName || "—"} · 임대인 {c.landlordName || "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 경고 상세 */}
      {warnCount > 0 && (
        <details className="bg-orange-50 border border-orange-200 rounded-xl">
          <summary className="px-3 py-2 text-xs font-medium text-orange-800 cursor-pointer">
            ⚠️ 경고 {warnCount}건 보기
          </summary>
          <div className="px-3 pb-2 text-[11px] text-orange-700 space-y-0.5 max-h-32 overflow-y-auto">
            {result.warnings.slice(0, 20).map((w, i) => (
              <div key={i}>· {w.rowIdx}행: {w.messages.join(", ")}</div>
            ))}
            {result.warnings.length > 20 && <div className="text-orange-500">… 외 {result.warnings.length - 20}건</div>}
          </div>
        </details>
      )}

      {/* 병합 옵션 */}
      <div className="border border-gray-200 rounded-2xl p-3">
        <div className="text-xs font-medium text-gray-700 mb-2">
          저장 방식 선택 (현재 {existingCount}건 등록됨)
        </div>
        <label className="flex items-start gap-2 text-xs py-1.5 cursor-pointer">
          <input
            type="radio"
            checked={strategy === "addOnly"}
            onChange={() => onStrategyChange("addOnly")}
            className="mt-0.5 accent-blue-600"
          />
          <div>
            <div className="font-medium text-gray-800">새 계약만 추가 (추천)</div>
            <div className="text-[11px] text-gray-500">
              중복 의심 {dupCount}건은 제외하고 새로운 {newCount}건만 추가합니다. 기존 데이터는 그대로 유지됩니다.
            </div>
          </div>
        </label>
        <label className="flex items-start gap-2 text-xs py-1.5 cursor-pointer">
          <input
            type="radio"
            checked={strategy === "replace"}
            onChange={() => onStrategyChange("replace")}
            className="mt-0.5 accent-blue-600"
          />
          <div>
            <div className="font-medium text-gray-800">전체 교체 (주의)</div>
            <div className="text-[11px] text-gray-500">
              기존 {existingCount}건을 모두 삭제하고 엑셀의 {total}건으로 다시 시작합니다. 메모 등 우리 앱에서 추가한 정보가 사라집니다.
            </div>
          </div>
        </label>
      </div>

      {err && <ErrBox>{err}</ErrBox>}

      <div className="flex gap-2 pt-1">
        <button onClick={onBack} disabled={busy} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors">
          ← 매핑 수정
        </button>
        <button
          onClick={onConfirm}
          disabled={busy || total === 0}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {busy ? "저장 중…" : strategy === "addOnly" ? `${newCount}건 추가` : `${total}건으로 전체 교체`}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, count, tone }: { label: string; count: number; tone: "blue" | "orange" | "yellow" | "gray" }) {
  const cls = {
    blue:   "bg-blue-50 border-blue-200 text-blue-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    gray:   "bg-gray-50 border-gray-200 text-gray-600",
  }[tone];
  return (
    <div className={`rounded-xl border p-2 text-center ${cls}`}>
      <div className="text-[10px]">{label}</div>
      <div className="text-lg font-bold">{count}<span className="text-xs font-normal ml-0.5">건</span></div>
    </div>
  );
}

/* ──────────────────────── 완료 ──────────────────────── */
function DoneStep({ imported, strategy, onClose }: { imported: number; strategy: MergeStrategy; onClose: () => void }) {
  return (
    <div className="space-y-3 text-center py-4">
      <div className="text-5xl">✅</div>
      <div className="text-base font-semibold text-gray-900">
        {strategy === "addOnly" ? `새 계약 ${imported}건 추가 완료` : `${imported}건으로 교체 완료`}
      </div>
      <div className="text-xs text-gray-500">
        클라우드에 저장되어 PC·폰에서 자동 동기화됩니다.
      </div>
      <button
        onClick={onClose}
        className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
      >
        목록으로
      </button>
    </div>
  );
}

/* ──────────────────────── 공통 ──────────────────────── */
function ErrBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
      ⚠️ {children}
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
        className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[calc(100dvh-5rem)] sm:max-h-[90vh] overflow-y-auto shadow-2xl"
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
