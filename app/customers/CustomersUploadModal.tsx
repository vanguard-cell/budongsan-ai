"use client";

/**
 * 손님 엑셀 업로드 모달 — 매물 패턴 재사용
 */

import { useEffect, useRef, useState, useMemo } from "react";
import type { Customer } from "./customer-types";
import {
  type CustField,
  type ParsedCustSheet,
  type CustImportResult,
  CUST_FIELD_LABELS,
  CUST_REQUIRED,
  parseCustExcelFile,
  guessCustMapping,
  buildCustImportResult,
} from "./excel-import-customers";

export type CustMergeStrategy = "replace" | "addOnly";

interface Props {
  existing: Customer[];
  onClose: () => void;
  onConfirm: (toSave: Customer[], strategy: CustMergeStrategy) => Promise<void>;
}

type Step = "file" | "mapping" | "preview" | "done";

export default function CustomersUploadModal({ existing, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<Step>("file");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCustSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, CustField>>({});
  const [strategy, setStrategy] = useState<CustMergeStrategy>("addOnly");

  const handleFile = async (file: File) => {
    setErr(null); setBusy(true);
    try {
      const result = await parseCustExcelFile(file);
      if (result.rows.length === 0) { setErr("파일에서 데이터를 찾을 수 없습니다."); return; }
      setParsed(result);
      setMapping(guessCustMapping(result.headers));
      setStep("mapping");
    } catch (e) { setErr(e instanceof Error ? e.message : "파일 읽기 실패"); }
    finally { setBusy(false); }
  };

  const importResult = useMemo<CustImportResult | null>(() => {
    if (!parsed) return null;
    return buildCustImportResult(parsed.rows, mapping, existing);
  }, [parsed, mapping, existing]);

  const handleConfirm = async () => {
    if (!parsed || !importResult) return;
    setBusy(true); setErr(null);
    try {
      let toSave = importResult.customers;
      if (strategy === "addOnly") {
        toSave = toSave.filter(c => !importResult.duplicates.some(d => d.id === c.id));
      }
      await onConfirm(toSave, strategy);
      setStep("done");
    } catch (e) { setErr(e instanceof Error ? e.message : "저장 중 오류"); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={busy ? () => {} : onClose} title="👥 손님 엑셀 업로드">
      {step === "file"    && <FileStep onPick={handleFile} busy={busy} err={err} />}
      {step === "mapping" && parsed && (
        <MappingStep parsed={parsed} mapping={mapping} onChange={setMapping}
          onNext={() => setStep("preview")} onBack={() => setStep("file")} />
      )}
      {step === "preview" && parsed && importResult && (
        <PreviewStep result={importResult} strategy={strategy}
          onStrategyChange={setStrategy} onConfirm={handleConfirm}
          onBack={() => setStep("mapping")} busy={busy} err={err}
          existingCount={existing.length} />
      )}
      {step === "done"    && importResult && (
        <DoneStep
          imported={strategy === "addOnly"
            ? importResult.customers.length - importResult.duplicates.length
            : importResult.customers.length}
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
          hover ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-400 bg-gray-50"
        }`}
      >
        <div className="text-4xl mb-2">👥</div>
        <div className="text-sm font-semibold text-gray-900 mb-1">
          {busy ? "파일 읽는 중…" : "손님 엑셀을 끌어 놓거나 클릭"}
        </div>
        <div className="text-xs text-gray-500">.xlsx · .xls · .csv 지원</div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); }} className="hidden" />
      </div>
      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">⚠️ {err}</div>}
      <div className="text-[11px] text-gray-500 bg-gray-50 rounded-xl px-3 py-2 space-y-1">
        <div>💡 한글 컬럼명 자동 인식 (이름·연락처·예산·관심지역 등)</div>
        <div>💡 같은 이름+전화번호 중복 자동 감지</div>
        <div>💡 파일은 브라우저 안에서만 처리됨</div>
      </div>
    </div>
  );
}

function MappingStep({ parsed, mapping, onChange, onNext, onBack }: {
  parsed: ParsedCustSheet;
  mapping: Record<string, CustField>;
  onChange: (m: Record<string, CustField>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const usedFields = new Set<CustField>(
    Object.values(mapping).filter((v): v is Exclude<CustField, "_ignore"> => v !== "_ignore"),
  );
  const missingRequired = CUST_REQUIRED.filter(f => !usedFields.has(f));
  const setField = (header: string, field: CustField) => onChange({ ...mapping, [header]: field });

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-600">엑셀에서 <b>{parsed.rows.length}명</b>이 발견됐습니다.</div>
      {missingRequired.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-800">
          ⚠️ 필수: <b>{missingRequired.map(f => CUST_FIELD_LABELS[f as Exclude<CustField, "_ignore">]).join(", ")}</b>
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
            <select value={mapping[header] || "_ignore"} onChange={e => setField(header, e.target.value as CustField)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[110px]">
              <option value="_ignore">— 사용 안 함 —</option>
              {(Object.keys(CUST_FIELD_LABELS) as (keyof typeof CUST_FIELD_LABELS)[]).map(field => {
                const taken = usedFields.has(field) && mapping[header] !== field;
                const isReq = CUST_REQUIRED.includes(field);
                return <option key={field} value={field} disabled={taken}>{CUST_FIELD_LABELS[field]}{isReq ? " *" : ""}{taken ? " (사용중)" : ""}</option>;
              })}
            </select>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">← 파일</button>
        <button onClick={onNext} disabled={missingRequired.length > 0}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
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

function PreviewStep({ result, strategy, onStrategyChange, onConfirm, onBack, busy, err, existingCount }: {
  result: CustImportResult;
  strategy: CustMergeStrategy;
  onStrategyChange: (s: CustMergeStrategy) => void;
  onConfirm: () => void;
  onBack: () => void;
  busy: boolean;
  err: string | null;
  existingCount: number;
}) {
  const total = result.customers.length;
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
        <div className="bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-600 border-b border-gray-200">미리보기 (5명)</div>
        <div className="divide-y divide-gray-100 max-h-[30vh] overflow-y-auto">
          {result.customers.slice(0, 5).map((c, i) => (
            <div key={i} className="px-3 py-2 text-xs">
              <div className="flex items-baseline gap-1.5">
                {c.vip && <span className="text-[10px] px-1 rounded bg-yellow-100 text-yellow-700">VIP</span>}
                <span className="font-medium text-gray-800">{c.name || <span className="text-red-500">이름 없음</span>}</span>
                <span className="text-gray-500">{c.phone}</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {c.budget && `예산 ${c.budget} · `}{c.preferredArea && `관심 ${c.preferredArea}`}
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
        <div className="text-xs font-medium text-gray-700 mb-2">저장 방식 (현재 {existingCount}명 등록됨)</div>
        <label className="flex items-start gap-2 text-xs py-1.5 cursor-pointer">
          <input type="radio" checked={strategy === "addOnly"} onChange={() => onStrategyChange("addOnly")} className="mt-0.5 accent-blue-600" />
          <div>
            <div className="font-medium text-gray-800">새 손님만 추가 (추천)</div>
            <div className="text-[11px] text-gray-500">중복 {dup}명 제외, 새 {newC}명만 추가</div>
          </div>
        </label>
        <label className="flex items-start gap-2 text-xs py-1.5 cursor-pointer">
          <input type="radio" checked={strategy === "replace"} onChange={() => onStrategyChange("replace")} className="mt-0.5 accent-blue-600" />
          <div>
            <div className="font-medium text-gray-800">전체 교체 (주의)</div>
            <div className="text-[11px] text-gray-500">기존 {existingCount}명 삭제 + 새로 {total}명</div>
          </div>
        </label>
      </div>
      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">⚠️ {err}</div>}
      <div className="flex gap-2 pt-1">
        <button onClick={onBack} disabled={busy} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-50">← 매핑</button>
        <button onClick={onConfirm} disabled={busy || total === 0}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {busy ? "저장 중…" : strategy === "addOnly" ? `${newC}명 추가` : `${total}명 교체`}
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
      <div className="text-lg font-bold">{count}<span className="text-xs font-normal ml-0.5">명</span></div>
    </div>
  );
}

function DoneStep({ imported, onClose }: { imported: number; onClose: () => void }) {
  return (
    <div className="space-y-3 text-center py-4">
      <div className="text-5xl">✅</div>
      <div className="text-base font-semibold text-gray-900">손님 {imported}명 추가 완료</div>
      <div className="text-xs text-gray-500">PC·폰에서 자동 동기화됩니다.</div>
      <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
