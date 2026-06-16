"use client";

/**
 * 손님 표 뷰 — 엑셀형 (노션 톤 v2). 매물 표와 동일 패턴.
 * - 행 클릭 → 우측 패널 / 헤더 클릭 → 정렬·필터·열숨기기 / 셀 더블클릭 → 인라인 편집(✓ 확인)
 * - 폰은 더블클릭 편집 비활성 (패널/모달로)
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  type Customer, type CustomerSide, type CustomerStatus,
  SIDE_LABELS, STATUS_LABELS, followUpDDay, followUpDDayLabel, followUpSeverity,
} from "./customer-types";
import KoreanDatePicker from "@/app/KoreanDatePicker";

type ColKey = "name" | "phone" | "side" | "budget" | "area" | "followUp" | "status";
type EditField = "name" | "phone" | "budget" | "area" | "followUp" | "side" | "status";

const COL_LABEL: Record<ColKey, string> = {
  name: "이름", phone: "연락처", side: "구분", budget: "예산", area: "희망지역", followUp: "다음 연락", status: "상태",
};

const SIDE_TINT: Record<CustomerSide, string> = {
  buyer:    "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border border-[var(--tint-blue-bd)]",
  seller:   "bg-[var(--tint-red-bg)] text-[var(--tint-red-tx)] border border-[var(--tint-red-bd)]",
  tenant:   "bg-[var(--tint-green-bg)] text-[var(--tint-green-tx)] border border-[var(--tint-green-bd)]",
  landlord: "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-tx)] border border-[var(--tint-amber-bd)]",
  etc:      "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300",
};

const STATUS_TINT: Record<CustomerStatus, string> = {
  active:  "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border border-[var(--tint-blue-bd)]",
  matched: "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-tx)] border border-[var(--tint-amber-bd)]",
  closed:  "bg-[var(--tint-green-bg)] text-[var(--tint-green-tx)] border border-[var(--tint-green-bd)]",
  lost:    "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400",
};

function FollowUpCell({ date }: { date: string }) {
  if (!date) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const dd = followUpDDay(date);
  const sev = followUpSeverity(dd);
  const label = `${date.slice(5).replace("-", "/")} (${followUpDDayLabel(dd)})`;
  if (sev === "overdue") return <span className="font-bold text-[var(--tint-red-tx)]">{label}</span>;
  if (sev === "today" || sev === "soon") return <span className="font-semibold text-amber-600 dark:text-amber-400">{label}</span>;
  return <span className="text-gray-700 dark:text-gray-300">{label}</span>;
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

export type CustSort = "followup" | "name" | "newest";
export type CustFilter = "all" | "needFollowup" | "vip" | "matched" | "lost" | "closed";

interface Props {
  list: { c: Customer; d: number; s: string }[];
  selectedId?: string;
  onRowClick: (c: Customer) => void;
  sortBy: CustSort;
  onSortChange: (s: CustSort) => void;
  filter: CustFilter;
  onFilterChange: (f: CustFilter) => void;
  colSearch: Record<string, string>;
  onColSearch: (col: string, term: string) => void;
  onPatch: (c: Customer, patch: Partial<Customer>) => Promise<void>;
}

export default function CustomerTable({ list, selectedId, onRowClick, sortBy, onSortChange, filter, onFilterChange, colSearch, onColSearch, onPatch }: Props) {
  const [openMenu, setOpenMenu] = useState<ColKey | null>(null);
  const [hidden, setHidden] = useState<Set<ColKey>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("dealdone_customers_hidden_cols") || "[]")); } catch { return new Set(); }
  });
  const [edit, setEdit] = useState<{ id: string; field: EditField } | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState("");
  const [undo, setUndo] = useState<{ entity: Customer; prev: Partial<Customer>; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (clickTimer.current) clearTimeout(clickTimer.current);
  }, []);

  const handleRowClick = (c: Customer) => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { if (!edit) onRowClick(c); }, 220);
  };

  const toggleHide = (k: ColKey) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem("dealdone_customers_hidden_cols", JSON.stringify([...next])); } catch {}
      return next;
    });
    setOpenMenu(null);
  };
  const show = (k: ColKey) => !hidden.has(k);

  const startEdit = (c: Customer, field: EditField, e: React.MouseEvent) => {
    if (typeof window !== "undefined" && window.innerWidth < 640) return;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    setOpenMenu(null);
    setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setEdit({ id: c.id, field });
    switch (field) {
      case "name": setDraft(c.name || ""); break;
      case "phone": setDraft(c.phone || ""); break;
      case "budget": setDraft(c.budget || ""); break;
      case "area": setDraft(c.preferredArea || ""); break;
      case "followUp": setDraft(c.nextFollowUp || ""); break;
      case "side": setDraft(c.side); break;
      case "status": setDraft(c.status); break;
    }
  };

  const buildPatch = (): { patch: Partial<Customer>; label: string } | null => {
    if (!edit) return null;
    switch (edit.field) {
      case "name": return { patch: { name: draft.trim() }, label: "이름" };
      case "phone": return { patch: { phone: draft.trim() }, label: "연락처" };
      case "budget": return { patch: { budget: draft.trim() }, label: "예산" };
      case "area": return { patch: { preferredArea: draft.trim() }, label: "희망지역" };
      case "followUp": return { patch: { nextFollowUp: draft }, label: "다음 연락일" };
      case "side": return { patch: { side: draft as CustomerSide }, label: "구분" };
      case "status": return { patch: { status: draft as CustomerStatus }, label: "상태" };
    }
  };

  const commit = async (c: Customer) => {
    const built = buildPatch();
    if (!built) { setEdit(null); return; }
    const { patch, label } = built;
    const rec = c as unknown as Record<string, unknown>;
    if (Object.entries(patch).every(([k, v]) => rec[k] === v)) { setEdit(null); return; }
    const prev: Partial<Customer> = {};
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

  const keyHandler = (c: Customer) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit(c);
    if (e.key === "Escape") setEdit(null);
  };
  const inputCls = "w-full px-2.5 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

  const popover = (c: Customer, wide: boolean, children: React.ReactNode) => {
    if (typeof document === "undefined" || !anchorRect) return null;
    const width = wide ? 320 : 260;
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

  const isEditing = (c: Customer, f: EditField) => edit?.id === c.id && edit.field === f;

  const searchInput = (col: ColKey) => (
    <div className="px-0.5 pb-1.5 mb-1 border-b border-gray-100 dark:border-slate-800">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-1.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400 pointer-events-none">search</span>
        <input
          value={colSearch[col] || ""}
          onChange={e => onColSearch(col, e.target.value)}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          placeholder={`${COL_LABEL[col]} 검색`}
          className="w-full pl-6 pr-6 py-1.5 text-[12px] rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        {colSearch[col] && (
          <button onClick={e => { e.stopPropagation(); onColSearch(col, ""); }} title="검색 지우기"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        )}
      </div>
    </div>
  );

  const RIGHT_ALIGN: ColKey[] = ["followUp", "status"];
  const Th = ({ k, w, menu }: { k: ColKey; w: string; menu: React.ReactNode }) => {
    if (!show(k)) return null;
    const alignRight = RIGHT_ALIGN.includes(k);
    return (
      <th className={`relative text-left font-medium px-2 py-2.5 ${w}`}>
        <button onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === k ? null : k); }}
          className={`flex items-center gap-0.5 rounded-md px-1 -mx-1 whitespace-nowrap transition-colors ${openMenu === k || colSearch[k] ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] font-bold" : "hover:text-gray-700 dark:hover:text-gray-200"}`}>
          {COL_LABEL[k]}
          <span className="material-symbols-outlined text-[14px] leading-none">{colSearch[k] ? "search" : "expand_more"}</span>
        </button>
        {openMenu === k && (
          <div className={`absolute ${alignRight ? "right-0" : "left-0"} top-full mt-1 z-30 w-48 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl p-1.5 font-normal normal-case`}>
            {menu}
            <div className="border-t border-gray-100 dark:border-slate-800 my-1" />
            <MenuItem icon="visibility_off" label="이 열 숨기기" onClick={() => toggleHide(k)} />
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
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--sidebar-bd)] text-[12px] text-gray-400 dark:text-gray-500">
              <Th k="name" w="w-[16%]" menu={<>
                {searchInput("name")}
                <MenuItem icon="sort_by_alpha" label="이름순" active={sortBy === "name"} onClick={() => { onSortChange("name"); setOpenMenu(null); }} />
                <MenuItem icon="schedule" label="최근 등록순" active={sortBy === "newest"} onClick={() => { onSortChange("newest"); setOpenMenu(null); }} />
                <MenuItem icon="star" label="VIP만 보기" active={filter === "vip"} onClick={() => { onFilterChange("vip"); setOpenMenu(null); }} />
              </>} />
              <Th k="phone" w="w-[13%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="side" w="w-[7%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="budget" w="w-[19%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="area" w="w-[21%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="followUp" w="w-[13%]" menu={<MenuItem icon="event" label="연락 임박순" active={sortBy === "followup"} onClick={() => { onSortChange("followup"); setOpenMenu(null); }} />} />
              <Th k="status" w="w-[10%]" menu={<>
                {(["all", "needFollowup", "matched", "lost", "closed"] as CustFilter[]).map(f => {
                  const labels: Record<CustFilter, string> = { all: "전체 보기", needFollowup: "후속 연락 필요", vip: "VIP만", matched: "매칭만", lost: "이탈만", closed: "거래 완료만" };
                  return (
                    <MenuItem key={f} icon={f === "all" ? "filter_list_off" : "filter_alt"} label={labels[f]}
                      active={filter === f} onClick={() => { onFilterChange(f); setOpenMenu(null); }} />
                  );
                })}
              </>} />
            </tr>
          </thead>
          <tbody>
            {list.map(({ c }) => {
              const selected = c.id === selectedId;
              return (
                <tr key={c.id} onClick={() => handleRowClick(c)}
                  className={`border-b border-gray-100 dark:border-slate-800 last:border-0 cursor-pointer transition-colors ${
                    selected ? "bg-[var(--tint-blue-bg)] outline outline-1 -outline-offset-1 outline-[var(--brand-blue)]" : "hover:bg-gray-50/80 dark:hover:bg-slate-800/60"}`}>
                  {show("name") && (
                    <td className={`px-2 py-2.5 font-semibold truncate max-w-0 ${selected ? "text-[var(--tint-blue-tx)]" : "text-gray-900 dark:text-gray-100"}`} onDoubleClick={e => startEdit(c, "name", e)}>
                      {c.name || <span className="text-gray-300 dark:text-gray-600">(이름없음)</span>}
                      {c.vip && <span className="text-amber-400 ml-0.5">★</span>}
                      {isEditing(c, "name") && popover(c, false, <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={keyHandler(c)} placeholder="이름" className={inputCls} />)}
                    </td>
                  )}
                  {show("phone") && (
                    <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-0 tabular-nums" onDoubleClick={e => startEdit(c, "phone", e)}>
                      {c.phone || <span className="text-gray-300 dark:text-gray-600">—</span>}
                      {isEditing(c, "phone") && popover(c, false, <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={keyHandler(c)} placeholder="010-0000-0000" className={inputCls} />)}
                    </td>
                  )}
                  {show("side") && (
                    <td className="px-2 py-2.5" onDoubleClick={e => startEdit(c, "side", e)}>
                      <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${SIDE_TINT[c.side]}`}>{SIDE_LABELS[c.side]}</span>
                      {isEditing(c, "side") && popover(c, false,
                        <select autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={keyHandler(c)} className={inputCls}>
                          {(Object.keys(SIDE_LABELS) as CustomerSide[]).map(s => <option key={s} value={s}>{SIDE_LABELS[s]}</option>)}
                        </select>
                      )}
                    </td>
                  )}
                  {show("budget") && (
                    <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-0" onDoubleClick={e => startEdit(c, "budget", e)} title={c.budget}>
                      {c.budget || <span className="text-gray-300 dark:text-gray-600">—</span>}
                      {isEditing(c, "budget") && popover(c, true, <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={keyHandler(c)} placeholder="예: 5억 이하" className={inputCls} />)}
                    </td>
                  )}
                  {show("area") && (
                    <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-0" onDoubleClick={e => startEdit(c, "area", e)} title={c.preferredArea}>
                      {c.preferredArea || <span className="text-gray-300 dark:text-gray-600">—</span>}
                      {isEditing(c, "area") && popover(c, true, <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={keyHandler(c)} placeholder="희망 단지/지역" className={inputCls} />)}
                    </td>
                  )}
                  {show("followUp") && (
                    <td className="px-2 py-2.5 whitespace-nowrap text-[12px]" onDoubleClick={e => startEdit(c, "followUp", e)}>
                      <FollowUpCell date={c.nextFollowUp} />
                      {isEditing(c, "followUp") && popover(c, true, <KoreanDatePicker value={draft} onChange={setDraft} accent="blue" portalId="dd-dp-portal" />)}
                    </td>
                  )}
                  {show("status") && (
                    <td className="px-2 py-2.5" onDoubleClick={e => startEdit(c, "status", e)}>
                      <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${STATUS_TINT[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                      {isEditing(c, "status") && popover(c, false,
                        <select autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={keyHandler(c)} className={inputCls}>
                          {(Object.keys(STATUS_LABELS) as CustomerStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      )}
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
