"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeProperties, saveProperty, deleteProperty, emptyProperty,
  type Property, type PropertyType, type DealType,
} from "@/lib/properties-db";
import { dDay } from "@/app/expiry/contracts";
import { subscribeSchedules, type Schedule } from "@/lib/schedules-db";
import ComplexPickerWidget from "@/app/ComplexPicker";

const PROPERTY_TYPES: PropertyType[] = ["아파트", "오피스텔", "빌라/다세대", "원룸/투룸", "상가", "사무실", "토지", "기타"];
const DEAL_TYPES: DealType[] = ["매매", "전세", "월세"];
const DIRECTIONS = ["동향", "서향", "남향", "북향", "남동향", "남서향", "북동향", "북서향"];

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return raw;
}

export default function PropertiesPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | DealType>("all");
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/properties");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeProperties(user.agencyId, list => { setProperties(list); setLoaded(true); });
    const u2 = subscribeSchedules(user.agencyId, setSchedules);
    return () => { u1(); u2(); };
  }, [user]);

  const upsert = async (p: Property) => {
    if (!user) return;
    await saveProperty(user.agencyId, p);
  };

  const remove = async (id: string) => {
    if (!user || !confirm("이 매물을 삭제할까요? 되돌릴 수 없습니다.")) return;
    await deleteProperty(user.agencyId, id);
  };

  const close = async (p: Property) => {
    if (!user || !confirm("거래완료 처리할까요?")) return;
    await saveProperty(user.agencyId, { ...p, status: "closed" });
  };

  const filtered = useMemo(() => {
    return properties
      .filter(p => showClosed ? p.status === "closed" : p.status === "active")
      .filter(p => filterType === "all" || p.dealType === filterType)
      .filter(p => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return p.address.toLowerCase().includes(q)
            || p.ownerName.toLowerCase().includes(q)
            || p.ownerPhone.includes(q)
            || (p.dong || "").includes(q)
            || (p.ho || "").includes(q)
            || (p.tenantName || "").toLowerCase().includes(q)
            || (p.tenantPhone || "").includes(q);
      });
  }, [properties, showClosed, filterType, query]);

  const counts = useMemo(() => {
    const active = properties.filter(p => p.status === "active");
    return {
      all: active.length,
      매매: active.filter(p => p.dealType === "매매").length,
      전세: active.filter(p => p.dealType === "전세").length,
      월세: active.filter(p => p.dealType === "월세").length,
    };
  }, [properties]);

  if (authLoading || !user) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* 사용자 바 */}
        <div className="flex items-center justify-end gap-2 mb-3 text-[11px] text-gray-500">
          <span>👤 {user.displayName || user.email}</span>
          <span className="text-gray-300">·</span>
          <button onClick={() => { if (confirm("로그아웃?")) signOut(); }} className="hover:text-blue-600 hover:underline">로그아웃</button>
        </div>

        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            🏘️ 내 매물 관리
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">내 매물 목록</h1>
          <p className="text-gray-500 text-xs sm:text-sm mb-4">등록 매물에서 바로 전화·문자 연결</p>
          <button
            onClick={() => setEditing(emptyProperty())}
            className="px-5 py-2.5 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors"
          >
            + 매물 등록
          </button>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {(["all", "매매", "전세", "월세"] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`rounded-2xl border p-3 text-center transition-colors ${filterType === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-gray-200 hover:border-emerald-400"}`}
            >
              <div className="text-lg font-bold">{counts[t === "all" ? "all" : t]}</div>
              <div className="text-[10px] mt-0.5 opacity-80">{t === "all" ? "전체" : t}</div>
            </button>
          ))}
        </div>

        {/* 검색 + 필터 */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-3 mb-4">
          <input
            type="text"
            placeholder="🔍 주소 · 집주인 이름 · 연락처 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="accent-emerald-600" />
            거래완료 매물 보기
          </label>
        </div>

        {/* 목록 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center">
            <div className="text-5xl mb-3">🏘️</div>
            <div className="text-base font-semibold text-gray-900 mb-1">
              {properties.filter(p => p.status === "active").length === 0 ? "등록된 매물이 없습니다" : "조건에 맞는 매물이 없습니다"}
            </div>
            <div className="text-xs text-gray-500 mb-4">매물 등록 버튼을 눌러 추가해보세요</div>
            <button onClick={() => setEditing(emptyProperty())} className="text-sm px-4 py-2 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold">
              + 첫 매물 등록
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(p => (
              <PropertyCard
                key={p.id}
                property={p}
                schedules={schedules.filter(s => s.propertyId === p.id)}
                onEdit={() => setEditing({ ...p })}
                onClose={() => close(p)}
                onDelete={() => remove(p.id)}
                onReopen={() => saveProperty(user.agencyId, { ...p, status: "active" })}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <PropertyModal
          property={editing}
          onClose={() => setEditing(null)}
          onSave={async p => { await upsert(p); setEditing(null); }}
        />
      )}
    </div>
  );
}

const STYPE_COLORS: Record<string, string> = {
  "집보기": "bg-blue-100 text-blue-700",
  "계약":   "bg-purple-100 text-purple-700",
  "잔금":   "bg-orange-100 text-orange-700",
  "기타":   "bg-gray-100 text-gray-600",
};

/* ── 매물 카드 ── */
function PropertyCard({ property: p, schedules, onEdit, onClose, onDelete, onReopen }: {
  property: Property;
  schedules: Schedule[];
  onEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
  onReopen: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const isClosed = p.status === "closed";
  const priceStr = p.dealType === "월세" && p.monthly
    ? `${p.price ? p.price + "/" : ""}${p.monthly}만`
    : p.price ? `${p.price}만` : "—";

  const sortedSchedules = [...schedules].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  // 임차인 만기 D-day
  const leaseDD = p.leaseEndDate ? dDay(p.leaseEndDate) : null;
  const leaseUrgent = leaseDD !== null && leaseDD <= 60;
  const leaseCaution = leaseDD !== null && leaseDD <= 120;

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${isClosed ? "bg-gray-50/60 border-gray-200 opacity-70" : "bg-white border-gray-200 shadow-sm"}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">{p.dealType}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{p.propertyType}</span>
            {isClosed && <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">거래완료</span>}
            {leaseDD !== null && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${leaseUrgent ? "bg-red-100 text-red-700" : leaseCaution ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"}`}>
                ⏰ 임대만기 {leaseDD < 0 ? `${-leaseDD}일지남` : leaseDD === 0 ? "오늘" : `D-${leaseDD}`}
              </span>
            )}
            <span className="text-sm font-bold text-gray-900 truncate">{priceStr}</span>
          </div>
          <div className="text-sm font-semibold text-gray-800 break-all mb-1">{p.address || "—"}</div>
          <div className="text-xs text-gray-500 flex flex-wrap gap-2">
            {p.dong && <span>{p.dong}동</span>}
            {p.ho && <span>{p.ho}호</span>}
            {p.area && <span>{p.area}㎡</span>}
            {p.floor && <span>{p.floor}층</span>}
            {p.rooms && <span>방{p.rooms}개</span>}
            {p.direction && <span>{p.direction}</span>}
          </div>

          {/* 집주인 연락처 */}
          {p.ownerPhone && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-gray-500 shrink-0">집주인 {p.ownerName || ""}</span>
              <a href={`tel:${p.ownerPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(p.ownerPhone)}</a>
              <a
                href={`sms:${p.ownerPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${p.ownerName ? ` ${p.ownerName}님` : ""}, 미사금빛공인중개사입니다.\n${p.address} 매물 관련하여 연락드립니다.`)}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 ml-auto"
              >
                문자
              </a>
            </div>
          )}

          {/* 임차인 연락처 */}
          {p.tenantPhone && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-orange-600 shrink-0">임차인 {p.tenantName || ""}</span>
              <a href={`tel:${p.tenantPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(p.tenantPhone)}</a>
              <a
                href={`sms:${p.tenantPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${p.tenantName ? ` ${p.tenantName}님` : ""}, 미사금빛공인중개사입니다.\n${p.address} 임대차 만기 관련하여 연락드립니다.`)}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 ml-auto"
              >문자</a>
            </div>
          )}

          {p.memo && (
            <div className="mt-1.5 text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1 border border-gray-100">💬 {p.memo}</div>
          )}
        </div>
      </div>

      {/* 스케줄 이력 */}
      {schedules.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
          >
            📅 스케줄 이력 {schedules.length}건
            <span className="text-[10px]">{showHistory ? "▲" : "▼"}</span>
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {sortedSchedules.map(s => (
                <div key={s.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${s.status === "done" ? "bg-gray-50 text-gray-400" : "bg-blue-50 text-gray-700"}`}>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${STYPE_COLORS[s.scheduleType]}`}>{s.scheduleType}</span>
                  <span className="font-medium">{new Date(s.date + "T00:00:00").toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" })}</span>
                  <span>{s.time}</span>
                  {s.visitorName && <span className="text-gray-500">· {s.visitorName}</span>}
                  {s.status === "done" && <span className="ml-auto text-[10px] text-green-600">완료</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        <button onClick={onEdit} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors">수정</button>
        {isClosed ? (
          <button onClick={onReopen} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">진행중으로 복구</button>
        ) : (
          <button onClick={onClose} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-orange-400 hover:text-orange-600 transition-colors">거래완료</button>
        )}
        <button onClick={onDelete} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600 transition-colors">삭제</button>
      </div>
    </div>
  );
}

/* ── 매물 등록/수정 모달 ── */
function PropertyModal({ property, onClose, onSave }: {
  property: Property;
  onClose: () => void;
  onSave: (p: Property) => Promise<void>;
}) {
  const [form, setForm] = useState<Property>(property);
  const [saving, setSaving] = useState(false);
  const isNew = !property.address;
  const addrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addrSuggestions, setAddrSuggestions] = useState<{ name: string; address: string }[]>([]);
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
        const res = await fetch(`/api/complex-search?q=${encodeURIComponent(val)}`);
        setAddrSuggestions((await res.json()).slice(0, 6));
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
  };

  const save = async () => {
    if (!form.address.trim()) { alert("주소를 입력해주세요"); return; }
    setSaving(true);
    try { await onSave({ ...form }); }
    catch { alert("저장 중 오류가 발생했습니다. 다시 시도해주세요."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold">{isNew ? "매물 등록" : "매물 수정"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-3">

          {/* 매물 유형 + 거래 종류 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">매물 유형</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PROPERTY_TYPES.map(t => (
                <button key={t} type="button" onClick={() => set("propertyType", t)}
                  className={`py-1.5 rounded-xl text-xs font-medium border transition-colors ${form.propertyType === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
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
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.dealType === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 주소 + 동/호수 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">단지명 검색 <span className="text-red-400">*</span></label>
            <div className="relative">
              <input value={baseAddress} onChange={e => handleAddressChange(e.target.value)}
                placeholder="단지명 또는 주소 검색"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" autoComplete="off" />
              {addrLoading && <div className="absolute right-3 top-2.5 text-xs text-gray-400">검색 중…</div>}
              {addrSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {addrSuggestions.map((item, i) => (
                    <button key={i} type="button" onClick={() => selectComplex(item.name, item.address)}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b last:border-0 border-gray-100 transition-colors">
                      <div className="text-sm font-medium text-gray-800">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.address}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-1.5">
              <ComplexPickerWidget onSelect={item => selectComplex(item.name, item.address)} />
            </div>

            {/* 동 / 호수 — 입력하면 주소에 자동 반영 */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">동 번호</label>
                <input type="text" inputMode="numeric" value={form.dong} onChange={e => handleDongChange(e.target.value)}
                  placeholder="101" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">호수</label>
                <input type="text" inputMode="numeric" value={form.ho} onChange={e => handleHoChange(e.target.value)}
                  placeholder="1902" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            {form.address && (
              <div className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                📍 저장 주소: <span className="font-medium">{form.address}</span>
              </div>
            )}
          </div>

          {/* 가격 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{form.dealType === "매매" ? "매매가" : "보증금"} (만원)</label>
              <input type="text" inputMode="numeric" value={form.price} onChange={e => set("price", e.target.value.replace(/\D/g,""))}
                placeholder="29600" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            {form.dealType === "월세" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">월세 (만원)</label>
                <input type="text" inputMode="numeric" value={form.monthly} onChange={e => set("monthly", e.target.value.replace(/\D/g,""))}
                  placeholder="70" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            )}
          </div>

          {/* 면적/방수/방향 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전용면적 (㎡)</label>
              <input type="text" inputMode="numeric" value={form.area} onChange={e => set("area", e.target.value)}
                placeholder="84" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">방향</label>
              <select value={form.direction} onChange={e => set("direction", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">선택</option>
                {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">방수</label>
            <input type="text" value={form.rooms} onChange={e => set("rooms", e.target.value)}
              placeholder="3" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>

          {/* 집주인 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">집주인 이름</label>
              <input value={form.ownerName} onChange={e => set("ownerName", e.target.value)}
                placeholder="홍길동" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">집주인 연락처</label>
              <input type="tel" value={form.ownerPhone} onChange={e => set("ownerPhone", e.target.value)}
                placeholder="010-0000-0000" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
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
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">전세·월세 만기일</label>
              <input type="date" value={form.leaseEndDate} onChange={e => set("leaseEndDate", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <p className="text-[10px] text-orange-600 mt-2">📌 만기일 입력 시 스케줄에서 자동으로 만기 알림 표시</p>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea value={form.memo} onChange={e => set("memo", e.target.value)}
              placeholder="특이사항, 열쇠 위치, 입주 가능일 등"
              rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">취소</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
