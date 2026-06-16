"use client";

/**
 * 실거래 최고가 — 단지별 기록 페이지
 * 어머니가 단지별 실거래 최고가를 기록해두고 매물 상담 시 참고
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeMarketPrices, saveMarketPrice, deleteMarketPrice, emptyMarketPrice,
  saveMarketPricesBatch, sampleMarketPrices,
  type MarketPrice,
} from "@/lib/market-price-db";
import ComplexPickerWidget from "@/app/ComplexPicker";

/** 천단위 콤마 */
function fmtNum(s: string): string {
  if (!s) return "";
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? s : n.toLocaleString();
}
/** 만원 → "X억 Y,Z00" */
function fmtKorean(s: string): string {
  const n = parseInt((s || "").replace(/[^\d]/g, ""), 10);
  if (isNaN(n) || n === 0) return "";
  const eok = Math.floor(n / 10000);
  const man = n % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}`;
  if (eok > 0) return `${eok}억`;
  return man.toLocaleString();
}
/** ㎡ → 평 */
function m2ToPyeong(m2: string): string {
  const n = parseFloat((m2 || "").replace(/[^\d.]/g, ""));
  if (!n || isNaN(n)) return "";
  return (Math.round(n / 3.3058 * 10) / 10).toString();
}
function formatDateKo(v: string): string {
  if (!v) return "";
  const d = new Date(v + "T00:00:00");
  if (isNaN(d.getTime())) return v;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function MarketPricePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<MarketPrice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<MarketPrice | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/market-price");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMarketPrices(user.agencyId, list => { setItems(list); setLoaded(true); });
    return () => unsub();
  }, [user]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(m =>
      m.complexName.toLowerCase().includes(q) ||
      m.unitType.toLowerCase().includes(q),
    );
  }, [items, query]);

  // 단지별 그룹화
  const grouped = useMemo(() => {
    const map = new Map<string, MarketPrice[]>();
    for (const m of filtered) {
      const key = m.complexName || "(단지명 없음)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()];
  }, [filtered]);

  const remove = async (id: string) => {
    if (!user || !confirm("이 기록을 삭제할까요?")) return;
    await deleteMarketPrice(user.agencyId, id);
  };

  const loadSamples = async () => {
    if (!user) return;
    if (items.length > 0 && !confirm("기존 기록이 있습니다. 예시 실거래가를 추가할까요?")) return;
    await saveMarketPricesBatch(user.agencyId, sampleMarketPrices());
  };
  const clearAll = async () => {
    if (!user) return;
    if (!confirm("⚠️ 기록된 모든 실거래 최고가를 삭제합니다. 진행할까요?")) return;
    for (const m of items) await deleteMarketPrice(user.agencyId, m.id);
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  return (
    <div>
      <div className="w-full">

        {/* 헤더 */}
        <section className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-6">
          <div>
            <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              <span className="material-symbols-outlined text-violet-600 dark:text-violet-400" style={{ fontSize: "2rem" }}>trending_up</span>
              실거래 최고가
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
              단지별 실거래 최고가를 기록해두고 상담 시 참고하세요
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
            <button
              onClick={loadSamples}
              title="예시 실거래가 5건 추가"
              className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">science</span>
              <span className="hidden sm:inline">예시</span>
            </button>
            {items.length > 0 && (
              <button
                onClick={clearAll}
                title="모든 실거래가 기록 삭제"
                className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-red-600 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">delete_sweep</span>
                <span className="hidden sm:inline">전체 삭제</span>
              </button>
            )}
            <button
              onClick={() => setEditing(emptyMarketPrice())}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all shadow-md hover:scale-[1.02] active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              최고가 기록
            </button>
          </div>
        </section>

        {/* 검색 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-3 mb-4">
          <input
            type="text"
            placeholder="🔍 단지명 · 평형/타입 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {/* 목록 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : grouped.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-8 text-center">
            <div className="text-5xl mb-3">📈</div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {query ? "검색 결과가 없습니다" : "기록된 실거래가가 없습니다"}
            </div>
            <div className="text-xs text-gray-500 mb-4">단지별 실거래 최고가를 기록해보세요</div>
            {!query && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button onClick={() => setEditing(emptyMarketPrice())} className="text-sm px-4 py-2 rounded-full border-2 border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-semibold">
                  + 첫 기록 추가
                </button>
                <button onClick={loadSamples} className="text-sm px-4 py-2 rounded-full border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300 font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-base">science</span>
                  예시 데이터 넣기
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([complex, list]) => (
              <div key={complex} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
                {/* 단지명 헤더 */}
                <div className="px-4 py-3 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-100 dark:border-violet-900/40 flex items-center gap-2">
                  <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>apartment</span>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 flex-1 min-w-0 truncate">{complex}</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-600 text-white font-bold shrink-0">{list.length}건</span>
                </div>
                {/* 평형별 기록 */}
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {list.map(m => (
                    <div key={m.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {/* 평형/타입 + 면적 */}
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            {m.unitType && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold">{m.unitType}</span>}
                            {m.area && <span className="text-xs text-gray-500 dark:text-gray-400">{m.area}㎡{m2ToPyeong(m.area) ? ` (${m2ToPyeong(m.area)}평)` : ""}</span>}
                            {m.dealDate && <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5"><span className="material-symbols-outlined text-xs">event</span>{formatDateKo(m.dealDate)}</span>}
                          </div>
                          {/* 가격 */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {m.saleHigh && (
                              <div className="flex items-baseline gap-1">
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">매매</span>
                                <span className="text-base font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">{fmtKorean(m.saleHigh)}</span>
                                <span className="text-[10px] text-gray-400">만</span>
                              </div>
                            )}
                            {m.jeonseHigh && (
                              <div className="flex items-baseline gap-1">
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">전세</span>
                                <span className="text-base font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">{fmtKorean(m.jeonseHigh)}</span>
                                <span className="text-[10px] text-gray-400">만</span>
                              </div>
                            )}
                            {m.wolseMonthly && (
                              <div className="flex items-baseline gap-1">
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">월세</span>
                                <span className="text-base font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">{fmtKorean(m.wolseDeposit) || "0"}/{fmtKorean(m.wolseMonthly)}</span>
                                <span className="text-[10px] text-gray-400">만</span>
                              </div>
                            )}
                          </div>
                          {m.memo && (
                            <div className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/60 rounded-lg px-2 py-1 inline-block">💬 {m.memo}</div>
                          )}
                        </div>
                        {/* 액션 */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setEditing({ ...m })} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors">
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button onClick={() => remove(m.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 뒤로가기 */}
        <div className="text-center mt-6">
          <Link href="/dashboard" className="text-xs text-gray-500 hover:text-violet-600">← 홈으로</Link>
        </div>
      </div>

      {editing && (
        <MarketPriceModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async m => { if (user) { await saveMarketPrice(user.agencyId, m); setEditing(null); } }}
        />
      )}
    </div>
  );
}

/* ── 실거래가 입력/수정 모달 ── */
function MarketPriceModal({ item, onClose, onSave }: {
  item: MarketPrice;
  onClose: () => void;
  onSave: (m: MarketPrice) => Promise<void>;
}) {
  const [form, setForm] = useState<MarketPrice>(item);
  const [saving, setSaving] = useState(false);
  const isNew = !item.complexName;
  const set = <K extends keyof MarketPrice>(k: K, v: MarketPrice[K]) => setForm(p => ({ ...p, [k]: v }));

  // ── 국토부 실거래 자동 조회 ──
  const [lookupType, setLookupType] = useState("아파트");
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");

  const autoLookup = async () => {
    if (!form.complexName.trim()) { alert("단지명을 먼저 입력해주세요."); return; }
    setLooking(true);
    setLookupMsg("국토부 실거래 조회 중… (최근 6개월)");
    try {
      const body = {
        location: form.complexName,        // lawdCd 추출용 (지역 키워드 없으면 하남 기본)
        complexName: form.complexName,
        exclusiveArea: form.area,
        propertyType: lookupType,
        mode: "max",
      };
      const [saleRes, jeonseRes, wolseRes] = await Promise.all([
        fetch("/api/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, dealType: "매매" }) }).then(r => r.json()),
        fetch("/api/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, dealType: "전세" }) }).then(r => r.json()),
        fetch("/api/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, dealType: "월세" }) }).then(r => r.json()),
      ]);

      const found: string[] = [];
      setForm(p => {
        const next = { ...p };
        if (saleRes.high?.price) {
          next.saleHigh = String(saleRes.high.price);
          next.dealDate = saleRes.high.date || p.dealDate;
          if (!p.area && saleRes.high.area) next.area = String(saleRes.high.area);
          found.push(`매매 ${saleRes.count}건 중 최고 (${saleRes.high.floor}층)`);
        }
        if (jeonseRes.high?.deposit) {
          next.jeonseHigh = String(jeonseRes.high.deposit);
          if (!next.dealDate) next.dealDate = jeonseRes.high.date || "";
          found.push(`전세 ${jeonseRes.count}건 중 최고`);
        }
        if (wolseRes.high?.monthly) {
          next.wolseDeposit = String(wolseRes.high.deposit || "");
          next.wolseMonthly = String(wolseRes.high.monthly);
          if (!next.dealDate) next.dealDate = wolseRes.high.date || "";
          found.push(`월세 ${wolseRes.count}건 중 최고`);
        }
        return next;
      });

      if (found.length === 0) {
        setLookupMsg(`❌ ${saleRes.error || jeonseRes.error || wolseRes.error || "거래 내역이 없습니다. 단지명·유형을 확인해주세요."}`);
      } else {
        setLookupMsg(`✅ 자동 입력 완료 — ${found.join(" · ")}`);
      }
    } catch {
      setLookupMsg("❌ 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLooking(false);
    }
  };

  const handleSave = async () => {
    if (!form.complexName.trim()) { alert("단지명을 입력해주세요."); return; }
    setSaving(true);
    try { await onSave(form); }
    catch (e) { alert("저장 중 오류: " + (e instanceof Error ? e.message : String(e))); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-xl shadow-2xl max-h-[calc(100dvh-3rem)] sm:max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between z-10">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">{isNew ? "실거래 최고가 기록" : "기록 수정"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* 단지명 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">단지명 <span className="text-red-500">*</span></label>
            <input
              value={form.complexName}
              onChange={e => set("complexName", e.target.value)}
              placeholder="예: 힐스테이트 미사역 그랑파사쥬"
              className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <div className="mt-2">
              <ComplexPickerWidget onSelect={it => set("complexName", it.name || it.address)} />
            </div>
          </div>

          {/* 면적 / 평형타입 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">전용면적 (㎡)</label>
              <input
                type="text" inputMode="decimal"
                value={form.area}
                onChange={e => set("area", e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="84"
                className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              {m2ToPyeong(form.area) && <div className="mt-1 text-[10px] text-gray-500">≈ {m2ToPyeong(form.area)}평</div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">평형/타입</label>
              <input
                value={form.unitType}
                onChange={e => set("unitType", e.target.value)}
                placeholder="예: 84A, 59B"
                className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* 국토부 실거래 자동 조회 */}
          <div className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/60 dark:bg-violet-950/30 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-violet-700 dark:text-violet-300 mb-2">
              <span className="material-symbols-outlined text-sm">cloud_download</span>
              국토부 실거래 자동 조회 — 최근 6개월 매매·전세·월세 최고가를 자동으로 채워드려요
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {["아파트", "오피스텔", "빌라/다세대"].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLookupType(t)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    lookupType === t
                      ? "bg-violet-600 text-white border-violet-600 font-semibold"
                      : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-600"
                  }`}
                >
                  {t}
                </button>
              ))}
              <button
                type="button"
                onClick={autoLookup}
                disabled={looking}
                className="ml-auto text-xs px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold disabled:opacity-50 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">{looking ? "hourglass_top" : "search"}</span>
                {looking ? "조회 중…" : "최고가 조회"}
              </button>
            </div>
            {lookupMsg && (
              <p className={`mt-2 text-[11px] leading-relaxed ${lookupMsg.startsWith("✅") ? "text-emerald-700 dark:text-emerald-400" : lookupMsg.startsWith("❌") ? "text-red-600 dark:text-red-400" : "text-gray-500"}`}>
                {lookupMsg}
              </p>
            )}
          </div>

          {/* 매매 / 전세 최고가 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-rose-600 dark:text-rose-400 mb-1">매매 최고가 (만원)</label>
              <input
                type="text" inputMode="numeric"
                value={form.saleHigh}
                onChange={e => set("saleHigh", e.target.value.replace(/\D/g, ""))}
                placeholder="80000"
                className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              {fmtKorean(form.saleHigh) && <div className="mt-1 text-[10px] text-rose-500">{fmtKorean(form.saleHigh)}만원</div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">전세 최고가 (만원)</label>
              <input
                type="text" inputMode="numeric"
                value={form.jeonseHigh}
                onChange={e => set("jeonseHigh", e.target.value.replace(/\D/g, ""))}
                placeholder="50000"
                className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {fmtKorean(form.jeonseHigh) && <div className="mt-1 text-[10px] text-blue-500">{fmtKorean(form.jeonseHigh)}만원</div>}
            </div>
          </div>

          {/* 월세 최고가 (보증금 / 월차임) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">월세 보증금 (만원)</label>
              <input
                type="text" inputMode="numeric"
                value={form.wolseDeposit}
                onChange={e => set("wolseDeposit", e.target.value.replace(/\D/g, ""))}
                placeholder="1000"
                className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {fmtKorean(form.wolseDeposit) && <div className="mt-1 text-[10px] text-amber-500">{fmtKorean(form.wolseDeposit)}만원</div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">월세 차임 (만원)</label>
              <input
                type="text" inputMode="numeric"
                value={form.wolseMonthly}
                onChange={e => set("wolseMonthly", e.target.value.replace(/\D/g, ""))}
                placeholder="50"
                className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* 거래일 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">거래일</label>
            <input
              type="date"
              value={form.dealDate}
              onChange={e => set("dealDate", e.target.value)}
              className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">메모</label>
            <textarea
              value={form.memo}
              onChange={e => set("memo", e.target.value)}
              rows={2}
              placeholder="예: 로열층 / 한강뷰 / 급매"
              className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 px-5 py-4 border-t border-gray-100 dark:border-slate-700 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300 font-semibold text-sm">취소</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm disabled:opacity-50">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
