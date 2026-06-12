"use client";

/**
 * 매물 표 뷰 — 엑셀형 (노션 톤 v2)
 *
 * 1·2단계: 행 클릭 → 우측 패널 / 단계 자동 배지 / 만기 임박 색
 * 3단계: 헤더 클릭 → 노션식 메뉴 (정렬·필터·열 숨기기, 숨긴 열은 칩으로 복원)
 * 4단계: 더블클릭 인라인 편집 (PC 전용)
 *   - 텍스트(가격·집주인·임차인) / 달력(만기일·잔금일, 한국어 캘린더) / 드롭다운(거래·유형)
 *   - ✓ 확인을 눌러야 저장 (Enter=확인, Esc=취소) → 저장 후 "실행 취소" 토스트
 *   - 단지·동호(수정 모달 전용)·단계(자동 계산)는 편집 불가
 */

import { useState, useRef, useEffect } from "react";
import type { Property, PropertyType, DealType } from "@/lib/properties-db";
import { dDay } from "@/app/expiry/contracts";
import { fmtNum, PROPERTY_TYPES, DEAL_TYPES } from "./helpers";
import KoreanDatePicker from "@/app/KoreanDatePicker";

type SortKey = "newest" | "price_asc" | "price_desc" | "lease_end" | "balance" | "dongho";
type PriceRange = "all" | "u1" | "1to2" | "2to3" | "3to5" | "o5";
type ColKey = "address" | "deal" | "price" | "ptype" | "owner" | "tenant" | "leaseEnd" | "balance" | "stage";
type EditField = "price" | "owner" | "tenant" | "leaseEnd" | "balance" | "deal" | "ptype";

const COL_LABEL: Record<ColKey, string> = {
  address: "단지·동호", deal: "거래", price: "가격(만)", ptype: "유형",
  owner: "집주인", tenant: "임차인", leaseEnd: "만기일", balance: "잔금일", stage: "단계",
};

const PRICE_RANGES: { key: PriceRange; label: string }[] = [
  { key: "all", label: "전체 가격" }, { key: "u1", label: "1억 이하" }, { key: "1to2", label: "1~2억" },
  { key: "2to3", label: "2~3억" }, { key: "3to5", label: "3~5억" }, { key: "o5", label: "5억 이상" },
];

/* 거래 종류 배지 — 노션 틴트 */
const DEAL_TINT: Record<string, string> = {
  "매매": "bg-[var(--tint-red-bg)] text-[var(--tint-red-tx)] border border-[var(--tint-red-bd)]",
  "전세": "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border border-[var(--tint-blue-bd)]",
  "월세": "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-tx)] border border-[var(--tint-amber-bd)]",
};

/* 진행 단계 — 날짜 기반 자동 계산 (수정 불가 열) */
export function stageOf(p: Property): { label: string; cls: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (p.status === "closed")
    return { label: "거래완료", cls: "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400" };
  if (p.balanceDate && p.balanceDate <= today)
    return { label: "잔금 지남", cls: "bg-[var(--tint-red-bg)] text-[var(--tint-red-tx)] border border-[var(--tint-red-bd)]" };
  if (p.contractDate || p.downPaymentDate || p.balanceDate)
    return { label: "계약 진행", cls: "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border border-[var(--tint-blue-bd)]" };
  return { label: "미계약", cls: "bg-[var(--tint-green-bg)] text-[var(--tint-green-tx)] border border-[var(--tint-green-bd)]" };
}

function priceStr(p: Property): string {
  if (p.dealType === "월세") return `${fmtNum(p.price)}/${fmtNum(p.monthly)}`;
  return fmtNum(p.price);
}

function addressStr(p: Property): string {
  return [p.address, p.dong && `${p.dong}동`, p.ho && `${p.ho}호`].filter(Boolean).join(" ");
}

function LeaseEndCell({ date }: { date?: string }) {
  if (!date) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const dd = dDay(date);
  const short = date.slice(5).replace("-", "/");
  if (dd < 0) return <span className="font-bold text-[var(--tint-red-tx)]">{short} ({-dd}일 지남)</span>;
  if (dd <= 7) return <span className="font-bold text-[var(--tint-red-tx)]">{short} (D-{dd})</span>;
  if (dd <= 30) return <span className="font-semibold text-amber-600 dark:text-amber-400">{short} (D-{dd})</span>;
  return <span className="text-gray-700 dark:text-gray-300">{short}</span>;
}

function DateCell({ date }: { date?: string }) {
  if (!date) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return <span className="text-gray-700 dark:text-gray-300">{date.slice(5).replace("-", "/")}</span>;
}

/* 헤더 메뉴 한 줄 */
function MenuItem({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[12px] transition-colors ${
        active ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] font-bold" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"
      }`}
    >
      <span className="material-symbols-outlined text-[14px] leading-none">{icon}</span>
      {label}
      {active && <span className="material-symbols-outlined text-[13px] leading-none ml-auto">check</span>}
    </button>
  );
}

interface Props {
  list: Property[];
  selectedId?: string;
  onRowClick: (p: Property) => void;
  /* 3단계 — 헤더 메뉴용 정렬·필터 (페이지 상태 공유) */
  sortBy: SortKey;
  onSortChange: (s: SortKey) => void;
  filterType: "all" | DealType;
  onFilterTypeChange: (t: "all" | DealType) => void;
  filterPropType: "all" | PropertyType;
  onFilterPropTypeChange: (t: "all" | PropertyType) => void;
  priceRange: PriceRange;
  onPriceRangeChange: (r: PriceRange) => void;
  /* 4단계 — 인라인 편집 저장 */
  onPatch: (p: Property, patch: Partial<Property>) => Promise<void>;
}

export default function PropertyTable({
  list, selectedId, onRowClick,
  sortBy, onSortChange, filterType, onFilterTypeChange,
  filterPropType, onFilterPropTypeChange, priceRange, onPriceRangeChange,
  onPatch,
}: Props) {
  const [openMenu, setOpenMenu] = useState<ColKey | null>(null);
  const [hidden, setHidden] = useState<Set<ColKey>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("dealdone_properties_hidden_cols") || "[]")); } catch { return new Set(); }
  });
  const [edit, setEdit] = useState<{ id: string; field: EditField } | null>(null);
  const [draftA, setDraftA] = useState("");   // 주 값 (텍스트/날짜/선택)
  const [draftB, setDraftB] = useState("");   // 월세일 때 월세액
  const [undo, setUndo] = useState<{ id: string; prev: Partial<Property>; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const toggleHide = (k: ColKey) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem("dealdone_properties_hidden_cols", JSON.stringify([...next])); } catch {}
      return next;
    });
    setOpenMenu(null);
  };

  const show = (k: ColKey) => !hidden.has(k);

  /* ── 인라인 편집 ── */
  const startEdit = (p: Property, field: EditField) => {
    if (typeof window !== "undefined" && window.innerWidth < 640) return;  // 폰은 패널/모달로
    setOpenMenu(null);
    setEdit({ id: p.id, field });
    switch (field) {
      case "price":    setDraftA(p.price || ""); setDraftB(p.monthly || ""); break;
      case "owner":    setDraftA(p.ownerName || ""); break;
      case "tenant":   setDraftA(p.tenantName || ""); break;
      case "leaseEnd": setDraftA(p.leaseEndDate || ""); break;
      case "balance":  setDraftA(p.balanceDate || ""); break;
      case "deal":     setDraftA(p.dealType); break;
      case "ptype":    setDraftA(p.propertyType); break;
    }
  };

  const buildPatch = (p: Property): { patch: Partial<Property>; label: string } | null => {
    if (!edit) return null;
    const num = (s: string) => s.replace(/[^\d]/g, "");
    switch (edit.field) {
      case "price": {
        const price = num(draftA);
        const monthly = num(draftB);
        if (p.dealType === "월세") return { patch: { price, monthly }, label: "가격" };
        return { patch: { price }, label: "가격" };
      }
      case "owner":    return { patch: { ownerName: draftA.trim() }, label: "집주인" };
      case "tenant":   return { patch: { tenantName: draftA.trim() }, label: "임차인" };
      case "leaseEnd": return { patch: { leaseEndDate: draftA }, label: "만기일" };
      case "balance":  return { patch: { balanceDate: draftA }, label: "잔금일" };
      case "deal":     return { patch: { dealType: draftA as DealType }, label: "거래 종류" };
      case "ptype":    return { patch: { propertyType: draftA as PropertyType }, label: "매물 유형" };
    }
  };

  const commit = async (p: Property) => {
    const built = buildPatch(p);
    if (!built) { setEdit(null); return; }
    const { patch, label } = built;
    // 변경 없으면 그냥 닫기
    const pRec = p as unknown as Record<string, unknown>;
    if (Object.entries(patch).every(([k, v]) => pRec[k] === v)) { setEdit(null); return; }
    const prev: Partial<Property> = {};
    for (const k of Object.keys(patch)) (prev as Record<string, unknown>)[k] = pRec[k] ?? "";
    await onPatch(p, patch);
    setEdit(null);
    setUndo({ id: p.id, prev, label });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 7000);
  };

  const doUndo = async () => {
    if (!undo) return;
    const cur = list.find(x => x.id === undo.id);
    if (cur) await onPatch(cur, undo.prev);
    setUndo(null);
  };

  /* 편집 셀 공통 래퍼 — ✓ 확인 / ✕ 취소 */
  const EditWrap = ({ p, children }: { p: Property; children: React.ReactNode }) => (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      <div className="flex-1 min-w-0">{children}</div>
      <button onClick={() => commit(p)} title="저장 (Enter)"
        className="w-6 h-6 flex items-center justify-center rounded-md bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue-dark)] shrink-0">
        <span className="material-symbols-outlined text-[14px]">check</span>
      </button>
      <button onClick={() => setEdit(null)} title="취소 (Esc)"
        className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 dark:border-slate-600 text-gray-400 hover:text-gray-700 shrink-0">
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>
  );

  const keyHandler = (p: Property) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit(p);
    if (e.key === "Escape") setEdit(null);
  };

  const inputCls = "w-full px-1.5 py-1 text-[12px] rounded-md border border-[var(--brand-blue)] bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

  const isEditing = (p: Property, f: EditField) => edit?.id === p.id && edit.field === f;

  /* 헤더 th — 클릭 시 메뉴 */
  const Th = ({ k, w, menu }: { k: ColKey; w: string; menu: React.ReactNode }) => {
    if (!show(k)) return null;
    return (
      <th className={`relative text-left font-medium px-2 py-2.5 ${w}`}>
        <button
          onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === k ? null : k); }}
          className={`flex items-center gap-0.5 rounded-md px-1 -mx-1 transition-colors ${openMenu === k ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)]" : "hover:text-gray-700 dark:hover:text-gray-200"}`}
        >
          {COL_LABEL[k]}
          <span className="material-symbols-outlined text-[14px] leading-none">expand_more</span>
        </button>
        {openMenu === k && (
          <div className="absolute left-0 top-full mt-1 z-30 w-44 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl p-1.5 font-normal normal-case">
            {menu}
            {k !== "address" && (
              <>
                <div className="border-t border-gray-100 dark:border-slate-800 my-1" />
                <MenuItem icon="visibility_off" label="이 열 숨기기" onClick={() => toggleHide(k)} />
              </>
            )}
          </div>
        )}
      </th>
    );
  };

  return (
    <div>
      {/* 숨긴 열 복원 칩 */}
      {hidden.size > 0 && (
        <div className="flex items-center gap-1.5 mb-2 text-[11px] text-gray-400">
          숨긴 열:
          {[...hidden].map(k => (
            <button key={k} onClick={() => toggleHide(k)}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300">
              {COL_LABEL[k]}
              <span className="material-symbols-outlined text-[12px]">close</span>
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--sidebar-bd)] bg-white dark:bg-slate-900">
        <table className="w-full min-w-[880px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--sidebar-bd)] text-[12px] text-gray-400 dark:text-gray-500">
              <Th k="address" w="w-[26%]" menu={<>
                <MenuItem icon="schedule" label="최신 등록순" active={sortBy === "newest"} onClick={() => { onSortChange("newest"); setOpenMenu(null); }} />
                <MenuItem icon="apartment" label="동·호순" active={sortBy === "dongho"} onClick={() => { onSortChange("dongho"); setOpenMenu(null); }} />
              </>} />
              <Th k="deal" w="w-[7%]" menu={<>
                {(["all", ...DEAL_TYPES] as const).map(t => (
                  <MenuItem key={t} icon={t === "all" ? "filter_list_off" : "filter_alt"} label={t === "all" ? "전체 보기" : `${t}만 보기`}
                    active={filterType === t} onClick={() => { onFilterTypeChange(t as "all" | DealType); setOpenMenu(null); }} />
                ))}
              </>} />
              <Th k="price" w="w-[11%]" menu={<>
                <MenuItem icon="south" label="낮은 가격부터" active={sortBy === "price_asc"} onClick={() => { onSortChange("price_asc"); setOpenMenu(null); }} />
                <MenuItem icon="north" label="높은 가격부터" active={sortBy === "price_desc"} onClick={() => { onSortChange("price_desc"); setOpenMenu(null); }} />
                <div className="border-t border-gray-100 dark:border-slate-800 my-1" />
                {PRICE_RANGES.map(r => (
                  <MenuItem key={r.key} icon="filter_alt" label={r.label} active={priceRange === r.key}
                    onClick={() => { onPriceRangeChange(r.key); setOpenMenu(null); }} />
                ))}
              </>} />
              <Th k="ptype" w="w-[8%]" menu={<>
                <MenuItem icon="filter_list_off" label="전체 보기" active={filterPropType === "all"} onClick={() => { onFilterPropTypeChange("all"); setOpenMenu(null); }} />
                {PROPERTY_TYPES.map(t => (
                  <MenuItem key={t} icon="filter_alt" label={`${t}만 보기`} active={filterPropType === t}
                    onClick={() => { onFilterPropTypeChange(t); setOpenMenu(null); }} />
                ))}
              </>} />
              <Th k="owner" w="w-[9%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="tenant" w="w-[9%]" menu={<MenuItem icon="info" label="더블클릭으로 수정" onClick={() => setOpenMenu(null)} />} />
              <Th k="leaseEnd" w="w-[12%]" menu={<MenuItem icon="event_busy" label="만기 빠른순" active={sortBy === "lease_end"} onClick={() => { onSortChange("lease_end"); setOpenMenu(null); }} />} />
              <Th k="balance" w="w-[10%]" menu={<MenuItem icon="account_balance_wallet" label="잔금 빠른순" active={sortBy === "balance"} onClick={() => { onSortChange("balance"); setOpenMenu(null); }} />} />
              <Th k="stage" w="w-[8%]" menu={<MenuItem icon="info" label="날짜로 자동 계산됩니다" onClick={() => setOpenMenu(null)} />} />
            </tr>
          </thead>
          <tbody>
            {list.map(p => {
              const stage = stageOf(p);
              const selected = p.id === selectedId;
              return (
                <tr
                  key={p.id}
                  onClick={() => { if (!edit) onRowClick(p); }}
                  className={`border-b border-gray-100 dark:border-slate-800 last:border-0 cursor-pointer transition-colors ${
                    selected
                      ? "bg-[var(--tint-blue-bg)] outline outline-1 -outline-offset-1 outline-[var(--brand-blue)]"
                      : "hover:bg-gray-50/80 dark:hover:bg-slate-800/60"
                  }`}
                >
                  {show("address") && (
                    <td className={`px-2 py-2.5 font-semibold truncate max-w-0 ${selected ? "text-[var(--tint-blue-tx)]" : "text-gray-900 dark:text-gray-100"}`} title={addressStr(p)}>
                      {addressStr(p)}
                    </td>
                  )}
                  {show("deal") && (
                    <td className="px-2 py-2.5" onDoubleClick={() => startEdit(p, "deal")}>
                      {isEditing(p, "deal") ? (
                        <EditWrap p={p}>
                          <select autoFocus value={draftA} onChange={e => setDraftA(e.target.value)} onKeyDown={keyHandler(p)} className={inputCls}>
                            {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </EditWrap>
                      ) : (
                        <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${DEAL_TINT[p.dealType] || "bg-gray-100 text-gray-600"}`}>
                          {p.dealType}
                        </span>
                      )}
                    </td>
                  )}
                  {show("price") && (
                    <td className="px-2 py-2.5 tabular-nums text-gray-900 dark:text-gray-100 whitespace-nowrap" onDoubleClick={() => startEdit(p, "price")}>
                      {isEditing(p, "price") ? (
                        <EditWrap p={p}>
                          <div className="flex items-center gap-1">
                            <input autoFocus value={draftA} onChange={e => setDraftA(e.target.value)} onKeyDown={keyHandler(p)} placeholder={p.dealType === "월세" ? "보증금" : "가격"} className={inputCls} />
                            {p.dealType === "월세" && (
                              <>
                                <span className="text-gray-400">/</span>
                                <input value={draftB} onChange={e => setDraftB(e.target.value)} onKeyDown={keyHandler(p)} placeholder="월세" className={inputCls} />
                              </>
                            )}
                          </div>
                        </EditWrap>
                      ) : priceStr(p)}
                    </td>
                  )}
                  {show("ptype") && (
                    <td className="px-2 py-2.5 text-gray-600 dark:text-gray-400 truncate max-w-0" onDoubleClick={() => startEdit(p, "ptype")}>
                      {isEditing(p, "ptype") ? (
                        <EditWrap p={p}>
                          <select autoFocus value={draftA} onChange={e => setDraftA(e.target.value)} onKeyDown={keyHandler(p)} className={inputCls}>
                            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </EditWrap>
                      ) : p.propertyType}
                    </td>
                  )}
                  {show("owner") && (
                    <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-0" onDoubleClick={() => startEdit(p, "owner")}>
                      {isEditing(p, "owner") ? (
                        <EditWrap p={p}>
                          <input autoFocus value={draftA} onChange={e => setDraftA(e.target.value)} onKeyDown={keyHandler(p)} className={inputCls} />
                        </EditWrap>
                      ) : (p.ownerName || <span className="text-gray-300 dark:text-gray-600">—</span>)}
                    </td>
                  )}
                  {show("tenant") && (
                    <td className="px-2 py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-0" onDoubleClick={() => startEdit(p, "tenant")}>
                      {isEditing(p, "tenant") ? (
                        <EditWrap p={p}>
                          <input autoFocus value={draftA} onChange={e => setDraftA(e.target.value)} onKeyDown={keyHandler(p)} className={inputCls} />
                        </EditWrap>
                      ) : (p.tenantName || <span className="text-gray-300 dark:text-gray-600">—</span>)}
                    </td>
                  )}
                  {show("leaseEnd") && (
                    <td className="px-2 py-2.5 whitespace-nowrap text-[12px]" onDoubleClick={() => startEdit(p, "leaseEnd")}>
                      {isEditing(p, "leaseEnd") ? (
                        <EditWrap p={p}>
                          <KoreanDatePicker value={draftA} onChange={setDraftA} accent="blue" portalId="dd-dp-portal" />
                        </EditWrap>
                      ) : <LeaseEndCell date={p.leaseEndDate} />}
                    </td>
                  )}
                  {show("balance") && (
                    <td className="px-2 py-2.5 whitespace-nowrap text-[12px]" onDoubleClick={() => startEdit(p, "balance")}>
                      {isEditing(p, "balance") ? (
                        <EditWrap p={p}>
                          <KoreanDatePicker value={draftA} onChange={setDraftA} accent="blue" portalId="dd-dp-portal" />
                        </EditWrap>
                      ) : <DateCell date={p.balanceDate} />}
                    </td>
                  )}
                  {show("stage") && (
                    <td className="px-2 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${stage.cls}`}>
                        {stage.label}
                      </span>
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

      {/* 헤더 메뉴 바깥 클릭 시 닫기 */}
      {openMenu && <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} />}

      {/* 저장 토스트 + 실행 취소 */}
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
