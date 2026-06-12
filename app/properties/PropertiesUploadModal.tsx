"use client";

/**
 * 매물 엑셀 업로드 모달
 * - 파일 선택 → 자동 매핑 → 미리보기 → 저장
 */

import { useEffect, useRef, useState, useMemo } from "react";
import type { Property } from "@/lib/properties-db";
import {
  type PropField,
  type ParsedPropSheet,
  type PropImportResult,
  PROP_FIELD_LABELS,
  PROP_REQUIRED,
  parsePropExcelFile,
  guessPropMapping,
  buildPropImportResult,
} from "./excel-import-properties";

export type PropMergeStrategy = "replace" | "addOnly";

interface Props {
  existing: Property[];
  onClose: () => void;
  onConfirm: (toSave: Property[], strategy: PropMergeStrategy) => Promise<void>;
}

type Step = "file" | "mapping" | "preview" | "done";

export default function PropertiesUploadModal({ existing, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<Step>("file");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedPropSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, PropField>>({});
  const [strategy, setStrategy] = useState<PropMergeStrategy>("addOnly");

  const handleFile = async (file: File) => {
    setErr(null); setBusy(true);
    try {
      const result = await parsePropExcelFile(file);
      if (result.rows.length === 0) {
        setErr("파일에서 데이터를 찾을 수 없습니다. 첫 번째 시트를 확인해주세요.");
        return;
      }
      setParsed(result);
      setMapping(guessPropMapping(result.headers));
      setStep("mapping");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "파일을 읽지 못했습니다");
    } finally {
      setBusy(false);
    }
  };

  const importResult = useMemo<PropImportResult | null>(() => {
    if (!parsed) return null;
    return buildPropImportResult(parsed.rows, mapping, existing);
  }, [parsed, mapping, existing]);

  const handleConfirm = async () => {
    if (!parsed || !importResult) return;
    setBusy(true); setErr(null);
    try {
      let toSave = importResult.properties;
      if (strategy === "addOnly") {
        toSave = toSave.filter(p => !importResult.duplicates.some(d => d.id === p.id));
      }
      await onConfirm(toSave, strategy);
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 중 오류");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={busy ? () => {} : onClose} title="🏘️ 매물 엑셀 업로드">
      {step === "file"     && <FileStep onPick={handleFile} busy={busy} err={err} />}
      {step === "mapping"  && parsed && (
        <MappingStep parsed={parsed} mapping={mapping} onChange={setMapping}
          onNext={() => setStep("preview")} onBack={() => setStep("file")} />
      )}
      {step === "preview"  && parsed && importResult && (
        <PreviewStep parsed={parsed} result={importResult} strategy={strategy}
          onStrategyChange={setStrategy} onConfirm={handleConfirm}
          onBack={() => setStep("mapping")} busy={busy} err={err}
          existingCount={existing.length} />
      )}
      {step === "done"     && importResult && (
        <DoneStep
          imported={strategy === "addOnly"
            ? importResult.properties.length - importResult.duplicates.length
            : importResult.properties.length}
          onClose={onClose} />
      )}
    </Modal>
  );
}

function FileStep({ onPick, busy, err }: { onPick: (f: File) => void; busy: boolean; err: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setHover(false);
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
          hover ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-emerald-400 bg-gray-50"
        }`}
      >
        <div className="text-4xl mb-2">🏘️</div>
        <div className="text-sm font-semibold text-gray-900 mb-1">
          {busy ? "파일 읽는 중…" : "매물 엑셀을 끌어 놓거나 클릭"}
        </div>
        <div className="text-xs text-gray-500">.xlsx · .xls · .csv 지원</div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); }} className="hidden" />
      </div>
      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">⚠️ {err}</div>}
      <div className="text-[11px] text-gray-500 bg-gray-50 rounded-xl px-3 py-2 space-y-1">
        <div>💡 한글 컬럼명 자동 인식 (주소·매매가·집주인·임차인 등)</div>
        <div>💡 파일은 브라우저 안에서만 처리됨 — 외부 전송 X</div>
      </div>
    </div>
  );
}

function MappingStep({ parsed, mapping, onChange, onNext, onBack }: {
  parsed: ParsedPropSheet;
  mapping: Record<string, PropField>;
  onChange: (m: Record<string, PropField>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const usedFields = new Set<PropField>(
    Object.values(mapping).filter((v): v is Exclude<PropField, "_ignore"> => v !== "_ignore"),
  );
  const missingRequired = PROP_REQUIRED.filter(f => !usedFields.has(f));
  const setField = (header: string, field: PropField) => onChange({ ...mapping, [header]: field });

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-600">엑셀에서 <b>{parsed.rows.length}건</b>이 발견됐습니다. 컬럼을 확인해주세요.</div>
      {missingRequired.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-800">
          ⚠️ 필수: <b>{missingRequired.map(f => PROP_FIELD_LABELS[f as Exclude<PropField, "_ignore">]).join(", ")}</b>
        </div>
      )}
      <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
        {parsed.headers.map(header => (
          <div key={header} className="flex items-center gap-2 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{header}</div>
              <div className="text-[10px] text-gray-400 truncate">예시: {firstNonEmpty(parsed.rows, header)}</div>
            </div>
            <div className="text-gray-300 text-xs">→</div>
            <select value={mapping[header] || "_ignore"} onChange={e => setField(header, e.target.value as PropField)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[110px]">
              <option value="_ignore">— 사용 안 함 —</option>
              {(Object.keys(PROP_FIELD_LABELS) as (keyof typeof PROP_FIELD_LABELS)[]).map(field => {
                const taken = usedFields.has(field) && mapping[header] !== field;
                const isReq = PROP_REQUIRED.includes(field);
                return <option key={field} value={field} disabled={taken}>{PROP_FIELD_LABELS[field]}{isReq ? " *" : ""}{taken ? " (사용중)" : ""}</option>;
              })}
            </select>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">← 파일</button>
        <button onClick={onNext} disabled={missingRequired.length > 0}
          className="flex-1 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-sm font-semibold hover:bg-[var(--brand-blue-dark)] disabled:opacity-40 disabled:cursor-not-allowed">
          다음 — 미리보기
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

function PreviewStep({ parsed, result, strategy, onStrategyChange, onConfirm, onBack, busy, err, existingCount }: {
  parsed: ParsedPropSheet;
  result: PropImportResult;
  strategy: PropMergeStrategy;
  onStrategyChange: (s: PropMergeStrategy) => void;
  onConfirm: () => void;
  onBack: () => void;
  busy: boolean;
  err: string | null;
  existingCount: number;
}) {
  const total = result.properties.length;
  const warn = result.warnings.length;
  const dup = result.duplicates.length;
  const newC = total - dup;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="총 발견" count={total} tone="blue" />
        <Stat label="경고" count={warn} tone={warn > 0 ? "orange" : "gray"} />
        <Stat label="중복 의심" count={dup} tone={dup > 0 ? "yellow" : "gray"} />
      </div>
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-600 border-b border-gray-200">미리보기 (5건)</div>
        <div className="divide-y divide-gray-100 max-h-[30vh] overflow-y-auto">
          {result.properties.slice(0, 5).map((p, i) => (
            <div key={i} className="px-3 py-2 text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] px-1.5 rounded bg-emerald-100 text-emerald-700">{p.dealType}</span>
                <span className="text-[10px] px-1.5 rounded bg-gray-100 text-gray-600">{p.propertyType}</span>
                <span className="font-medium text-gray-800 truncate">{p.address || <span className="text-red-500">주소 없음</span>}</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {p.price && `보증금 ${p.price}만 · `}{p.monthly && `월세 ${p.monthly}만 · `}
                {p.ownerName && `집주인 ${p.ownerName} · `}{p.tenantName && `임차인 ${p.tenantName}`}
              </div>
            </div>
          ))}
        </div>
      </div>
      {warn > 0 && (
        <details className="bg-orange-50 border border-orange-200 rounded-xl">
          <summary className="px-3 py-2 text-xs font-medium text-orange-800 cursor-pointer">⚠️ 경고 {warn}건 보기</summary>
          <div className="px-3 pb-2 text-[11px] text-orange-700 space-y-0.5 max-h-32 overflow-y-auto">
            {result.warnings.slice(0, 20).map((w, i) => <div key={i}>· {w.rowIdx}행: {w.messages.join(", ")}</div>)}
          </div>
        </details>
      )}
      <div className="border border-gray-200 rounded-2xl p-3">
        <div className="text-xs font-medium text-gray-700 mb-2">저장 방식 (현재 {existingCount}건 등록됨)</div>
        <label className="flex items-start gap-2 text-xs py-1.5 cursor-pointer">
          <input type="radio" checked={strategy === "addOnly"} onChange={() => onStrategyChange("addOnly")} className="mt-0.5 accent-[#2383E2]" />
          <div>
            <div className="font-medium text-gray-800">새 매물만 추가 (추천)</div>
            <div className="text-[11px] text-gray-500">중복 {dup}건 제외, 새 {newC}건만 추가</div>
          </div>
        </label>
        <label className="flex items-start gap-2 text-xs py-1.5 cursor-pointer">
          <input type="radio" checked={strategy === "replace"} onChange={() => onStrategyChange("replace")} className="mt-0.5 accent-[#2383E2]" />
          <div>
            <div className="font-medium text-gray-800">전체 교체 (주의)</div>
            <div className="text-[11px] text-gray-500">기존 {existingCount}건 삭제 + 새로 {total}건</div>
          </div>
        </label>
      </div>
      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">⚠️ {err}</div>}
      <div className="flex gap-2 pt-1">
        <button onClick={onBack} disabled={busy} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-50">← 매핑</button>
        <button onClick={onConfirm} disabled={busy || total === 0}
          className="flex-1 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-sm font-semibold hover:bg-[var(--brand-blue-dark)] disabled:opacity-50">
          {busy ? "저장 중…" : strategy === "addOnly" ? `${newC}건 추가` : `${total}건 교체`}
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

function DoneStep({ imported, onClose }: { imported: number; onClose: () => void }) {
  return (
    <div className="space-y-3 text-center py-4">
      <div className="text-5xl">✅</div>
      <div className="text-base font-semibold text-gray-900">매물 {imported}건 추가 완료</div>
      <div className="text-xs text-gray-500">PC·폰에서 자동 동기화됩니다.</div>
      <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-sm font-semibold hover:bg-[var(--brand-blue-dark)]">
        목록으로
      </button>
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[calc(100dvh-5rem)] sm:max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
