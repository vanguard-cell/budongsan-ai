"use client";

import { useState, useEffect, useRef } from "react";

/* ───────── 타입 ───────── */
interface AgencyInfo { name: string; rep: string; phone: string; directions: string; intro: string; }
interface FormData {
  propertyType: string; dealType: string; location: string; complexName: string;
  deposit: string; monthly: string; price: string;
  contractArea: string; exclusiveArea: string;
  floor: string; totalFloor: string; rooms: string; bathrooms: string;
  direction: string; isDuplex: boolean; maintenanceFee: string; heating: string;
  transport: string; investPoint: string; options: string;
  highlights: string; notes: string; complexUnits: string;
}
interface Result { feature: string; description: string; blog: string; insta: string; resident: string; investor: string; qna: string; }
interface LocationInfo { subway: string[]; school: string[]; mart: string[]; hospital: string[]; summary: string; }
interface PriceInfo { trades: { date: string; price?: number; deposit?: number; monthly?: number; area: number; floor: string }[]; avgPrice: number; currentPrice: number; diff: number; pct: number; analysis: string; isRent?: boolean; }
interface ComplexResult { name: string; address: string; category?: string; x?: string; y?: string; }
interface ComplexType { area: number; count: number; }
type Tab = "naver" | "blog" | "insta" | "resident" | "investor" | "qna";

/* ───────── 상수 ───────── */
const AGENCY_KEY = "budongsan_agency";
const PROPERTY_TYPES = ["아파트", "오피스텔", "빌라/다세대", "원룸/투룸", "상가", "사무실", "토지"];
const DEAL_TYPES = ["매매", "전세", "월세", "단기임대"];
const DIRECTIONS = ["남향", "동향", "서향", "북향", "남동향", "남서향", "북동향", "북서향"];
const HEATINGS = ["지역난방/열병합", "개별난방/도시가스", "중앙난방", "개별난방/기름", "전기난방"];

const TABS: { key: Tab; icon: string; label: string; sub: string }[] = [
  { key: "naver",    icon: "🏷️", label: "네이버 등록용",   sub: "바로 붙여넣기" },
  { key: "blog",     icon: "📝", label: "블로그",           sub: "SEO 최적화" },
  { key: "insta",    icon: "📸", label: "인스타그램",       sub: "캡션+해시태그" },
  { key: "resident", icon: "🏡", label: "실거주 고객",      sub: "카톡 메시지" },
  { key: "investor", icon: "📈", label: "투자 고객",        sub: "수익률 중심" },
  { key: "qna",      icon: "💬", label: "문의 답변",        sub: "템플릿 5종" },
];

const EXAMPLE_FORM: FormData = {
  propertyType: "오피스텔", dealType: "매매", location: "경기 하남시 미사강변동", complexName: "힐스테이트 에코미사",
  deposit: "29600", monthly: "25", price: "",
  contractArea: "102.2", exclusiveArea: "39.71",
  floor: "13", totalFloor: "20", rooms: "1", bathrooms: "1",
  direction: "서향", isDuplex: true, maintenanceFee: "15", heating: "지역난방/열병합",
  transport: "미사역 도보 30초, 대기업 출퇴근 버스 인근",
  investPoint: "반전세 안고 매매, 월세수익 가능, 현 임차인 26년 12월 만기",
  options: "인터넷 개별설치, 주차 1대 무료",
  highlights: "미사역 초역세권, 복층 구조로 공간 활용 우수, 투자 수요 많은 단지",
  notes: "현 임차인 있음 (26년 12월 만기), 반전세 안고 매매 가능",
  complexUnits: "463",
};

/* ───────── 공통 컴포넌트 ───────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors shrink-0">
      {copied ? "✓ 복사됨" : "복사"}
    </button>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <label className="block text-sm font-medium text-gray-700 mb-1">{children}{required && <span className="text-red-400 ml-0.5">*</span>}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />;
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
      {children}
    </select>
  );
}

function SectionHead({ step, title, desc }: { step: string; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">{step}</div>
      <div>
        <div className="font-bold text-gray-800">{title}</div>
        <div className="text-xs text-gray-400">{desc}</div>
      </div>
    </div>
  );
}

/* ───────── 메인 ───────── */
export default function Home() {
  const [form, setForm] = useState<FormData>({
    propertyType: "아파트", dealType: "매매", location: "", complexName: "",
    deposit: "", monthly: "", price: "",
    contractArea: "", exclusiveArea: "",
    floor: "", totalFloor: "", rooms: "", bathrooms: "",
    direction: "", isDuplex: false, maintenanceFee: "", heating: "",
    transport: "", investPoint: "", options: "", highlights: "", notes: "", complexUnits: "",
  });
  const [agency, setAgency] = useState<AgencyInfo>({ name: "", rep: "", phone: "", directions: "", intro: "" });
  const [agencySaved, setAgencySaved] = useState(false);
  const [showAgency, setShowAgency] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("naver");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  // 자동완성 상태
  const [complexQuery, setComplexQuery] = useState("");
  const [complexResults, setComplexResults] = useState<ComplexResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [complexSearching, setComplexSearching] = useState(false);
  const [selectedComplex, setSelectedComplex] = useState<ComplexResult | null>(null);
  const [complexTypes, setComplexTypes] = useState<ComplexType[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(AGENCY_KEY);
    if (saved) { setAgency(JSON.parse(saved)); setAgencySaved(true); }
  }, []);

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // 건물 검색 디바운스
  useEffect(() => {
    if (complexQuery.length < 2) { setComplexResults([]); setShowDropdown(false); return; }
    // 이미 선택된 항목과 동일한 텍스트면 재검색 안 함
    if (selectedComplex && complexQuery === selectedComplex.name) return;
    const timer = setTimeout(async () => {
      setComplexSearching(true);
      try {
        const res = await fetch(`/api/complex-search?q=${encodeURIComponent(complexQuery)}`);
        const data = await res.json();
        setComplexResults(data);
        setShowDropdown(data.length > 0);
      } finally {
        setComplexSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [complexQuery, selectedComplex]);

  // 건물 선택
  const selectComplex = async (item: ComplexResult) => {
    setShowDropdown(false);
    setSelectedComplex(item);
    setComplexQuery(item.name);
    setComplexTypes([]);

    // 주소에서 로/길 이전 부분만 location으로 사용
    const addrParts = item.address.split(" ");
    const streetIdx = addrParts.findIndex(p => /[로길]$/.test(p));
    const locationStr = (streetIdx > 0 ? addrParts.slice(0, streetIdx) : addrParts.slice(0, 3)).join(" ");

    // 카카오 카테고리로 매물분류 자동감지
    const cat = item.category ?? "";
    let detectedType = form.propertyType;
    if (cat.includes("오피스텔")) detectedType = "오피스텔";
    else if (cat.includes("빌라") || cat.includes("다세대") || cat.includes("연립")) detectedType = "빌라/다세대";
    else if (cat.includes("아파트")) detectedType = "아파트";
    else if (cat.includes("단독") || cat.includes("다가구")) detectedType = "단독/다가구";

    setForm(p => ({ ...p, complexName: item.name, location: locationStr, propertyType: detectedType }));

    // MOLIT에서 타입 조회 (감지된 매물분류 기준)
    setTypesLoading(true);
    try {
      const res = await fetch("/api/complex-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexName: item.name, location: item.address, propertyType: detectedType }),
      });
      const types = await res.json();
      setComplexTypes(Array.isArray(types) ? types : []);
    } finally {
      setTypesLoading(false);
    }
  };

  const sf = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }));
  const sa = (key: keyof AgencyInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setAgency(p => ({ ...p, [key]: e.target.value }));

  const saveAgency = () => { localStorage.setItem(AGENCY_KEY, JSON.stringify(agency)); setAgencySaved(true); };

  const analyzeLocation = async () => {
    if (!form.complexName && !form.location) { setError("소재지 또는 단지명을 먼저 입력해주세요."); return; }
    setError(""); setLocationLoading(true); setLocationInfo(null);
    try {
      const res = await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: form.location, complexName: form.complexName }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLocationInfo(data);
      if (data.summary) setForm(p => ({ ...p, transport: data.summary }));
    } catch (e) { setError(e instanceof Error ? e.message : "위치 조회 오류"); }
    finally { setLocationLoading(false); }
  };

  const analyzePrice = async () => {
    const currentPrice = form.dealType === "매매" ? (form.price || form.deposit) : form.deposit;
    if (!form.location || !currentPrice) { setError("소재지와 가격(매매가 또는 보증금)을 먼저 입력해주세요."); return; }
    setError(""); setPriceLoading(true); setPriceInfo(null);
    try {
      const res = await fetch("/api/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: form.location, complexName: form.complexName, exclusiveArea: form.exclusiveArea, currentPrice, propertyType: form.propertyType, dealType: form.dealType }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPriceInfo(data);
      if (data.analysis) setForm(p => ({ ...p, investPoint: p.investPoint ? p.investPoint : data.analysis }));
    } catch (e) { setError(e instanceof Error ? e.message : "시세 조회 오류"); }
    finally { setPriceLoading(false); }
  };

  const generate = async () => {
    if (!form.location) { setError("소재지는 필수입니다."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form, agency: agencySaved ? agency : null }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setActiveTab("naver");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) { setError(e instanceof Error ? e.message : "오류가 발생했습니다."); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            🏠 AI 매물 도우미
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">매물 정보 한 번 입력</h1>
          <p className="text-gray-500 text-sm mb-3">네이버 등록 문구 + 블로그 + 인스타 + 고객 맞춤 멘트까지 한 번에</p>
          <button
            onClick={() => { setForm(EXAMPLE_FORM); setComplexQuery(EXAMPLE_FORM.complexName); setSelectedComplex(null); setComplexTypes([]); }}
            className="text-sm px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
          >
            📋 예시 데이터로 채우기
          </button>
        </div>

        {/* ── STEP 1: 기본 정보 ── */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 mb-4">
          <SectionHead step="1" title="기본 정보" desc="매물분류, 거래종류, 단지 선택, 타입 선택" />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <Label>매물분류</Label>
              <Select value={form.propertyType} onChange={v => setForm(p => ({ ...p, propertyType: v }))}>
                {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <Label>거래종류</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {DEAL_TYPES.map(d => (
                  <button key={d} onClick={() => setForm(p => ({ ...p, dealType: d }))}
                    className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.dealType === d ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 단지/건물명 자동완성 */}
          <div className="mb-3" ref={dropdownRef}>
            <Label required>단지 / 건물명</Label>
            <div className="relative">
              <input
                value={complexQuery}
                onChange={e => {
                  setComplexQuery(e.target.value);
                  setSelectedComplex(null);
                  setComplexTypes([]);
                  setForm(p => ({ ...p, complexName: e.target.value }));
                }}
                placeholder="예: 제이클래스오산대역 — 입력하면 자동검색"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-20"
              />
              <div className="absolute right-3 top-2.5 flex items-center gap-1">
                {complexSearching && <span className="text-xs text-gray-400">검색중...</span>}
                {selectedComplex && <span className="text-xs text-green-500 font-medium">✓ 선택됨</span>}
              </div>

              {/* 드롭다운 */}
              {showDropdown && complexResults.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-2xl shadow-xl mt-1 max-h-56 overflow-y-auto">
                  {complexResults.map((r, i) => (
                    <button key={i} onMouseDown={() => selectComplex(r)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0 first:rounded-t-2xl last:rounded-b-2xl transition-colors">
                      <div className="text-sm font-medium text-gray-800">{r.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{r.address}{r.category ? ` · ${r.category}` : ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 소재지 (자동입력 or 수동) */}
          <div className="mb-4">
            <Label required>소재지</Label>
            <Input value={form.location} onChange={sf("location")} placeholder="예: 경기 하남시 미사강변동 (단지 선택 시 자동입력)" />
          </div>

          {/* 타입 선택 (건물 선택 후 표시) */}
          {selectedComplex && (
            <div className="mb-4 bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-xs font-bold text-blue-700 mb-2">
                🏢 {selectedComplex.name} — 전용면적 타입 선택
              </p>
              {typesLoading ? (
                <p className="text-xs text-gray-400">실거래 기준 타입 조회 중...</p>
              ) : complexTypes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {complexTypes.map((t, i) => (
                    <button key={i}
                      onClick={() => setForm(p => ({ ...p, exclusiveArea: String(t.area) }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        form.exclusiveArea === String(t.area)
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-200 hover:border-blue-400"
                      }`}>
                      전용 {t.area}㎡
                      <span className={`ml-1 text-[10px] ${form.exclusiveArea === String(t.area) ? "text-blue-200" : "text-gray-400"}`}>
                        ({t.count}건)
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">실거래 타입 데이터 없음 — 아래에 직접 입력해주세요.</p>
              )}
              {form.exclusiveArea && (
                <p className="text-xs text-blue-600 mt-2">✓ 전용 {form.exclusiveArea}㎡ 선택됨 → 시세 자동분석에 반영</p>
              )}
            </div>
          )}

          {/* AI 자동 분석 버튼 */}
          <div className="flex gap-2">
            <button onClick={analyzeLocation} disabled={locationLoading}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors">
              {locationLoading ? "조회 중..." : "📍 주변 인프라 자동 분석"}
            </button>
            <button onClick={analyzePrice} disabled={priceLoading}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors">
              {priceLoading ? "조회 중..." : "📊 시세 자동 분석"}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}

          {/* 인프라 결과 */}
          {locationInfo && (
            <div className="mt-3 bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-xs font-bold text-blue-700 mb-2">📍 주변 인프라 분석 결과</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                {locationInfo.subway[0] && <div><span className="font-medium text-gray-500">지하철</span><p>{locationInfo.subway[0]}</p>{locationInfo.subway[1] && <p>{locationInfo.subway[1]}</p>}</div>}
                {locationInfo.mart[0] && <div><span className="font-medium text-gray-500">마트/편의</span><p>{locationInfo.mart[0]}</p></div>}
                {locationInfo.school[0] && <div><span className="font-medium text-gray-500">학교</span><p>{locationInfo.school[0]}</p></div>}
                {locationInfo.hospital[0] && <div><span className="font-medium text-gray-500">병원</span><p>{locationInfo.hospital[0]}</p></div>}
              </div>
              <p className="text-xs text-blue-600 mt-2 font-medium">→ 교통/역세권 항목에 자동 반영됨</p>
            </div>
          )}

          {/* 시세 결과 */}
          {priceInfo && (
            <div className="mt-3 bg-green-50 rounded-2xl p-4 border border-green-100">
              <p className="text-xs font-bold text-green-700 mb-2">📊 시세 비교 분석 결과</p>
              <div className="flex items-center gap-4 mb-2">
                <div className="text-center">
                  <p className="text-xs text-gray-500">{priceInfo.isRent ? "실거래 평균 보증금" : "실거래 평균"}</p>
                  <p className="font-bold text-gray-800">{(priceInfo.avgPrice ?? 0).toLocaleString()}만원</p>
                </div>
                <div className="text-2xl text-gray-300">vs</div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">현 매물</p>
                  <p className="font-bold text-gray-800">{(priceInfo.currentPrice ?? 0).toLocaleString()}만원</p>
                </div>
                <div className={`text-center ml-auto px-3 py-1.5 rounded-xl ${priceInfo.pct > 0 ? "bg-green-600 text-white" : "bg-red-100 text-red-600"}`}>
                  <p className="text-xs">{priceInfo.pct > 0 ? "저렴" : "비쌈"}</p>
                  <p className="font-bold text-lg">{Math.abs(priceInfo.pct ?? 0)}%</p>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {priceInfo.trades.slice(0, 3).map((t, i) => {
                  const amt = t.price ?? t.deposit ?? 0;
                  return <span key={i} className="mr-3">{t.date} {t.floor} {amt.toLocaleString()}만</span>;
                })}
              </div>
              <p className="text-xs text-green-600 mt-2 font-medium">→ 투자 포인트 항목에 자동 반영됨</p>
            </div>
          )}
        </div>

        {/* ── STEP 2: 가격 + 매물 정보 (통합) ── */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 mb-4">
          <SectionHead step="2" title="가격 및 매물 정보" desc="가격, 면적, 층수, 구조 등" />

          {/* 가격 */}
          {form.dealType === "매매" ? (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><Label>매매가 (만원)</Label><Input value={form.price} onChange={sf("price")} placeholder="예: 55000" /></div>
              <div><Label>현 보증금 (만원)</Label><Input value={form.deposit} onChange={sf("deposit")} placeholder="있을 경우 입력" /></div>
            </div>
          ) : form.dealType === "월세" || form.dealType === "단기임대" ? (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><Label>보증금 (만원)</Label><Input value={form.deposit} onChange={sf("deposit")} placeholder="예: 29600" /></div>
              <div><Label>월세 (만원)</Label><Input value={form.monthly} onChange={sf("monthly")} placeholder="예: 25" /></div>
            </div>
          ) : (
            <div className="mb-3"><Label>전세금 (만원)</Label><Input value={form.deposit} onChange={sf("deposit")} placeholder="예: 35000" /></div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><Label>월관리비 (만원)</Label><Input value={form.maintenanceFee} onChange={sf("maintenanceFee")} placeholder="예: 15" /></div>
            <div><Label>난방방식</Label>
              <Select value={form.heating} onChange={v => setForm(p => ({ ...p, heating: v }))}>
                <option value="">선택</option>
                {HEATINGS.map(h => <option key={h}>{h}</option>)}
              </Select>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3 mb-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>전용면적 (㎡)</Label>
                <Input value={form.exclusiveArea} onChange={sf("exclusiveArea")} placeholder="위에서 타입 선택 or 직접 입력" />
                {selectedComplex && !form.exclusiveArea && (
                  <p className="text-xs text-blue-500 mt-1">↑ 위 타입 버튼으로 선택 가능</p>
                )}
              </div>
              <div><Label>계약면적 (㎡)</Label><Input value={form.contractArea} onChange={sf("contractArea")} placeholder="예: 102.2" /></div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-3">
            <div><Label>해당층</Label><Input value={form.floor} onChange={sf("floor")} placeholder="13" /></div>
            <div><Label>전체층</Label><Input value={form.totalFloor} onChange={sf("totalFloor")} placeholder="20" /></div>
            <div><Label>방수</Label><Input value={form.rooms} onChange={sf("rooms")} placeholder="1" /></div>
            <div><Label>욕실수</Label><Input value={form.bathrooms} onChange={sf("bathrooms")} placeholder="1" /></div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><Label>방향</Label>
              <Select value={form.direction} onChange={v => setForm(p => ({ ...p, direction: v }))}>
                <option value="">선택</option>
                {DIRECTIONS.map(d => <option key={d}>{d}</option>)}
              </Select>
            </div>
            <div><Label>단지 세대수</Label><Input value={form.complexUnits} onChange={sf("complexUnits")} placeholder="예: 463" /></div>
            <div className="flex flex-col justify-end">
              <button onClick={() => setForm(p => ({ ...p, isDuplex: !p.isDuplex }))}
                className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${form.isDuplex ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-400"}`}>
                {form.isDuplex ? "✅ 복층" : "복층 여부"}
              </button>
            </div>
          </div>
        </div>

        {/* ── STEP 3: 매물 특징 ── */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 mb-4">
          <SectionHead step="3" title="매물 특징" desc="아는 것만 입력해도 AI가 문구를 만들어드립니다" />

          <div className="mb-3"><Label>교통 / 역세권</Label><Input value={form.transport} onChange={sf("transport")} placeholder="예: 미사역 도보 30초 (인프라 분석 시 자동입력)" /></div>
          <div className="mb-3"><Label>투자 포인트</Label><Input value={form.investPoint} onChange={sf("investPoint")} placeholder="예: 반전세 안고 매매, 갭투자 적합 (시세분석 시 자동입력)" /></div>
          <div className="mb-3"><Label>옵션 (쉼표 구분)</Label><Input value={form.options} onChange={sf("options")} placeholder="예: 에어컨, 냉장고, 세탁기, 주차 1대" /></div>
          <div className="mb-3">
            <Label>매물 장점</Label>
            <textarea value={form.highlights} onChange={sf("highlights")} rows={2}
              placeholder="예: 채광 우수, 한강뷰, 신축, 조용한 환경, 즉시 입주 가능"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <Label>특이사항</Label>
            <textarea value={form.notes} onChange={sf("notes")} rows={2}
              placeholder="예: 현 임차인 있음 (26년 12월 만기), 반려동물 불가"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>

        {/* ── 중개사무소 정보 ── */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm mb-5 overflow-hidden">
          <button onClick={() => setShowAgency(p => !p)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 text-sm">🏢 중개사무소 정보</span>
              {agencySaved
                ? <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full border border-green-200">저장됨 ✓</span>
                : <span className="text-xs text-gray-400">저장하면 매번 자동 추가</span>}
            </div>
            <span className="text-gray-400 text-xs">{showAgency ? "▲" : "▼"}</span>
          </button>
          {showAgency && (
            <div className="px-6 pb-6 border-t border-gray-100 pt-4">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><Label>사무소명</Label><Input value={agency.name} onChange={sa("name")} placeholder="예: 미사금빛공인중개사사무소" /></div>
                <div><Label>대표자명</Label><Input value={agency.rep} onChange={sa("rep")} placeholder="예: 홍명숙" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><Label>전화번호</Label><Input value={agency.phone} onChange={sa("phone")} placeholder="예: 031-793-6566" /></div>
                <div><Label>오시는 길</Label><Input value={agency.directions} onChange={sa("directions")} placeholder="예: 미사역 3번 출구 스타벅스 옆" /></div>
              </div>
              <div className="mb-4">
                <Label>사무소 소개글</Label>
                <textarea value={agency.intro} onChange={sa("intro")} rows={2}
                  placeholder="예: 미사지구 전문 중개업소로 풍부한 현장 경험과 지역 정보를 바탕으로 최선의 결과를 드립니다."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <button onClick={saveAgency} className="w-full py-3 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-2xl text-sm transition-colors">
                💾 저장하기
              </button>
            </div>
          )}
        </div>

        {/* 생성 버튼 */}
        <button onClick={generate} disabled={loading}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-2xl text-base transition-colors shadow-lg mb-10">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              AI가 전체 콘텐츠를 작성 중입니다...
            </span>
          ) : "✨ 네이버 문구 + 마케팅 콘텐츠 한 번에 생성"}
        </button>

        {/* ── 결과 ── */}
        {result && (
          <div ref={resultRef}>
            <h2 className="text-lg font-bold text-gray-800 mb-4">생성 완료 ✓</h2>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex flex-col items-center px-4 py-2.5 rounded-2xl text-xs font-medium border whitespace-nowrap transition-colors shrink-0 ${activeTab === t.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"}`}>
                  <span className="text-base mb-0.5">{t.icon}</span>
                  <span>{t.label}</span>
                  <span className={`text-[10px] mt-0.5 ${activeTab === t.key ? "text-blue-200" : "text-gray-400"}`}>{t.sub}</span>
                </button>
              ))}
            </div>

            {activeTab === "naver" && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div><span className="font-semibold text-gray-800">매물특징</span><span className="ml-2 text-xs text-gray-400">네이버 매물특징 입력란에 붙여넣기</span></div>
                    <CopyButton text={result.feature} />
                  </div>
                  <p className="text-sm text-blue-700 font-medium bg-blue-50 rounded-xl px-4 py-3">{result.feature}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div><span className="font-semibold text-gray-800">매물설명</span><span className="ml-2 text-xs text-gray-400">네이버 매물설명 입력란에 붙여넣기</span></div>
                    <CopyButton text={result.description} />
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result.description}</p>
                </div>
              </div>
            )}

            {activeTab !== "naver" && (() => {
              const t = TABS.find(t => t.key === activeTab)!;
              const content = result[activeTab as keyof Omit<Result, "feature" | "description">] as string;
              return (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-semibold text-gray-800">{t.icon} {t.label}</span>
                    <CopyButton text={content} />
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{content}</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
