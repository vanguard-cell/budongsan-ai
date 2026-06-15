"use client";

/**
 * 만기(계약) 표 뷰 — 엑셀형 (노션 톤 v2). 매물·손님 표와 동일 패턴.
 * - 행 클릭 → 우측 패널 / 헤더 클릭 → 정렬·필터·열숨기기 / 셀 더블클릭 → 인라인 편집(✓ 확인)
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { type Contract, type ContractType, type Severity, dDay } from "./contracts";
import KoreanDatePicker from "@/app/KoreanDatePicker";

type ColKey = "address" | "type" | "price" | "tenant" | "landlord" | "start" | "end" | "sev" | "region";
type EditField = "price" | "tenant" | "landlord" | "start" | "end" | "type";

const COL_LABEL: Record<ColKey, string> = {
  address: "단지·동호", type: "종류", price: "보증금/월세", tenant: "임차인", landlord: "임대인", start: "시작일", end: "만기일", sev: "상태", region: "소재지",
};

const TYPE_TINT: Record<ContractType, string> = {
  매매: "bg-[var(--tint-red-bg)] text-[var(--tint-red-tx)] border border-[var(--tint-red-bd)]",
  전세: "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border border-[var(--tint-blue-bd)]",
  월세: "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-tx)] border border-[var(--tint-amber-bd)]",
};

const SEV_TINT: Record<Severity, string> = {
  danger:  "bg-[var(--tint-red-bg)] text-[var(--tint-red-tx)] border border-[var(--tint-red-bd)]",
  warning: "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-tx)] border border-[var(--tint-amber-bd)]",
  caution: "bg-[var(--tint-green-bg)] text-[var(--tint-green-tx)] border border-[var(--tint-green-bd)]",
  safe:    "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400",
};
const SEV_LABEL: Record<Severity, string> = { danger: "위험", warning: "주의", caution: "예고", safe: "안전" };

function num(s: string) { if (!s) return s; const n = parseInt(s.replace(/[^\d]/g, ""), 10); return isNaN(n) ? s : n.toLocaleString(); }
function priceStr(c: Contract): string {
  if (c.type === "월세") return `${num(c.deposit)}/${num(c.monthly)}`;
  return num(c.deposit) || "—";
}
function addressStr(c: Contract): string {
  const parts = [c.address];
  if (c.dong && !c.address.includes(`${c.dong}동`)) parts.push(`${c.dong}동`);
  if (c.ho && !c.address.includes(`${c.ho}호`)) parts.push(`${c.ho}호`);
  return parts.filter(Boolean).join(" ");
}

/** 주소 분리 — 첫 번지까지를 소재지, 그 뒤를 단지·동호 (매물 표와 동일) */
function splitAddress(full: string): { region: string; complex: string } {
  const tokens = full.trim().split(/\s+/);
  let cut = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d+(-\d+)?$/.test(tokens[i])) { cut = i; break; }
  }
  if (cut === -1 || cut === tokens.length - 1) return { region: "", complex: full };
  return { region: tokens.slice(0, cut + 1).join(" "), complex: tokens.slice(cut + 1).join(" ") };
}

function EndCell({ date }: { date: string }) {
  if (!date) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const dd = dDay(date);
  const short = date.slice(2).replace(/-/g, "/");
  if (dd < 0) return <span className="font-bold text-[var(--tint-red-tx)]">{short} ({-dd}일 지남)</span>;
  if (dd <= 60) return <span className="font-bold text-[var(--tint-red-tx)]">{short} (D-{dd})</span>;
  if (dd <= 90) return <span className="font-semibold text-amber-600 dark:text-amber-400">{short} (D-{dd})</span>;
  return <span className="text-gray-700 dark:text-gray-300">{short}</span>;
}

function MenuItem({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[12px] transition-colors ${
        active ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] font-bold" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
      <span className="material-symbols-outlined text-[14px] leading-none">{icon}</span>
      {label}
      {active && <span className="material-symbols-outlined text-[13px] leading-none ml-auto">check</span>}
    </button>
  );
}

export type ContractSort = "endAsc" | "endDesc" | "newest";
export type ContractFilter = "all" | Severity;

interface Props {
  list: { c: Contract; d: number; s: Severity }[];
  selectedId?: string;
  onRowClick: (c: Contract) => void;
  sortBy: ContractSort;
  onSortChange: (s: ContractSort) => void;
  filter: ContractFilter;
  onFilterChange: (f: ContractFilter) => void;
  onPatch: (c: Contract, patch: Partial<Contract>) => Promise<void>;
}

export default function ContractTable({ list, selectedId, onRowClick, sortBy, onSortChange, filter, onFilterChange, onPatch }: Props) {
  const [openMenu, setOpenMenu] = useState<ColKey | null>(null);
  const [hidden, setHidden] = useState<Set<ColKey>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("dealdone_contracts_hidden_cols") || "[]")); } catch { return new Set(); }
  });
  const [edit, setEdit] = useState<{ id: string; field: EditField } | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [draftA, setDraftA] = useState("");
  const [draftB, setDraftB] = useState("");
  const [undo, setUndo] = useState<{ entity: Contract; prev: Partial<Contract>; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (clickTimer.current) clearTimeout(clickTimer.current);
  }, []);

  const handleRowClick = (c: Contract) => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { if (!edit) onRowClick(c); }, 220);
  };

  const toggleHide = (k: ColKey) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem("dealdone_contracts_hidden_cols", JSON.stringify([...next])); } catch {}
      return next;
    });
    setOpenMenu(null);
  };
  const show = (k: ColKey) => !hidden.has(k);

  const startEdit = (c: Contract, field: EditField, e: React.MouseEvent) => {
    if (typeof window !== "undefined" && window.innerWidth < 640) return;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    setOpenMenu(null);
    setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setEdit({ id: c.id, field });
    switch (field) {
      case "price": setDraftA(c.deposit || ""); setDraftB(c.monthly || ""); break;
      case "tenant": setDraftA(c.tenantName || ""); break;
      case "landlord": setDraftA(c.landlordName || ""); break;
      case "start": setDraftA(c.startDate || ""); break;
      case "end": setDraftA(c.endDate || ""); break;
      case "type": setDraftA(c.type); break;
    }
  };

  const buildPatch = (c: Contract): { patch: Partial<Contract>; label: string } | null => {
    if (!edit) return null;
    const onlyNum = (s: string) => s.replace(/[^\d]/g, "");
    switch (edit.field) {
      case "price":
        return c.type === "월세"
          ? { patch: { deposit: onlyNum(draftA), monthly: onlyNum(draftB) }, label: "보증금/월세" }
          : { patch: { deposit: onlyNum(draftA) }, label: "금액" };
      case "tenant": return { patch: { tenantName: draftA.trim() }, label: "임차인" };
      case "landlord": return { patch: { landlordName: draftA.trim() }, label: "임대인" };
      case "start": return { patch: { startDate: draftA }, label: "시작일" };
      case "end": return { patch: { endDate: draftA }, label: "만기일" };
      case "type": return { patch: { type: draftA as ContractType }, label: "종류" };
    }
  };

  const commit = async (c: Contract) => {
    const built = buildPatch(c);
    if (!built) { setEdit(null); return; }
    const { patch, label } = built;
    const rec = c as unknown as Record<string, unknown>;
    if (Object.entries(patch).every(([k, v]) => rec[k] === v)) { setEdit(null); return; }
    const prev: Partial<Contract> = {};
    for (const k of Object.keys(patch)) (prev as Record<string, unknown>)[k] = rec[k] ?? "";
    await onPatch(c, patch);
    setEdit(null);
    setUndo({ entity: { ...c, ...patch }, prev, label });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 7000);
  };
  const doUndo = async () => {
    if (!undo) return;
    await onPatch(undo.entity, undo.prev);   // 필터에서 빠졌어도 복원
    setUndo(null);
  };

  const keyHandler = (c: Contract) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit(c);
    if (e.key === "Escape") setEdit(null);
  };
  const inputCls = "w-full px-2.5 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

  const popover = (c: Contract, wide: boolean, children: React.ReactNode) => {
    if (typeof document === "undefined" || !anchorRect) return null;
    const width = wide ? 340 : 260;
    let left = anchorRect.left;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (left < 12) left = 12;
    const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 96);
    return createPortal(
      <>
        <div className="fixed inset-0 z-[60]" onClick={() => setEdit(null)} />
        <div style={{ position: "fixed", top, left, width }}
          className="z-[61] bg-white dark:bg-slate-900 border-2 border-[var(--brand-blue)] rounded-xl shadow-2xl p-2 flex items-center gap-1.5"
          onClick={e => e.stopPropagation()}>
          <div className="flex-1 min-w-0">{children}</div>
          <button onClick={() => commit(c)} title="저장 (Enter)" className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue-dark)] shrink-0">
            <span className="material-symbols-outlined text-[18px]">check</span>
          </button>
          <button onClick={() => setEdit(null)} title="취소 (Esc)" className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-600 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </>,
      document.body,
    );
  };

  const isEditing = (c: Contract, f: EditField) => edit?.id === c.id && edit.field === f;

  const RIGHT_ALIGN: ColKey[] = ["start", "end", "sev", "region"];
  const Th = ({ k, w, menu }: { k: ColKey; w: string; menu: React.ReactNode }) => {
    if (!show(k)) return null;
    const alignRight = RIGHT_ALIGN.includes(k);
    return (
      <th className={`relative text-left font-medium px-2 py-2.5 ${w}`}>
        <button onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === k ? null : k); }}
          className={`flex items-center gap-0.5 rounded-md px-1 -mx-1 whitespace-nowrap transition-colors ${openMenu === k ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)]" : "hover:text-gray-700 dark:hover:text-gray-200"}`}>
          {COL_LABEL[k]}
          <span className="material-symbols-outlined text-[14px] leading-none">expand_more</span>
        </button>
        {openMenu === k && (
          <div className={`absolute ${alignRight ? "right-0" : "left-0"} top-full mt-1 z-30 w-48 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl p-1.5 font-normal normal-case`}>
            {menu}
            {k !== "address" && (<><div className="border-t border-gray-100 dark:border-slate-800 my-1" /><MenuItem icon="visibility_off" label="이 열 숨기기" onClick={() => toggleHide(k)} /></>)}
          </div>
        )}
      </th>
    );
  };

  return (
    <div>
      {hidden.size > 0 && (
        <div className="flex items-center gap-1.5 mb-2 text-[11px] text-gray-400">
          숨긴 열:
          {[...hidden].map(k => (
            <button key={k} onClick={() => toggleHide(k)}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300">
              {COL_LABEL[k]}<span className="material-symbols-outlined text-[12px]">close</span>
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--sidebar-bd)] bg-white dark:bg-slate-900">
        <table className="w-full min-w-[960px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--sidebar-bd)] text-[12px] text-gray-400 dark:text-gray-500">
              <Th k="address" w="w-[22%]" menu={
                <MenuItem icon="schedule" label="최근 등록순" active={sortBy === "newest"} onClick={() => { onSortChange("newest"); setOpenMenu(null); }} />
              } />
              <Th k="type" w="w-[6%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="price" w="w-[11%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="tenant" w="w-[10%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="landlord" w="w-[10%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="start" w="w-[10%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="end" w="w-[13%]" menu={<>
                <MenuItem icon="south" label="만기 빠른순" active={sortBy === "endAsc"} onClick={() => { onSortChange("endAsc"); setOpenMenu(null); }} />
                <MenuItem icon="north" label="만기 늦은순" active={sortBy === "endDesc"} onClick={() => { onSortChange("endDesc"); setOpenMenu(null); }} />
              </>} />
              <Th k="sev" w="w-[8%]" menu={<>
                {(["all", "danger", "warning", "caution", "safe"] as ContractFilter[]).map(f => {
                  const labels: Record<ContractFilter, string> = { all: "전체 보기", danger: "위험만", warning: "주의만", caution: "예고만", safe: "안전만" };
                  return <MenuItem key={f} icon={f === "all" ? "filter_list_off" : "filter_alt"} label={labels[f]} active={filter === f} onClick={() => { onFilterChange(f); setOpenMenu(null); }} />;
                })}
              </>} />
              <Th k="region" w="w-[14%]" menu={
                <MenuItem icon="info" label="지역별 훑기용 — 정렬은 단지·동호 열에서" onClick={() => setOpenMenu(null)} />
              } />
            </tr>
          </thead>
          <tbody>
            {list.map(({ c, s }) => {
              const selected = c.id === selectedId;
              const reg = splitAddress(addressStr(c));
              return (
                <tr key={c.id} onClick={() => handleRowClick(c)}
                  className={`border-b border-gray-100 dark:border-slate-800 last:border-0 cursor-pointer transition-colors ${
                    selected ? "bg-[var(--tint-blue-bg)] outline outline-1 -outline-offset-1 outline-[var(--brand-blue)]" : "hover:bg-gray-50/80 dark:hover:bg-slate-800/60"}`}>
                  {show("address") && (
                    <td className={`px-2 py-2.5 font-semibold truncate max-w-0 ${selected ? "text-[var(--tint-blue-tx)]" : "text-gray-900 dark:text-gray-100"}`} title={reg.complex}>{reg.complex}</td>
                  )}
                  {show("type") && (
                    <td className="px-2 py-2.5" onDoubleClick={e => startEdit(c, "type", e)}>
                      <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${TYPE_TINT[c.type]}`}>{c.type}</span>
                      {isEditing(c, "type") && popover(c, false,
                        <select autoFocus value={draftA} onChange={e => setDraftA(e.target.value)} onKeyDown={keyHandler(c)} className={inputCls}>
                          {(["전세", "월세", "매매"] as ContractType[]).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>)}
                    </td>
                  )}
                  {show("price") && (
                    <td className="px-2 py-2.5 tabular-nums text-gray-900 dark:text-gray-100 whitespace-nowrap" onDoubleClick={e => startEdit(c, "price", e)}>
                      {priceStr(c)}
                      {isEditing(c, "price") && popover(c, c.type === "월세",
                        <div className="flex items-center gap-1">
                          <input autoFocus value={draftA} onChange={e => setDraftA(e.target.value)} onKeyDown={keyHandler(c)} placeholder={c.type === "월세" ? "보증금" : "금액"} className={inputCls} />
                          {c.type === "월세" && (<><span className="text-gray-400">/</span><input value={draftB} onChange={e => setDraftB(e.target.value)} onKeyDown={keyHandler(c)} placeholder="월세" className={inputCls} /></>)}
                        </div>)}
                    </td>
                  )}
                  {show("tenant") && (
                    <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-0" onDoubleClick={e => startEdit(c, "tenant", e)}>
                      {c.tenantName || <span className="text-gray-300 dark:text-gray-600">—</span>}
                      {isEditing(c, "tenant") && popover(c, false, <input autoFocus value={draftA} onChange={e => setDraftA(e.target.value)} onKeyDown={keyHandler(c)} placeholder="임차인 이름" className={inputCls} />)}
                    </td>
                  )}
                  {show("landlord") && (
                    <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-0" onDoubleClick={e => startEdit(c, "landlord", e)}>
                      {c.landlordName || <span className="text-gray-300 dark:text-gray-600">—</span>}
                      {isEditing(c, "landlord") && popover(c, false, <input autoFocus value={draftA} onChange={e => setDraftA(e.target.value)} onKeyDown={keyHandler(c)} placeholder="임대인 이름" className={inputCls} />)}
                    </td>
                  )}
                  {show("start") && (
                    <td className="px-2 py-2.5 whitespace-nowrap text-[12px] text-gray-600 dark:text-gray-400" onDoubleClick={e => startEdit(c, "start", e)}>
                      {c.startDate ? c.startDate.slice(2).replace(/-/g, "/") : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      {isEditing(c, "start") && popover(c, true, <KoreanDatePicker value={draftA} onChange={setDraftA} accent="blue" portalId="dd-dp-portal" />)}
                    </td>
                  )}
                  {show("end") && (
                    <td className="px-2 py-2.5 whitespace-nowrap text-[12px]" onDoubleClick={e => startEdit(c, "end", e)}>
                      <EndCell date={c.endDate} />
                      {isEditing(c, "end") && popover(c, true, <KoreanDatePicker value={draftA} onChange={setDraftA} accent="blue" portalId="dd-dp-portal" />)}
                    </td>
                  )}
                  {show("sev") && (
                    <td className="px-2 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${SEV_TINT[s]}`}>{SEV_LABEL[s]}</span>
                    </td>
                  )}
                  {show("region") && (
                    <td className="px-2 py-2.5 text-gray-500 dark:text-gray-400 truncate max-w-0 text-[12px]" title={reg.region}>
                      {reg.region || <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-[10.5px] text-gray-400 dark:text-gray-500 px-1">
        💡 행 클릭 = 상세 패널 · 셀 더블클릭 = 바로 수정 (✓ 눌러야 저장)
      </p>

      {openMenu && <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} />}

      {undo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 bg-gray-900 dark:bg-slate-700 text-white text-[12px] rounded-xl px-4 py-2.5 shadow-2xl">
          <span className="material-symbols-outlined text-[16px] text-emerald-300">check_circle</span>
          {undo.label} 저장됨
          <button onClick={doUndo} className="font-bold text-blue-300 hover:text-blue-200">실행 취소</button>
          <button onClick={() => setUndo(null)} className="text-gray-400 hover:text-white">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}
    </div>
  );
}
