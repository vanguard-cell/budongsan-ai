"use client";

/**
 * 고객명단 — 단지 한 곳의 세대를 엑셀 같은 표 하나로 (건의 #143)
 *
 * 한 줄 = 한 세대(동·호). 세 곳에서 모아 보여줌:
 *  - 매물관리에 있는 세대 → [매물] (누르면 그 매물로 이동)
 *  - 만기관리에 있는 세대 → [만기] (누르면 그 계약으로 이동)
 *  - 어디에도 없는 세대   → [명단] — 명부 엑셀로 올리고, 칸을 눌러 바로 고쳐 씀
 *
 * 명부 엑셀을 올리면 매물·만기·명단에 이미 있는 세대는 건너뛰고 없는 세대만 추가한다.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth-context";
import { subscribeProperties, type Property } from "@/lib/properties-db";
import { subscribeContracts } from "@/lib/contracts-db";
import type { Contract } from "@/app/expiry/contracts";
import {
  subscribeRoster, updateRosterField, addRosterUnits, deleteRosterUnit, setRosterUniqueNo,
  complexKey, complexOf, unitKey, dongHoOf,
  type RosterUnit, type RosterEditField,
} from "@/lib/roster-db";
import { parseRosterFile, type ParsedRoster } from "./roster-import";
import { downloadVcf, type VcardContact } from "@/lib/vcard";

const SHOW_FLOOR_COL = false;
const COMPLEX_STORAGE = "roster_complex";

/** "11블럭" 단지인데 동이 12xx처럼 다른 블럭 번호로 시작하면 이 단지 명단에서 뺀다 (화면에서만 숨김) */
function otherBlockDong(complexName: string, dong: string): boolean {
  const b = (complexName || "").match(/(\d+)\s*블[럭록]/);
  const d = (dong || "").replace(/\D/g, "");
  if (!b || d.length < 4) return false;
  return d.slice(0, d.length - 2) !== b[1];
}

interface Row {
  key: string;
  dong: string;
  ho: string;
  prop?: Property;
  contract?: Contract;
  roster?: RosterUnit;
}

type SourceFilter = "all" | "roster" | "prop" | "contract";

/** 호수 → 층 ("1201" → 12, "401" → 4, "비1022" → 지하) */
function floorOf(ho: string, isShop = false): string {
  if (/^(비|B|지하)/.test(ho)) return "지하";
  const n = parseInt(ho.replace(/\D/g, ""), 10);
  if (!isFinite(n) || n < 100) return "";
  // 상가는 1033호 = 1층 033호처럼 끝 세 자리가 호수
  if (isShop && n >= 1000) return String(Math.floor(n / 1000));
  return String(Math.floor(n / 100));
}
const hoNum = (ho: string) => {
  const n = parseInt(ho.replace(/\D/g, ""), 10);
  return /^(비|B|지하)/.test(ho) ? -n : (isFinite(n) ? n : 0);
};

/** 같은 세대에 여러 건이면 진행 중인 것, 그중 최신 */
function pickProp(a: Property | undefined, b: Property): Property {
  if (!a) return b;
  if ((a.status === "active") !== (b.status === "active")) return a.status === "active" ? a : b;
  return (b.createdAt || 0) > (a.createdAt || 0) ? b : a;
}
function pickContract(a: Contract | undefined, b: Contract): Contract {
  if (!a) return b;
  if ((a.status === "active") !== (b.status === "active")) return a.status === "active" ? a : b;
  return (b.endDate || "") > (a.endDate || "") ? b : a;
}

/** 화면에 보일 값 — 매물 → 만기 → 명단 순으로 먼저 있는 값 */
function view(r: Row) {
  const p = r.prop, c = r.contract, u = r.roster;
  const first = (...v: (string | undefined)[]) => v.find(x => x && x.trim()) || "";
  return {
    unitType: first(p?.unitType, c?.unitType, u?.unitType),
    area: first(p?.area, c?.area, u?.area),
    direction: first(p?.direction, c?.direction, u?.direction),
    ownerName: first(p?.ownerName, c?.landlordName, u?.ownerName),
    ownerPhone: first(p?.ownerPhone, c?.landlordPhone, u?.ownerPhone),
    tenantName: first(p?.tenantName, c?.tenantName, u?.tenantName),
    tenantPhone: first(p?.tenantPhone, c?.tenantPhone, u?.tenantPhone),
    leaseEndDate: first(p?.leaseEndDate, c?.endDate, u?.leaseEndDate).slice(0, 10),
    memo: u?.memo || "",
  };
}

export default function RosterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [roster, setRoster] = useState<RosterUnit[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);

  const [complexPref, setComplexState] = useState<string>(() => {
    try { return localStorage.getItem(COMPLEX_STORAGE) || ""; } catch { return ""; }
  });
  const setComplex = (k: string) => {
    setComplexState(k);
    setDong("all");
    try { localStorage.setItem(COMPLEX_STORAGE, k); } catch { /* 저장 불가 환경은 무시 */ }
  };
  const [dong, setDong] = useState<string>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  // 표 크기(폰에서 한눈에 보기): 1 = 보통, 0.7 = 작게, 0.5 = 더 작게
  const [tableZoom, setTableZoom] = useState(1);
  useEffect(() => {
    try { const z = Number(localStorage.getItem("rosterTableZoom")); if (z === 0.7 || z === 0.5) setTableZoom(z); } catch {}
  }, []);
  // 브라우저마다 zoom 안의 % 너비를 다르게 계산해서, 화면 폭을 px로 재서 직접 지정
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const tableInnerRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  const [innerH, setInnerH] = useState(0);
  useEffect(() => {
    const el = tableWrapRef.current;
    const inner = tableInnerRef.current;
    if (!el || !inner) return;
    const update = () => { setWrapW(el.clientWidth); setInnerH(inner.offsetHeight); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(inner);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  const cycleZoom = () => {
    const next = tableZoom === 1 ? 0.7 : tableZoom === 0.7 ? 0.5 : 1;
    setTableZoom(next);
    try { localStorage.setItem("rosterTableZoom", String(next)); } catch {}
  };
  const [query, setQuery] = useState("");

  const [preview, setPreview] = useState<{ parsed: ParsedRoster; fresh: ParsedRoster["units"]; inPropOrContract: number; inRoster: number; dupInFile: number; uniqueOnly: ParsedRoster["units"]; uniqueFill: { id: string; uniqueNo: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/roster");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeProperties(user.agencyId, setProperties);
    const u2 = subscribeContracts(user.agencyId, setContracts);
    const u3 = subscribeRoster(user.agencyId, list => { setRoster(list); setRosterLoaded(true); });
    return () => { u1(); u2(); u3(); };
  }, [user]);

  /* 단지 목록 — 동·호수가 있는 단지만 (세대 표를 만들 수 있는 곳) */
  const complexes = useMemo(() => {
    const m = new Map<string, { name: string; units: Set<string> }>();
    const add = (name: string, dong: string, ho: string) => {
      if (!name || !ho || otherBlockDong(name, dong)) return;
      const k = complexKey(name);
      if (!m.has(k)) m.set(k, { name, units: new Set() });
      m.get(k)!.units.add(`${dong}|${ho}`);
    };
    for (const p of properties) { const dh = dongHoOf(p.address, p.dong, p.ho); add(complexOf(p.address, p.dong, p.ho), dh.dong, dh.ho); }
    for (const c of contracts) { const dh = dongHoOf(c.address, c.dong, c.ho); add(complexOf(c.address, c.dong, c.ho), dh.dong, dh.ho); }
    for (const u of roster) add(u.complex, u.dong, u.ho);
    return [...m.entries()]
      .map(([key, v]) => ({ key, name: v.name, count: v.units.size }))
      .sort((a, b) => b.count - a.count);
  }, [properties, contracts, roster]);

  // 고른 단지가 없으면 건의 #143 단지(12블럭 오피스텔), 그것도 없으면 세대가 가장 많은 단지
  const complex = useMemo(() => {
    if (complexPref && complexes.some(c => c.key === complexPref)) return complexPref;
    return (complexes.find(c => c.key.includes("그랑파사쥬12블럭(오피스텔)")) || complexes[0])?.key || "";
  }, [complexes, complexPref]);

  const complexName = complexes.find(c => c.key === complex)?.name || "";

  /* 선택한 단지의 세대 줄 */
  const allRows = useMemo(() => {
    const m = new Map<string, Row>();
    const row = (dong: string, ho: string) => {
      const k = unitKey(complex, dong, ho);
      if (!m.has(k)) m.set(k, { key: k, dong, ho });
      return m.get(k)!;
    };
    for (const p of properties) {
      if (complexKey(complexOf(p.address, p.dong, p.ho)) !== complex) continue;
      const dh = dongHoOf(p.address, p.dong, p.ho); if (!dh.ho || otherBlockDong(complexName, dh.dong)) continue;
      const r = row(dh.dong, dh.ho); r.prop = pickProp(r.prop, p);
    }
    for (const c of contracts) {
      if (complexKey(complexOf(c.address, c.dong, c.ho)) !== complex) continue;
      const dh = dongHoOf(c.address, c.dong, c.ho); if (!dh.ho || otherBlockDong(complexName, dh.dong)) continue;
      const r = row(dh.dong, dh.ho); r.contract = pickContract(r.contract, c);
    }
    for (const u of roster) {
      if (complexKey(u.complex) !== complex || otherBlockDong(complexName, u.dong)) continue;
      const r = row(u.dong, u.ho); if (!r.roster) r.roster = u;
    }
    return [...m.values()].sort((a, b) =>
      (Number(a.dong) || 0) - (Number(b.dong) || 0) || hoNum(a.ho) - hoNum(b.ho));
  }, [properties, contracts, roster, complex, complexName]);

  const dongs = useMemo(() => [...new Set(allRows.map(r => r.dong))].sort((a, b) => (Number(a) || 0) - (Number(b) || 0)), [allRows]);

  const rows = useMemo(() => {
    const q = query.trim().replace(/\s+/g, "");
    return allRows.filter(r => {
      if (dong !== "all" && r.dong !== dong) return false;
      if (source === "roster" && (r.prop || r.contract)) return false;
      if (source === "prop" && !r.prop) return false;
      if (source === "contract" && !r.contract) return false;
      if (q) {
        const v = view(r);
        const hay = [r.ho, `${r.dong}-${r.ho}`, v.ownerName, v.ownerPhone, v.tenantName, v.tenantPhone, v.memo, v.unitType].join(" ").replace(/\s+/g, "");
        if (!hay.includes(q) && !hay.replace(/-/g, "").includes(q.replace(/-/g, ""))) return false;
      }
      return true;
    });
  }, [allRows, dong, source, query]);

  const counts = useMemo(() => {
    const inDong = allRows.filter(r => dong === "all" || r.dong === dong);
    return {
      total: inDong.length,
      prop: inDong.filter(r => r.prop).length,
      contract: inDong.filter(r => r.contract).length,
      rosterOnly: inDong.filter(r => !r.prop && !r.contract).length,
    };
  }, [allRows, dong]);

  /* 명부 엑셀 올리기 */
  const onFile = async (file: File) => {
    setMsg("");
    try {
      const parsed = await parseRosterFile(file, complexName);
      if (!parsed.units.length) { setMsg("❌ 엑셀에서 동·호수를 찾지 못했어요. 맨 윗줄에 '동' 또는 '호수' 칸이 있는지 확인해 주세요."); return; }
      // 이미 있는 세대 (매물·만기·명단 — 모든 단지 기준)
      const inPC = new Set<string>();
      for (const p of properties) { const dh = dongHoOf(p.address, p.dong, p.ho); inPC.add(unitKey(complexOf(p.address, p.dong, p.ho), dh.dong, dh.ho)); }
      for (const c of contracts) { const dh = dongHoOf(c.address, c.dong, c.ho); inPC.add(unitKey(complexOf(c.address, c.dong, c.ho), dh.dong, dh.ho)); }
      const inR = new Map(roster.map(u => [unitKey(u.complex, u.dong, u.ho), u]));
      const seen = new Set<string>();
      let inPropOrContract = 0, inRoster = 0, dupInFile = 0;
      const fresh: ParsedRoster["units"] = [];
      // 이미 있는 세대라도 엑셀의 고유번호는 저장해 둠 (매물·만기 프린트에서 찾아 쓰기 위해)
      const uniqueOnly: ParsedRoster["units"] = [];
      const uniqueFill: { id: string; uniqueNo: string }[] = [];
      for (const u of parsed.units) {
        const k = unitKey(u.complex, u.dong, u.ho);
        if (seen.has(k)) { dupInFile++; continue; }
        seen.add(k);
        const old = inR.get(k);
        if (inPC.has(k)) {
          inPropOrContract++;
          if (u.uniqueNo && !old) uniqueOnly.push(u);
          else if (u.uniqueNo && old && !old.uniqueNo) uniqueFill.push({ id: old.id, uniqueNo: u.uniqueNo });
          continue;
        }
        if (old) {
          inRoster++;
          if (u.uniqueNo && !old.uniqueNo) uniqueFill.push({ id: old.id, uniqueNo: u.uniqueNo });
          continue;
        }
        fresh.push(u);
      }
      setPreview({ parsed, fresh, inPropOrContract, inRoster, dupInFile, uniqueOnly, uniqueFill });
    } catch (e) {
      console.error("[roster] 엑셀 읽기 실패:", e);
      setMsg("❌ 엑셀 파일을 읽지 못했어요. .xlsx 파일인지 확인해 주세요.");
    }
  };

  const confirmUpload = async () => {
    if (!user || !preview) return;
    setBusy(true);
    try {
      const n = await addRosterUnits(user.agencyId, [...preview.fresh, ...preview.uniqueOnly].map(u => ({ ...u, createdAt: Date.now() })));
      for (const f of preview.uniqueFill) await setRosterUniqueNo(user.agencyId, f.id, f.uniqueNo);
      const first = preview.fresh[0];
      if (first) setComplex(complexKey(first.complex));
      setMsg(`✅ ${preview.fresh.length}세대를 고객명단에 추가했어요.${n - preview.fresh.length + preview.uniqueFill.length > 0 ? ` (고유번호 ${n - preview.fresh.length + preview.uniqueFill.length}세대 저장)` : ""}`);
      setPreview(null);
    } catch (e) {
      console.error("[roster] 저장 실패:", e);
      setMsg("❌ 저장하지 못했어요. 잠시 후 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const saveCell = async (u: RosterUnit, field: RosterEditField, value: string) => {
    if (!user || (u[field] || "") === value) return;
    try { await updateRosterField(user.agencyId, u.id, field, value); }
    catch (e) { console.error("[roster] 수정 실패:", e); setMsg("❌ 저장하지 못했어요. 다시 해 주세요."); }
  };

  const removeUnit = async (u: RosterUnit) => {
    if (!user) return;
    if (!confirm(`${u.dong ? `${u.dong}동 ` : ""}${u.ho}호를 고객명단에서 지울까요?`)) return;
    try { await deleteRosterUnit(user.agencyId, u.id); }
    catch (e) { console.error("[roster] 삭제 실패:", e); setMsg("❌ 지우지 못했어요."); }
  };

  /* 지금 보이는 표를 엑셀로 받기 */
  const exportExcel = () => {
    const data = rows.map(r => {
      const v = view(r);
      return {
        "동": r.dong, "호수": r.ho, "층": floorOf(r.ho, complexName.includes("상가")), "타입": v.unitType, "전용면적(㎡)": v.area, "향": v.direction,
        "임대인": v.ownerName, "임대인 전화": v.ownerPhone, "임차인": v.tenantName, "임차인 전화": v.tenantPhone,
        "만기일": v.leaseEndDate, "등록 위치": [r.prop && "매물", r.contract && "만기", !r.prop && !r.contract && "명단"].filter(Boolean).join("·"),
        "메모": v.memo,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "고객명단");
    XLSX.writeFile(wb, `고객명단_${complexName.replace(/[\\/:*?"<>|]/g, "")}${dong !== "all" ? `_${dong}동` : ""}.xlsx`);
  };

  /* 지금 보이는 표의 전화번호 → 폰 연락처 파일 (같은 번호는 1번만) */
  const exportContacts = () => {
    const seen = new Set<string>();
    const list: VcardContact[] = [];
    for (const r of rows) {
      const v = view(r);
      const where = [r.dong && `${r.dong}동`, r.ho && `${r.ho}호`].filter(Boolean).join(" ");
      for (const [name, phone, role] of [[v.ownerName, v.ownerPhone, "임대인"], [v.tenantName, v.tenantPhone, "임차인"]]) {
        const digits = (phone || "").replace(/\D/g, "");
        if (digits.length < 8 || seen.has(digits)) continue;
        seen.add(digits);
        list.push({ name: [name || role, where].filter(Boolean).join(" "), phone: phone.trim(), note: role });
      }
    }
    if (list.length === 0) { setMsg("내보낼 전화번호가 없어요."); return; }
    downloadVcf(list, "고객명단_연락처.vcf");
  };

  if (authLoading || !user) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;

  const isOwner = user.role === "owner";

  return (
    <div className="w-full">
      <section className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-5">
        <div>
          <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            <span className="material-symbols-outlined text-[var(--brand-blue)] dark:text-blue-400" style={{ fontSize: "2rem" }}>table_view</span>
            고객명단
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
            단지 세대별로 매물·만기·명부를 한 표에 — [명단] 줄은 칸을 눌러 바로 고쳐 쓰세요
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={exportExcel} disabled={!rows.length}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-1.5 disabled:opacity-40">
            <span className="material-symbols-outlined text-base">download</span>엑셀로 받기
          </button>
          <button onClick={exportContacts} disabled={!rows.length}
            title="지금 보이는 명단의 전화번호를 폰 연락처로 가져올 수 있는 파일을 받아요"
            className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40">
            <span className="material-symbols-outlined text-base">contacts</span>연락처 내보내기
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-[var(--brand-blue,#2383E2)] hover:opacity-90 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">upload_file</span>명부 엑셀 올리기
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </div>
      </section>

      {msg && (
        <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-[var(--tint-gray-bg)] border border-[var(--tint-gray-bd)] text-gray-700 dark:text-gray-200 flex items-start gap-2">
          <span className="flex-1">{msg}</span>
          <button onClick={() => setMsg("")} className="text-gray-400 hover:text-gray-600" aria-label="닫기">✕</button>
        </div>
      )}

      {/* 단지 · 동 · 보기 */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex flex-wrap gap-2 items-center">
          <select value={complex} onChange={e => setComplex(e.target.value)}
            className="max-w-full border border-gray-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100">
            {complexes.length === 0 && <option value="">단지 없음</option>}
            {complexes.map(c => <option key={c.key} value={c.key}>{c.name} ({c.count}세대)</option>)}
          </select>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="호수·이름·전화 검색"
            className="flex-1 min-w-[10rem] border border-gray-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100" />
        </div>
        {dongs.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {["all", ...dongs].map(d => (
              <button key={d} onClick={() => setDong(d)}
                className={`px-2.5 py-1 rounded-full text-xs border ${dong === d ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900" : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300"}`}>
                {d === "all" ? "전체 동" : d ? `${d}동` : "동 없음"}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {([
            ["all", `전체 ${counts.total}`],
            ["prop", `매물 ${counts.prop}`],
            ["contract", `만기 ${counts.contract}`],
            ["roster", `명단만 ${counts.rosterOnly}`],
          ] as [SourceFilter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setSource(k)}
              className={`px-2.5 py-1 rounded-full text-xs border ${source === k ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border-[var(--tint-blue-bd)] font-semibold" : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 표 */}
      <div className="flex justify-end mb-1.5">
        <button onClick={cycleZoom}
          className="px-2.5 py-1 rounded-full text-xs border whitespace-nowrap border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300">
          🔍 표 크기: {tableZoom === 1 ? "보통" : tableZoom === 0.7 ? "작게" : "더 작게"}
        </button>
      </div>
      <div ref={tableWrapRef} className="relative max-w-none overflow-x-auto -mx-6 sm:-mx-10 lg:-mx-24 border-y border-[var(--sidebar-bd)] bg-white dark:bg-slate-900">
       {/* zoom은 갤럭시 멀티뷰 등에서 폭이 틀어져서 transform으로 축소 */}
       <div style={tableZoom === 1 ? undefined : { height: innerH ? innerH * tableZoom : undefined }}>
       <div ref={tableInnerRef} className={tableZoom === 1 ? undefined : "absolute top-0 left-0"} style={tableZoom === 1 ? undefined : { transform: `scale(${tableZoom})`, transformOrigin: "top left", width: wrapW ? wrapW / tableZoom : undefined }}>
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--sidebar-bd)] text-[12px] text-gray-400 dark:text-gray-500 text-left">
              <th className="font-medium px-2 py-2.5 w-[70px] sticky left-0 z-10 bg-white dark:bg-slate-900">동</th>
              <th className="font-medium px-2 py-2.5 w-[70px] sticky left-[70px] z-10 bg-white dark:bg-slate-900 border-r border-[var(--sidebar-bd)]">호수</th>
              {/* 층 칸은 화면에서 숨김 (건의 #174) — 필요하면 SHOW_FLOOR_COL 을 true 로 */}
              {SHOW_FLOOR_COL && <th className="font-medium px-2 py-2.5 w-[44px]">층</th>}
              <th className="font-medium px-2 py-2.5 w-[56px]">타입</th>
              <th className="font-medium px-2 py-2.5 w-[70px]">면적㎡</th>
              <th className="font-medium px-2 py-2.5 w-[56px]">향</th>
              <th className="font-medium px-2 py-2.5 w-[76px]">임대인</th>
              <th className="font-medium px-2 py-2.5 w-[128px]">임대인 전화</th>
              <th className="font-medium px-2 py-2.5 w-[76px]">임차인</th>
              <th className="font-medium px-2 py-2.5 w-[128px]">임차인 전화</th>
              <th className="font-medium px-2 py-2.5 w-[104px]">만기일</th>
              <th className="font-medium px-2 py-2.5 w-[110px]">등록 위치</th>
              <th className="font-medium px-2 py-2.5 w-[130px]">메모</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const v = view(r);
              const u = r.roster;
              const editable = !!u && !r.prop && !r.contract;   // 명부에만 있는 세대만 표에서 바로 고침
              // 동·호수 칸 색: 매물관리 = 파랑, 만기관리 = 주황 (둘 다 있으면 파랑)
              const idTint = r.prop
                ? "bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)]"
                : r.contract ? "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-tx)]" : "";
              const cell = (field: RosterEditField, value: string, opts?: { phone?: boolean; date?: boolean }) => {
                const inner = editable && u
                  ? <EditCell value={u[field] || ""} onSave={val => saveCell(u, field, val)} phone={opts?.phone} date={opts?.date} />
                  : <span className="block truncate px-1.5">{value || <span className="text-gray-300 dark:text-gray-600">—</span>}</span>;
                const tel = opts?.phone ? value.replace(/[^\d+]/g, "") : "";
                if (tel.length < 8) return inner;
                return (
                  <div className="flex items-center gap-0.5">
                    <div className="min-w-0 flex-1">{inner}</div>
                    <a href={`tel:${tel}`} title="전화 걸기" aria-label="전화 걸기" className="shrink-0 leading-none text-[var(--tint-blue-tx)]">
                      <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>call</span>
                    </a>
                    <a href={`sms:${tel}`} title="문자 보내기" aria-label="문자 보내기" className="shrink-0 leading-none text-[var(--tint-green-tx)]">
                      <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>sms</span>
                    </a>
                  </div>
                );
              };
              return (
                <tr key={r.key} className="border-b border-[var(--sidebar-bd)] last:border-0 hover:bg-[var(--tint-gray-bg)]">
                  <td className={`px-2 py-1.5 tabular-nums sticky left-0 z-10 ${idTint ? idTint + " font-semibold" : "bg-white dark:bg-slate-900 text-gray-500 dark:text-gray-400"}`}>{r.dong || "—"}</td>
                  <td className={`px-2 py-1.5 tabular-nums font-semibold sticky left-[70px] z-10 border-r border-[var(--sidebar-bd)] ${idTint || "bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100"}`}>{r.ho}</td>
                  {SHOW_FLOOR_COL && <td className="px-2 py-1.5 tabular-nums text-gray-500 dark:text-gray-400">{floorOf(r.ho, complexName.includes("상가"))}</td>}
                  <td className="px-1 py-1.5 text-gray-700 dark:text-gray-300 max-w-0">{cell("unitType", v.unitType)}</td>
                  <td className="px-1 py-1.5 tabular-nums text-gray-700 dark:text-gray-300 max-w-0">{cell("area", v.area)}</td>
                  <td className="px-1 py-1.5 text-gray-700 dark:text-gray-300 max-w-0">{cell("direction", v.direction)}</td>
                  <td className="px-1 py-1.5 text-gray-900 dark:text-gray-100 max-w-0">{cell("ownerName", v.ownerName)}</td>
                  <td className="px-1 py-1.5 tabular-nums text-gray-700 dark:text-gray-300 max-w-0">{cell("ownerPhone", v.ownerPhone, { phone: true })}</td>
                  <td className="px-1 py-1.5 text-gray-900 dark:text-gray-100 max-w-0">{cell("tenantName", v.tenantName)}</td>
                  <td className="px-1 py-1.5 tabular-nums text-gray-700 dark:text-gray-300 max-w-0">{cell("tenantPhone", v.tenantPhone, { phone: true })}</td>
                  <td className="px-1 py-1.5 tabular-nums text-gray-700 dark:text-gray-300 max-w-0">{cell("leaseEndDate", v.leaseEndDate, { date: true })}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1 items-center">
                      {r.prop && (
                        <button onClick={() => router.push(`/properties?pid=${r.prop!.id}&open=1`)} title="매물관리에서 보기"
                          className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[var(--tint-blue-bg)] text-[var(--tint-blue-tx)] border border-[var(--tint-blue-bd)] whitespace-nowrap">매물관리</button>
                      )}
                      {r.contract && (
                        <button onClick={() => router.push(`/expiry?focus=${r.contract!.id}`)} title="만기관리에서 보기"
                          className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[var(--tint-amber-bg)] text-[var(--tint-amber-tx)] border border-[var(--tint-amber-bd)] whitespace-nowrap">만기관리</button>
                      )}
                      {!r.prop && !r.contract && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[var(--tint-green-bg)] text-[var(--tint-green-tx)] border border-[var(--tint-green-bd)]">명단</span>
                      )}
                      {u && isOwner && (
                        <button onClick={() => removeUnit(u)} title="고객명단에서 지우기" aria-label="고객명단에서 지우기"
                          className="text-gray-300 hover:text-red-500 dark:text-gray-600 text-xs px-0.5">✕</button>
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-1.5 text-gray-700 dark:text-gray-300 max-w-0">
                    {editable && u
                      ? <EditCell value={u.memo} onSave={val => saveCell(u, "memo", val)} />
                      : <span className="block truncate px-1.5 text-gray-400 dark:text-gray-500">{r.prop || r.contract ? "매물·만기 화면에서" : ""}</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={SHOW_FLOOR_COL ? 13 : 12} className="px-3 py-10 text-center text-sm text-gray-400">
                {!rosterLoaded ? "불러오는 중…" : allRows.length === 0
                  ? "이 단지에 동·호수가 있는 세대가 없어요. 명부 엑셀을 올려 보세요."
                  : "조건에 맞는 세대가 없어요."}
              </td></tr>
            )}
          </tbody>
        </table>
       </div>
       </div>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
        매물·만기에 있는 세대는 각 화면에서 고쳐 주세요 (여기서는 보기만). 세대 표시는 매물 → 만기 → 명단 순으로 먼저 있는 정보를 보여줘요.
      </p>

      {preview && (
        <UploadPreview
          preview={preview}
          busy={busy}
          onCancel={() => setPreview(null)}
          onConfirm={confirmUpload}
        />
      )}
    </div>
  );
}

/** 칸을 눌러 바로 고쳐 쓰기 — Enter·칸 밖 누르기 = 저장, Esc = 취소 */
function EditCell({ value, onSave, phone, date }: { value: string; onSave: (v: string) => void; phone?: boolean; date?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);

  const finish = () => {
    setEditing(false);
    if (cancelled.current) { cancelled.current = false; return; }
    let v = draft.trim();
    if (phone) {
      const d = v.replace(/\D/g, "");
      if (d.length === 11) v = `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
      else if (d.length === 10) v = `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    }
    if (v !== value) onSave(v);
  };

  if (!editing) {
    return (
      <button type="button" onClick={() => { setDraft(value); setEditing(true); }}
        className="block w-full text-left truncate px-1.5 py-0.5 rounded border border-dashed border-[var(--sidebar-bd)] hover:bg-[var(--tint-blue-bg)] min-h-[1.5rem]" title={value || "눌러서 입력"}>
        {value || <span className="text-gray-300 dark:text-gray-600">+</span>}
      </button>
    );
  }
  return (
    <input autoFocus type={date ? "date" : phone ? "tel" : "text"} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={e => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { cancelled.current = true; (e.target as HTMLInputElement).blur(); }
      }}
      className="w-full px-1.5 py-0.5 rounded border border-[var(--tint-blue-tx2)] bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 outline-none text-[13px]" />
  );
}

function UploadPreview({ preview, busy, onCancel, onConfirm }: {
  preview: { parsed: ParsedRoster; fresh: ParsedRoster["units"]; inPropOrContract: number; inRoster: number; dupInFile: number; uniqueOnly: ParsedRoster["units"]; uniqueFill: { id: string; uniqueNo: string }[] };
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { parsed, fresh, inPropOrContract, inRoster, dupInFile, uniqueOnly, uniqueFill } = preview;
  const uniqueCount = uniqueOnly.length + uniqueFill.length;
  const complexes = [...new Set(parsed.units.map(u => u.complex))];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-xl shadow-2xl max-h-[calc(100dvh-3rem)] sm:max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">명부 엑셀 확인</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-keep">{complexes.join(", ") || "단지 이름 없음"}</p>

        <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
          <Stat label="엑셀 세대" value={parsed.units.length} />
          <Stat label="새로 추가" value={fresh.length} strong />
          <Stat label="이미 매물·만기에 있음" value={inPropOrContract} />
          <Stat label="이미 명단에 있음" value={inRoster} />
          {uniqueCount > 0 && <Stat label="고유번호만 저장" value={uniqueCount} strong />}
        </div>
        {(dupInFile > 0 || parsed.skipped > 0) && (
          <p className="text-[11px] text-gray-500 mt-2">
            {dupInFile > 0 && `엑셀 안에서 겹치는 호수 ${dupInFile}줄 · `}
            {parsed.skipped > 0 && `동·호수가 없어 건너뛴 줄 ${parsed.skipped}줄`}
          </p>
        )}
        <p className="text-[11px] text-gray-400 mt-2">읽은 칸: {parsed.columns.join(", ")}</p>

        {fresh.length > 0 && (
          <div className="mt-3 text-xs text-gray-600 dark:text-gray-300 bg-[var(--tint-gray-bg)] rounded-lg p-2.5 max-h-32 overflow-y-auto break-keep">
            {fresh.map(u => (u.dong ? `${u.dong}-${u.ho}` : u.ho)).join(", ")}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300">취소</button>
          <button onClick={onConfirm} disabled={busy || fresh.length + uniqueCount === 0}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--brand-blue,#2383E2)] disabled:opacity-40">
            {busy ? "저장 중…" : fresh.length ? `${fresh.length}세대 추가${uniqueCount ? " + 고유번호 저장" : ""}` : uniqueCount ? "고유번호 저장" : "추가할 세대 없음"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 border ${strong ? "bg-[var(--tint-blue-bg)] border-[var(--tint-blue-bd)]" : "border-gray-200 dark:border-slate-700"}`}>
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${strong ? "text-[var(--tint-blue-tx)]" : "text-gray-900 dark:text-gray-100"}`}>{value}</div>
    </div>
  );
}
