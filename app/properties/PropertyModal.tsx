"use client";

/** 매물 등록/수정 모달 — page.tsx 분리 리팩토링으로 추출 */

import { useState, useRef, useEffect } from "react";
import { CARRIERS, OPTION_PRESETS, toggleOption, hasOption, subscribeMyComplexes, addMyComplex, removeMyComplex, type Property, type Occupancy, type MyComplex } from "@/lib/properties-db";
import { useAuth, recordFeatureUse } from "@/lib/auth-context";
import DatedMemo from "@/app/components/DatedMemo";
import { PROPERTY_TYPES, DEAL_TYPES, DIRECTIONS, fmtNum, fmtKoreanNum, m2ToPyeong } from "./helpers";

export default function PropertyModal({ property, savedComplexes = [], onClose, onSave }: {
  property: Property;
  savedComplexes?: { base: string; propertyType: string; count: number }[];
  onClose: () => void;
  onSave: (p: Property) => Promise<void>;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<Property>(property);
  const [saving, setSaving] = useState(false);
  const isNew = !property.address;
  const addrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addrSuggestions, setAddrSuggestions] = useState<{ name: string; address: string; category?: string }[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  // 단지 선택 후 기본 주소 (동/호수 자동합산용)
  const [baseAddress, setBaseAddress] = useState(() => {
    // 기존 수정시: address에서 동/호수 제거한 기본 주소
    if (property.dong || property.ho) {
      return property.address
        .replace(/ ?\d+동/, "").replace(/ ?\d+호/, "").trim();
    }
    return property.address;
  });

  const [showSaved, setShowSaved] = useState(false);
  // 내 단지 목록 (미리 저장해 둔 것)
  const [myComplexes, setMyComplexes] = useState<MyComplex[]>([]);
  useEffect(() => {
    if (!user?.agencyId) return;
    return subscribeMyComplexes(user.agencyId, setMyComplexes);
  }, [user?.agencyId]);
  const typedName = baseAddress.trim();
  const alreadyMine = myComplexes.some(c => c.propertyType === form.propertyType && c.name === typedName);
  const saveMine = async () => {
    if (!typedName) return;
    if (!user?.agencyId) { alert("사무실 정보를 불러오는 중이에요. 잠시 후 다시 눌러주세요."); return; }
    try { await addMyComplex(user.agencyId, { name: typedName, propertyType: form.propertyType }); }
    catch { alert("단지 저장 중 오류가 났어요. 다시 해주세요."); }
  };
  const removeMine = async (c: MyComplex) => {
    if (!user?.agencyId) return;
    if (!confirm(`'${c.name}'을(를) 내 단지 목록에서 뺄까요?\n(등록된 매물은 그대로예요)`)) return;
    try { await removeMyComplex(user.agencyId, c); }
    catch { alert("삭제 중 오류가 났어요. 다시 해주세요."); }
  };
  // 목록 = 직접 저장한 단지 먼저 + 이미 올린 매물에서 모은 단지 (같은 유형만, 입력한 글자가 들어간 것만)
  const savedMatches = (() => {
    const q = typedName.replace(/\s+/g, "").toLowerCase();
    const mine = myComplexes
      .filter(c => c.propertyType === form.propertyType)
      .map(c => ({ base: c.name, count: 0, mine: true, ref: c }));
    const mineNames = new Set(mine.map(c => c.base));
    const auto = savedComplexes
      .filter(c => c.propertyType === form.propertyType && !mineNames.has(c.base))
      .map(c => ({ base: c.base, count: c.count, mine: false, ref: null as MyComplex | null }));
    return [...mine, ...auto]
      .filter(c => !q || c.base.replace(/\s+/g, "").toLowerCase().includes(q))
      .filter(c => c.mine || c.base !== typedName)
      .sort((a, b) => a.base.localeCompare(b.base, "ko"))
      .slice(0, 60);
  })();

  const set = <K extends keyof Property>(k: K, v: Property[K]) => setForm(p => ({ ...p, [k]: v }));

  // 동/호수 변경시 address 자동 업데이트
  const updateFullAddress = (newBase: string, newDong: string, newHo: string) => {
    const parts = [newBase.trim(), newDong ? `${newDong}동` : "", newHo ? `${newHo}호` : ""];
    const full = parts.filter(Boolean).join(" ");
    setForm(p => ({ ...p, address: full }));
  };

  const handleDongChange = (val: string) => {
    setForm(p => {
      const parts = [baseAddress.trim(), val ? `${val}동` : "", p.ho ? `${p.ho}호` : ""];
      return { ...p, dong: val, address: parts.filter(Boolean).join(" ") };
    });
  };

  const handleHoChange = (val: string) => {
    setForm(p => {
      const parts = [baseAddress.trim(), p.dong ? `${p.dong}동` : "", val ? `${val}호` : ""];
      return { ...p, ho: val, address: parts.filter(Boolean).join(" ") };
    });
  };

  const handleAddressChange = (val: string) => {
    setBaseAddress(val);
    updateFullAddress(val, form.dong, form.ho);
    if (addrTimerRef.current) clearTimeout(addrTimerRef.current);
    if (val.trim().length < 2) { setAddrSuggestions([]); return; }
    addrTimerRef.current = setTimeout(async () => {
      setAddrLoading(true);
      try {
        // 선택된 매물 유형으로 필터 (오피스텔→오피스텔만, 상가→상가만). 단지명만 반환됨
        const res = await fetch(`/api/complex-search?q=${encodeURIComponent(val)}&type=${encodeURIComponent(form.propertyType)}&pages=2`);
        setAddrSuggestions((await res.json()).slice(0, 8));
      } catch { setAddrSuggestions([]); }
      finally { setAddrLoading(false); }
    }, 350);
  };

  // 단지 검색에서 선택시
  const selectComplex = (name: string, addr: string) => {
    const base = `${addr} ${name}`.trim();
    setBaseAddress(base);
    updateFullAddress(base, form.dong, form.ho);
    setAddrSuggestions([]);
    recordFeatureUse(user?.uid, "complex_pick");
  };

  const save = async () => {
    if (!form.address.trim()) { alert("주소를 입력해주세요"); return; }
    setSaving(true);
    try { await onSave({ ...form }); }
    catch { alert("저장 중 오류가 발생했습니다. 다시 시도해주세요."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[calc(100dvh-5rem)] sm:max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold">{isNew ? "매물 등록" : "매물 수정"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-3">

          {/* 같은 단지 빠른 등록 안내 (신규 등록 시만) */}
          {isNew && (
            <div className="rounded-xl bg-teal-50 border border-teal-200 p-2.5 text-[11px] text-teal-700 leading-relaxed">
              💡 <strong>같은 단지에 여러 매물</strong>이 있으신가요?<br />
              먼저 한 건 등록 후, 그 매물 카드의 <strong>📋 같은 단지 추가</strong> 버튼을 누르면<br />
              단지명·유형·면적·방향이 자동 복사되어 동/호수만 입력하면 됩니다.
            </div>
          )}

          {/* 매물 유형 + 거래 종류 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">매물 유형</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PROPERTY_TYPES.map(t => (
                <button key={t} type="button" onClick={() => set("propertyType", t)}
                  className={`py-1.5 rounded-xl text-xs font-medium border transition-colors ${form.propertyType === t ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">거래 종류</label>
            <div className="grid grid-cols-3 gap-1.5">
              {DEAL_TYPES.map(t => (
                <button key={t} type="button" onClick={() => set("dealType", t)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.dealType === t ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 주소 + 동/호수 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              단지명 검색 <span className="text-red-400">*</span>
              <span className="text-[11px] text-gray-400 font-normal ml-1">· {form.propertyType} 단지만 표시</span>
            </label>
            <div className="relative">
              <input value={baseAddress} onChange={e => { handleAddressChange(e.target.value); setShowSaved(true); }}
                onFocus={() => setShowSaved(true)}
                placeholder={`단지명 검색 (예: 미사강변골든센트로)`}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" autoComplete="off" />
              {addrLoading && <div className="absolute right-3 top-2.5 text-xs text-gray-400">검색 중…</div>}
              {addrSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                  {addrSuggestions.map((item, i) => (
                    <button key={i} type="button" onClick={() => selectComplex(item.name, item.address)}
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b last:border-0 border-gray-100 transition-colors flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{item.name}</span>
                      {item.category && <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">{item.category}</span>}
                    </button>
                  ))}
                  {/* 검색에 없으면 — 입력한 그대로 사용 (상가·신축 등 카카오 미등록 대응) */}
                  {baseAddress.trim().length >= 2 && (
                    <button type="button" onClick={() => setAddrSuggestions([])}
                      className="w-full text-left px-3 py-2.5 text-[12px] text-blue-600 bg-blue-50/60 hover:bg-blue-100 border-t border-gray-100 transition-colors">
                      ✏️ 찾는 게 없어요 — 입력한 <b>“{baseAddress.trim()}”</b> 그대로 사용
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              💡 목록에서 고르거나, <b className="text-gray-500">단지·건물명을 직접 입력</b>해도 그대로 저장돼요.
              (상가·신축처럼 검색에 안 잡히는 건 직접 타이핑하세요)
            </p>

            {/* 내 단지 목록 — 눌러서 같은 이름으로 등록 / 현재 입력한 이름을 목록에 저장 */}
            {(typedName && !alreadyMine) && (
              <button type="button" onClick={saveMine}
                className="mt-2 whitespace-nowrap px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 max-w-full truncate">
                📌 ‘{typedName}’ 내 단지 목록에 저장
              </button>
            )}
            {(typedName && alreadyMine) && (
              <p className="mt-2 text-xs font-medium text-teal-700">✅ ‘{typedName}’ 내 단지 목록에 저장되어 있어요</p>
            )}
            {(showSaved || savedMatches.some(c => c.mine)) && savedMatches.length > 0 && (
              <div className="mt-2 rounded-xl border border-teal-200 bg-teal-50/60 p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-teal-700">📌 내 단지 목록 (눌러서 선택)</span>
                  <button type="button" onClick={() => setShowSaved(false)} className="text-[11px] text-gray-400 whitespace-nowrap">닫기</button>
                </div>
                <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                  {savedMatches.map(c => (
                    <span key={c.base} className="flex w-full items-center rounded-lg bg-white border border-teal-200 text-xs text-gray-800">
                      <button type="button"
                        onClick={() => { setBaseAddress(c.base); updateFullAddress(c.base, form.dong, form.ho); setAddrSuggestions([]); setShowSaved(false); }}
                        className="min-w-0 flex-1 truncate whitespace-nowrap text-left px-2.5 py-1.5 hover:bg-teal-100 rounded-lg">
                        {c.base}{!c.mine && <span className="text-gray-400"> {c.count}</span>}
                      </button>
                      {c.mine && c.ref && (
                        <button type="button" onClick={() => removeMine(c.ref!)} aria-label="목록에서 빼기"
                          className="px-2 py-1.5 text-gray-400 hover:text-red-500 whitespace-nowrap">✕</button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 동 / 호수 — 입력하면 주소에 자동 반영 */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">동 번호</label>
                <input type="text" inputMode="numeric" value={form.dong} onChange={e => handleDongChange(e.target.value)}
                  placeholder="101" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">호수</label>
                <input type="text" inputMode="numeric" value={form.ho} onChange={e => handleHoChange(e.target.value)}
                  placeholder="1902" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            {form.address && (
              <div className="mt-1.5 text-xs text-blue-700 bg-blue-50 rounded-xl px-3 py-2">
                📍 저장 주소: <span className="font-medium">{form.address}</span>
              </div>
            )}
          </div>

          {/* 가격 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{form.dealType === "매매" ? "매매가" : "보증금"} (만원)</label>
              <input type="text" inputMode="numeric" value={form.price ? fmtNum(form.price) : ""} onChange={e => set("price", e.target.value.replace(/\D/g,""))}
                placeholder="29,600" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              {form.price && <div className="mt-1 text-[10px] text-gray-500">≈ {fmtKoreanNum(form.price)}만원</div>}
            </div>
            {form.dealType === "월세" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">월세 (만원)</label>
                <input type="text" inputMode="numeric" value={form.monthly ? fmtNum(form.monthly) : ""} onChange={e => set("monthly", e.target.value.replace(/\D/g,""))}
                  placeholder="70" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            )}
          </div>

          {/* 면적 / 평면도 타입 — 면적란엔 숫자만, 타입은 별도 (어머니 피드백) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전용면적 (㎡)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.area}
                onChange={e => {
                  // 숫자·소수점만 허용 — "44c-3" 같은 오입력 방지
                  const cleaned = e.target.value.replace(/[^\d.]/g, "");
                  set("area", cleaned);
                }}
                placeholder="84"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {m2ToPyeong(form.area) && <div className="mt-1 text-[10px] text-gray-500">≈ {m2ToPyeong(form.area)}평</div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                평면도 타입 <span className="text-[10px] text-gray-400">(선택)</span>
              </label>
              <input
                type="text"
                value={form.unitType}
                onChange={e => set("unitType", e.target.value)}
                placeholder="예: 84A, C-3타입"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="mt-1 text-[10px] text-gray-400">A/B/C타입 등 평면 구분</div>
            </div>
          </div>
          {/* 방향 / 방수 한 줄 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">방향</label>
              <select value={form.direction} onChange={e => set("direction", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">선택</option>
                {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">방수</label>
              <input type="text" inputMode="numeric" value={form.rooms}
                onChange={e => set("rooms", e.target.value.replace(/\D/g, ""))}
                placeholder="3"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
{/* 방수는 위 방향/방수 그리드로 통합됨 */}

          {/* 집주인 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">집주인 이름</label>
              <input value={form.ownerName} onChange={e => set("ownerName", e.target.value)}
                placeholder="홍길동" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">집주인 연락처</label>
              <input type="tel" value={form.ownerPhone} onChange={e => set("ownerPhone", e.target.value)}
                placeholder="010-0000-0000" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* 집주인 통신사 — 같은 걸 다시 누르면 해제 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              집주인 통신사 <span className="text-[10px] text-gray-400">(선택)</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {CARRIERS.map(c => (
                <button key={c} type="button" onClick={() => set("ownerCarrier", form.ownerCarrier === c ? "" : c)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.ownerCarrier === c ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* 임차인 (전세/월세 세입자) */}
          <div className="border border-orange-200 rounded-2xl p-3 bg-orange-50/40">
            <div className="text-xs font-semibold text-orange-700 mb-2">🏠 현재 임차인 (전세·월세 세입자)</div>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">임차인 이름</label>
                <input value={form.tenantName} onChange={e => set("tenantName", e.target.value)}
                  placeholder="홍길동" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">임차인 연락처</label>
                <input type="tel" value={form.tenantPhone} onChange={e => set("tenantPhone", e.target.value)}
                  placeholder="010-0000-0000" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            {/* 현재 임차인 보증금/월세 — 매매 매물에도 세입자 있을 수 있음 */}
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">보증금 (만원)</label>
                <input type="text" inputMode="numeric" value={form.tenantDeposit}
                  onChange={e => set("tenantDeposit", e.target.value.replace(/\D/g, ""))}
                  placeholder="1000" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">월세 (만원)</label>
                <input type="text" inputMode="numeric" value={form.tenantMonthly}
                  onChange={e => set("tenantMonthly", e.target.value.replace(/\D/g, ""))}
                  placeholder="70 (전세는 0)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">전세·월세 만기일</label>
              <input type="date" value={form.leaseEndDate} onChange={e => set("leaseEndDate", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <p className="text-[10px] text-orange-600 mt-2">📌 만기일 입력 시 스케줄에서 자동으로 만기 알림 표시</p>
          </div>

          {/* 입주 상태 — 주인거주·공실 분류 (집주인/공실 필터 기준) */}
          {form.dealType === "매매" && (
          <div className="border border-indigo-200 rounded-2xl p-3 bg-indigo-50/40">
            <label className="block text-xs font-semibold text-indigo-700 mb-2">🏘️ 입주 상태</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { v: "jeonse", label: "전세" },
                { v: "wolse", label: "월세" },
                { v: "owner", label: "주인거주" },
                { v: "vacant", label: "공실" },
              ] as const).map(o => (
                <button key={o.v} type="button" onClick={() => set("occupancy", (form.occupancy === o.v ? "" : o.v) as Occupancy)}
                  className={`py-2 rounded-xl text-xs font-medium whitespace-nowrap border transition-colors ${form.occupancy === o.v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-indigo-600 mt-2">📌 주인거주·공실로 지정하면 목록에서 [🏠 집주인/공실] 필터로 모아볼 수 있어요</p>
          </div>
          )}

          {/* 집 옵션 — 칩을 누르면 아래 칸에 들어가고, 직접 타이핑해도 됨 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              옵션 <span className="text-[10px] text-gray-400">(쉼표로 구분)</span>
            </label>
            <input value={form.options} onChange={e => set("options", e.target.value)}
              placeholder="예: 에어컨, 냉장고, 세탁기 / 풀옵션 / 옵션 없음"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {OPTION_PRESETS.map(o => {
                const on = hasOption(form.options, o);
                return (
                  <button key={o} type="button" onClick={() => set("options", toggleOption(form.options, o))}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${on ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)]" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                    {on ? "✓ " : "+ "}{o}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">💡 자주 쓰는 건 눌러서 넣고, 그 외(커튼·주차 2대 등)는 칸에 직접 쓰세요</p>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모 <span className="text-[10px] text-gray-400">(엔터 = 다음 줄 + 오늘 날짜 자동)</span></label>
            <DatedMemo value={form.memo} onChange={v => set("memo", v)}
              placeholder="특이사항, 열쇠 위치, 입주 가능일 등"
              rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">취소</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-sm font-semibold hover:bg-[var(--brand-blue-dark)] disabled:opacity-60">
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 계약 진행 모달 — 4개 날짜 + 임차인 정보 ── */
