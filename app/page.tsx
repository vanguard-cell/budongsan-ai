"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import DashboardCards from "./DashboardCards";
import InstallPrompt from "./InstallPrompt";

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
interface LocationInfo { subway: string[]; school: string[]; mart: string[]; hospital: string[]; kids: string[]; publicOrg: string[]; academy: string[]; summary: string; }
interface PriceInfo { trades: { date: string; price?: number; deposit?: number; monthly?: number; area: number; floor: string }[]; avgPrice: number; currentPrice: number; diff: number; pct: number; analysis: string; isRent?: boolean; }
interface ComplexResult { name: string; address: string; category?: string; x?: string; y?: string; }
interface ComplexType { area: number; count: number; }
type Tab = "naver" | "blog" | "insta" | "resident" | "investor" | "qna" | "preview";

interface PhotoItem { id: string; preview: string; base64: string; mediaType: string; }
interface SavedProperty {
  id: string;
  savedAt: number;
  form: FormData;
  result?: Result | null;
  locationInfo?: LocationInfo | null;
  priceInfo?: PriceInfo | null;
  thumbnail?: string;
}
interface Template {
  id: string;
  name: string;
  form: Partial<FormData>;
}

/* ───────── 상수 ───────── */
const AGENCY_KEY = "budongsan_agency";
const HISTORY_KEY = "budongsan_history";
const TEMPLATES_KEY = "budongsan_templates";
const PROPERTY_TYPES = ["아파트", "오피스텔", "빌라/다세대", "원룸/투룸", "상가", "사무실", "토지"];
const DEAL_TYPES = ["매매", "전세", "월세", "단기임대"];
const DIRECTIONS = ["남향", "동향", "서향", "북향", "남동향", "남서향", "북동향", "북서향"];
const HEATINGS = ["지역난방/열병합", "개별난방/도시가스", "중앙난방", "개별난방/기름", "전기난방"];

const TABS: { key: Tab; icon: string; label: string; sub: string }[] = [
  { key: "naver",    icon: "🏷️", label: "네이버 등록용",   sub: "바로 붙여넣기" },
  { key: "preview",  icon: "👁️", label: "네이버 미리보기", sub: "실제 노출 형태" },
  { key: "blog",     icon: "📝", label: "블로그",           sub: "SEO 최적화" },
  { key: "insta",    icon: "📸", label: "인스타그램",       sub: "캡션+해시태그" },
  { key: "resident", icon: "🏡", label: "실거주 고객",      sub: "카톡 메시지" },
  { key: "investor", icon: "📈", label: "투자 고객",        sub: "수익률 중심" },
  { key: "qna",      icon: "💬", label: "문의 답변",        sub: "템플릿 5종" },
];

/* ───────── 유틸 ───────── */
const fileToBase64 = (file: File): Promise<{ base64: string; mediaType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve({ base64, mediaType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

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

  // 히스토리/템플릿/사진/PDF 상태
  const [history, setHistory] = useState<SavedProperty[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [photoDetails, setPhotoDetails] = useState<string[]>([]);
  const [pdfExporting, setPdfExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // 매물 정보 가져오기 (Import) 상태
  const [showImport, setShowImport] = useState(false);
  const [importImages, setImportImages] = useState<PhotoItem[]>([]);
  const [importText, setImportText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importExtracted, setImportExtracted] = useState<Partial<FormData> | null>(null);
  const [importError, setImportError] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(AGENCY_KEY);
    if (saved) { setAgency(JSON.parse(saved)); setAgencySaved(true); }
    const hist = localStorage.getItem(HISTORY_KEY);
    if (hist) try { setHistory(JSON.parse(hist)); } catch {}
    const tpls = localStorage.getItem(TEMPLATES_KEY);
    if (tpls) try { setTemplates(JSON.parse(tpls)); } catch {}
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

  // 단지명을 자동완성으로 선택 안 했으면 차단
  const needsComplexSelection = !!form.complexName && !selectedComplex;

  const analyzeLocation = async () => {
    if (!form.complexName && !form.location) { setError("소재지 또는 단지명을 먼저 입력해주세요."); return; }
    if (needsComplexSelection) { setError("단지/건물명은 자동완성 목록에서 선택해주세요. (정확도를 위해 필수)"); return; }
    setError(""); setLocationLoading(true); setLocationInfo(null);
    try {
      // 자동완성으로 선택된 경우 정확한 좌표(x,y) 직접 전달
      const body = selectedComplex?.x
        ? { location: form.location, complexName: form.complexName, x: selectedComplex.x, y: selectedComplex.y }
        : { location: form.location, complexName: form.complexName };
      const res = await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLocationInfo(data);
      // 교통 자동입력: 지하철 첫 번째만 (짧고 핵심적으로)
      const mainTransport = data.subway?.[0] || "";
      if (mainTransport) setForm(p => ({ ...p, transport: mainTransport }));
    } catch (e) { setError(e instanceof Error ? e.message : "위치 조회 오류"); }
    finally { setLocationLoading(false); }
  };

  const analyzePrice = async () => {
    const currentPrice = form.dealType === "매매" ? (form.price || form.deposit) : form.deposit;
    if (!form.location || !currentPrice) { setError("소재지와 가격(매매가 또는 보증금)을 먼저 입력해주세요."); return; }
    if (needsComplexSelection) { setError("단지/건물명은 자동완성 목록에서 선택해주세요."); return; }
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
    if (needsComplexSelection) { setError("단지/건물명은 자동완성 목록에서 선택해주세요."); return; }
    // 인프라 분석 안 했으면 안내 (강제는 아님)
    if (!locationInfo && selectedComplex) {
      if (!confirm("📍 주변 인프라 분석을 아직 안 했네요!\n인프라 정보 없이 생성하면 매물설명이 빈약할 수 있습니다.\n\n이대로 생성할까요? (취소 후 인프라 분석 권장)")) return;
    }
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form, agency: agencySaved ? agency : null, locationInfo }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setActiveTab("naver");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) { setError(e instanceof Error ? e.message : "오류가 발생했습니다."); }
    finally { setLoading(false); }
  };

  /* ── 히스토리 저장/불러오기 ── */
  const saveToHistory = () => {
    const item: SavedProperty = {
      id: uid(),
      savedAt: Date.now(),
      form,
      result,
      locationInfo,
      priceInfo,
      thumbnail: photos[0]?.preview,
    };
    const next = [item, ...history].slice(0, 50); // 최대 50개
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    setError("");
    setTimeout(() => setError(""), 2000);
    alert("매물이 저장되었습니다.");
  };

  const loadHistory = (item: SavedProperty) => {
    setForm(item.form);
    setResult(item.result ?? null);
    setLocationInfo(item.locationInfo ?? null);
    setPriceInfo(item.priceInfo ?? null);
    setComplexQuery(item.form.complexName ?? "");
    setSelectedComplex(null);
    setComplexTypes([]);
    setPhotos([]);
    setPhotoDetails([]);
    setShowHistory(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteHistory = (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const next = history.filter(h => h.id !== id);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  /* ── 템플릿 저장/불러오기 ── */
  const saveAsTemplate = () => {
    const name = prompt("템플릿 이름을 입력해주세요 (예: 미사강변 30평대 매매)");
    if (!name) return;
    // 가격·층수·면적 같은 매물 고유값 제외, 단지·옵션·특이사항 등 공통값만 저장
    const tplForm: Partial<FormData> = {
      propertyType: form.propertyType,
      dealType: form.dealType,
      location: form.location,
      complexName: form.complexName,
      direction: form.direction,
      heating: form.heating,
      transport: form.transport,
      options: form.options,
      highlights: form.highlights,
      complexUnits: form.complexUnits,
    };
    const tpl: Template = { id: uid(), name, form: tplForm };
    const next = [tpl, ...templates].slice(0, 30);
    setTemplates(next);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    alert("템플릿이 저장되었습니다.");
  };

  const loadTemplate = (tpl: Template) => {
    setForm(p => ({ ...p, ...tpl.form }));
    setComplexQuery(tpl.form.complexName ?? "");
    setShowTemplates(false);
  };

  const deleteTemplate = (id: string) => {
    if (!confirm("템플릿을 삭제하시겠습니까?")) return;
    const next = templates.filter(t => t.id !== id);
    setTemplates(next);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
  };

  /* ── 사진 업로드 / AI 분석 ── */
  const onPhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (photos.length + files.length > 8) {
      setError("사진은 최대 8장까지 업로드 가능합니다.");
      return;
    }
    const items: PhotoItem[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 5 * 1024 * 1024) { setError(`${f.name}: 5MB 초과`); continue; }
      const { base64, mediaType } = await fileToBase64(f);
      items.push({
        id: uid(),
        preview: `data:${mediaType};base64,${base64}`,
        base64,
        mediaType,
      });
    }
    setPhotos(p => [...p, ...items]);
    e.target.value = ""; // 같은 파일 재선택 가능하도록
  };

  const removePhoto = (id: string) => {
    setPhotos(p => p.filter(x => x.id !== id));
  };

  const analyzePhotos = async () => {
    if (photos.length === 0) { setError("사진을 먼저 업로드해주세요."); return; }
    setError(""); setPhotoAnalyzing(true); setPhotoDetails([]);
    try {
      const res = await fetch("/api/analyze-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: photos.map(p => ({ data: p.base64, mediaType: p.mediaType })) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.highlights) {
        setForm(p => ({ ...p, highlights: p.highlights ? `${p.highlights}, ${data.highlights}` : data.highlights }));
      }
      setPhotoDetails(data.details ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "사진 분석 오류"); }
    finally { setPhotoAnalyzing(false); }
  };

  /* ── 매물 정보 가져오기 (이미지/텍스트/URL → AI 파싱) ── */
  // 클립보드 이미지 추가 (Ctrl+V)
  const addImportImageFromBlob = async (blob: Blob) => {
    if (!blob.type.startsWith("image/")) return;
    if (blob.size > 5 * 1024 * 1024) { setImportError("이미지가 5MB를 초과합니다."); return; }
    if (importImages.length >= 5) { setImportError("이미지는 최대 5장까지 가능합니다."); return; }
    const file = new File([blob], `paste-${Date.now()}.png`, { type: blob.type });
    const { base64, mediaType } = await fileToBase64(file);
    setImportImages(p => [...p, {
      id: uid(),
      preview: `data:${mediaType};base64,${base64}`,
      base64,
      mediaType,
    }]);
  };

  // 모달 열린 동안 paste 이벤트 처리
  useEffect(() => {
    if (!showImport) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      // URL 입력란이나 텍스트 입력란에서는 일반 paste 허용 (이미지만 가로채기)
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            addImportImageFromBlob(blob);
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImport, importImages.length]);

  const onImportImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (importImages.length + files.length > 5) {
      setImportError("이미지는 최대 5장까지 첨부 가능합니다.");
      return;
    }
    const items: PhotoItem[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 5 * 1024 * 1024) { setImportError(`${f.name}: 5MB 초과`); continue; }
      const { base64, mediaType } = await fileToBase64(f);
      items.push({
        id: uid(),
        preview: `data:${mediaType};base64,${base64}`,
        base64,
        mediaType,
      });
    }
    setImportImages(p => [...p, ...items]);
    e.target.value = "";
  };

  const removeImportImage = (id: string) => {
    setImportImages(p => p.filter(x => x.id !== id));
  };

  const resetImport = () => {
    setImportImages([]);
    setImportText("");
    setImportUrl("");
    setImportExtracted(null);
    setImportError("");
  };

  const runImport = async () => {
    if (importImages.length === 0 && !importText.trim() && !importUrl.trim()) {
      setImportError("이미지·텍스트·URL 중 하나 이상 입력해주세요.");
      return;
    }
    setImportError("");
    setImportLoading(true);
    setImportExtracted(null);
    try {
      const res = await fetch("/api/import-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: importImages.map(p => ({ data: p.base64, mediaType: p.mediaType })),
          text: importText.trim() || undefined,
          url: importUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setImportExtracted(data.data);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "추출 오류");
    } finally {
      setImportLoading(false);
    }
  };

  const applyImport = () => {
    if (!importExtracted) return;
    const e = importExtracted;
    // null/undefined 제외하고 string으로 변환해서 form에 병합
    setForm(prev => {
      const next = { ...prev };
      const set = <K extends keyof FormData>(key: K, val: FormData[K] | null | undefined) => {
        if (val === null || val === undefined || val === "") return;
        next[key] = val;
      };
      const toStr = (v: unknown) => v === null || v === undefined ? "" : String(v);
      set("propertyType", toStr(e.propertyType) as FormData["propertyType"]);
      set("dealType",     toStr(e.dealType));
      set("location",     toStr(e.location));
      set("complexName",  toStr(e.complexName));
      set("price",        toStr(e.price));
      set("deposit",      toStr(e.deposit));
      set("monthly",      toStr(e.monthly));
      set("contractArea", toStr(e.contractArea));
      set("exclusiveArea",toStr(e.exclusiveArea));
      set("floor",        toStr(e.floor));
      set("totalFloor",   toStr(e.totalFloor));
      set("rooms",        toStr(e.rooms));
      set("bathrooms",    toStr(e.bathrooms));
      set("direction",    toStr(e.direction));
      set("maintenanceFee", toStr(e.maintenanceFee));
      set("heating",      toStr(e.heating));
      set("options",      toStr(e.options));
      set("highlights",   toStr(e.highlights));
      set("notes",        toStr(e.notes));
      set("complexUnits", toStr(e.complexUnits));
      if (typeof e.isDuplex === "boolean") next.isDuplex = e.isDuplex;
      return next;
    });
    // 단지명 자동완성 검색용 query에도 반영
    if (e.complexName) setComplexQuery(String(e.complexName));
    setShowImport(false);
    resetImport();
    window.scrollTo({ top: 0, behavior: "smooth" });
    alert("매물 정보가 양식에 적용되었습니다.\n⚠️ 단지/건물명은 자동완성 목록에서 다시 선택해주세요.");
  };

  /* ── PDF 내보내기 ── */
  const exportPDF = async () => {
    if (!result) { setError("먼저 매물 콘텐츠를 생성해주세요."); return; }
    if (!previewRef.current) return;
    setPdfExporting(true);
    try {
      // 미리보기 탭으로 전환
      setActiveTab("preview");
      await new Promise(r => setTimeout(r, 300));
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let position = 0;
      let remaining = imgH;
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      remaining -= pageH;
      while (remaining > 0) {
        position = position - pageH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
        remaining -= pageH;
      }
      const fname = `매물_${form.complexName || form.location || "안내"}_${new Date().toISOString().slice(0,10)}.pdf`;
      pdf.save(fname);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF 생성 오류");
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* 헤더 */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-2">
            🏠 미사금빛 매물 도우미
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">매물·만기·손님 한 곳에서</h1>
          <p className="text-gray-500 text-xs sm:text-sm">PC·폰 자동 동기화 · 4989 보완용</p>
        </div>

        {/* ★ 앱 설치 안내 — 기종 자동 감지 + 시각 가이드 */}
        <InstallPrompt />

        {/* ★ 대시보드 카드 — 만기/손님 긴급 알림 + 진입 */}
        <DashboardCards />

        {/* 매물 문구 생성 헤더 */}
        <div id="매물도우미" className="text-center mb-4 mt-2 pt-4 border-t border-gray-200">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-1">매물 문구 생성</h2>
          <p className="text-gray-500 text-xs mb-3">네이버 등록 문구 + 블로그 + 인스타 + 고객 맞춤 멘트까지 한 번에</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setShowImport(true)}
              title="네이버/매경 스크린샷, 카톡 매물정보, URL 등으로부터 양식 자동 채우기"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
            >
              📥 매물 정보 가져오기
            </button>
            <button
              onClick={() => { setForm(EXAMPLE_FORM); setComplexQuery(EXAMPLE_FORM.complexName); setSelectedComplex(null); setComplexTypes([]); }}
              title="예시 데이터로 양식을 채워서 기능 테스트"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              📋 예시 데이터
            </button>
            <button
              onClick={() => setShowHistory(true)}
              title="이전에 작성·저장한 매물 목록에서 불러오기"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              📂 히스토리 ({history.length})
            </button>
            <button
              onClick={() => setShowTemplates(true)}
              title="자주 쓰는 단지·옵션 양식 불러오기"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              📋 템플릿 ({templates.length})
            </button>
          </div>
        </div>

        {/* ── STEP 1: 기본 정보 ── */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-4">
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
            <Label required>단지 / 건물명 <span className="text-xs font-normal text-gray-400">(자동완성 목록에서 선택 필수)</span></Label>
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
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 pr-24 ${
                  needsComplexSelection
                    ? "border-amber-300 bg-amber-50 focus:ring-amber-400"
                    : selectedComplex
                    ? "border-green-300 bg-green-50/40 focus:ring-green-400"
                    : "border-gray-200 bg-gray-50 focus:ring-blue-500"
                }`}
              />
              <div className="absolute right-3 top-2.5 flex items-center gap-1">
                {complexSearching && <span className="text-xs text-gray-400">검색중...</span>}
                {selectedComplex && <span className="text-xs text-green-500 font-medium">✓ 선택됨</span>}
                {needsComplexSelection && !complexSearching && <span className="text-xs text-amber-600 font-medium">⚠️ 미선택</span>}
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
            {needsComplexSelection && (
              <p className="text-xs text-amber-600 mt-1.5">
                ⚠️ 자동완성 목록에서 정확한 단지를 선택해야 시세·인프라 분석이 정확합니다.
              </p>
            )}
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
            <button onClick={analyzeLocation} disabled={locationLoading || needsComplexSelection}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {locationLoading ? "조회 중..." : "📍 주변 인프라 자동 분석"}
            </button>
            <button onClick={analyzePrice} disabled={priceLoading || needsComplexSelection}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {priceLoading ? "조회 중..." : "📊 시세 자동 분석"}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}

          {/* 인프라 결과 */}
          {locationInfo && (
            <div className="mt-3 bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-xs font-bold text-blue-700 mb-2">📍 주변 인프라 분석 결과</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                {locationInfo.subway[0] && (
                  <div><span className="font-medium text-gray-500">🚇 지하철</span>
                    <p>{locationInfo.subway[0]}</p>
                    {locationInfo.subway[1] && <p>{locationInfo.subway[1]}</p>}
                  </div>
                )}
                {locationInfo.mart[0] && (
                  <div><span className="font-medium text-gray-500">🛒 대형마트/아울렛</span>
                    <p>{locationInfo.mart[0]}</p>
                  </div>
                )}
                {locationInfo.school[0] && (
                  <div><span className="font-medium text-gray-500">🏫 학교</span>
                    <p>{locationInfo.school[0]}</p>
                    {locationInfo.school[1] && <p>{locationInfo.school[1]}</p>}
                  </div>
                )}
                {locationInfo.hospital[0] && (
                  <div><span className="font-medium text-gray-500">🏥 병원</span>
                    <p>{locationInfo.hospital[0]}</p>
                  </div>
                )}
                {locationInfo.kids?.[0] && (
                  <div><span className="font-medium text-gray-500">👶 어린이집/유치원</span>
                    <p>{locationInfo.kids[0]}</p>
                    {locationInfo.kids[1] && <p>{locationInfo.kids[1]}</p>}
                  </div>
                )}
                {locationInfo.academy?.[0] && (
                  <div><span className="font-medium text-gray-500">📚 학원가</span>
                    <p>{locationInfo.academy[0]}</p>
                  </div>
                )}
                {locationInfo.publicOrg?.[0] && (
                  <div><span className="font-medium text-gray-500">🏛️ 공공기관</span>
                    <p>{locationInfo.publicOrg[0]}</p>
                  </div>
                )}
                {!locationInfo.subway[0] && !locationInfo.mart[0] && !locationInfo.school[0] && !locationInfo.hospital[0] && (
                  <p className="col-span-2 text-gray-400">주변 인프라 정보를 찾을 수 없습니다.</p>
                )}
              </div>
              <p className="text-xs text-blue-600 mt-2 font-medium">→ 교통/역세권 항목에 자동 반영됨</p>
            </div>
          )}

          {/* 시세 결과 */}
          {priceInfo && (
            <div className="mt-3 bg-green-50 rounded-2xl p-4 border border-green-100">
              <p className="text-xs font-bold text-green-700 mb-2">📊 시세 비교 분석 결과</p>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="text-center">
                  <p className="text-[10px] sm:text-xs text-gray-500">{priceInfo.isRent ? "평균 보증금" : "실거래 평균"}</p>
                  <p className="font-bold text-sm sm:text-base text-gray-800">{(priceInfo.avgPrice ?? 0).toLocaleString()}만원</p>
                </div>
                <div className="text-xl text-gray-300">vs</div>
                <div className="text-center">
                  <p className="text-[10px] sm:text-xs text-gray-500">현 매물</p>
                  <p className="font-bold text-sm sm:text-base text-gray-800">{(priceInfo.currentPrice ?? 0).toLocaleString()}만원</p>
                </div>
                <div className={`text-center ml-auto px-3 py-1.5 rounded-xl ${priceInfo.pct > 0 ? "bg-green-600 text-white" : "bg-red-100 text-red-600"}`}>
                  <p className="text-[10px] sm:text-xs">{priceInfo.pct > 0 ? "저렴" : "비쌈"}</p>
                  <p className="font-bold text-base sm:text-lg">{Math.abs(priceInfo.pct ?? 0)}%</p>
                </div>
              </div>

              {/* 실거래가 차트 */}
              {priceInfo.trades.length > 1 && (
                <div className="bg-white rounded-xl p-2 mb-2 border border-green-100">
                  <p className="text-[10px] font-semibold text-gray-500 mb-1 px-1">실거래가 추이 (만원)</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart
                      data={[...priceInfo.trades]
                        .reverse()
                        .map(t => ({ date: t.date, 가격: t.price ?? t.deposit ?? 0, floor: t.floor }))}
                      margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => `${(v/10000).toFixed(1)}억`} />
                      <Tooltip
                        formatter={(v) => `${Number(v).toLocaleString()}만원`}
                        labelStyle={{ fontSize: 11, color: "#374151" }}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <ReferenceLine y={priceInfo.currentPrice} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "현 매물", fontSize: 10, fill: "#ef4444", position: "right" }} />
                      <Line type="monotone" dataKey="가격" stroke="#16a34a" strokeWidth={2} dot={{ r: 4, fill: "#16a34a" }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="text-[10px] sm:text-xs text-gray-500">
                {priceInfo.trades.slice(0, 4).map((t, i) => {
                  const amt = t.price ?? t.deposit ?? 0;
                  return <span key={i} className="mr-3 inline-block">{t.date} {t.floor} {amt.toLocaleString()}만</span>;
                })}
              </div>
              <p className="text-xs text-green-600 mt-2 font-medium">→ 투자 포인트 항목에 자동 반영됨</p>
            </div>
          )}
        </div>

        {/* ── STEP 2: 가격 + 매물 정보 (통합) ── */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-4">
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
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-4">
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

        {/* ── 사진 업로드 → AI 분석 ── */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-4">
          <SectionHead step="4" title="매물 사진 (선택)" desc="사진 업로드 → AI가 장점 자동 추출" />

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPhotoPick}
            className="hidden"
          />

          {photos.length === 0 ? (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <div className="text-3xl mb-1">📷</div>
              <p className="text-sm font-medium text-gray-700">사진 추가 (최대 8장)</p>
              <p className="text-xs text-gray-400 mt-1">거실·주방·침실·욕실 등</p>
            </button>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                {photos.map(p => (
                  <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(p.id)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-500"
                    >✕</button>
                  </div>
                ))}
                {photos.length < 8 && (
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl text-gray-400 hover:border-blue-400 hover:text-blue-500"
                  >+</button>
                )}
              </div>
              <button
                onClick={analyzePhotos}
                disabled={photoAnalyzing}
                className="w-full py-2.5 rounded-xl text-sm font-medium border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
              >
                {photoAnalyzing ? "🤖 AI 분석 중..." : "✨ AI로 매물 장점 자동 추출"}
              </button>
              {photoDetails.length > 0 && (
                <div className="mt-3 bg-purple-50 rounded-2xl p-4 border border-purple-100">
                  <p className="text-xs font-bold text-purple-700 mb-2">🤖 AI 사진 분석 결과</p>
                  <div className="space-y-1 text-xs sm:text-sm text-gray-700">
                    {photoDetails.map((d, i) => <p key={i}>{d}</p>)}
                  </div>
                  <p className="text-xs text-purple-600 mt-2 font-medium">→ 매물 장점 항목에 자동 반영됨</p>
                </div>
              )}
            </>
          )}
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
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-2xl text-sm sm:text-base transition-colors shadow-lg mb-3">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              AI가 작성 중...
            </span>
          ) : "✨ 네이버 문구 + 마케팅 콘텐츠 한 번에 생성"}
        </button>

        {/* 보조 액션 버튼 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
          <button onClick={saveToHistory}
            title="지금 작성한 매물 정보를 히스토리에 저장 — 나중에 불러올 수 있음"
            className="py-2.5 rounded-xl text-xs sm:text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
            💾 매물 저장
          </button>
          <button onClick={saveAsTemplate}
            title="단지명·옵션·난방방식 등 공통값만 양식으로 저장 — 다른 매물에 재활용"
            className="py-2.5 rounded-xl text-xs sm:text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
            📋 템플릿 저장
          </button>
          <button onClick={exportPDF} disabled={!result || pdfExporting}
            title="생성된 매물 미리보기를 PDF 파일로 저장 — 고객 안내용"
            className="col-span-2 sm:col-span-1 py-2.5 rounded-xl text-xs sm:text-sm font-medium border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors">
            {pdfExporting ? "생성 중..." : "📄 PDF로 저장"}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 text-center mb-10">
          💾 매물 저장: 이번 매물 보관 · 📋 템플릿 저장: 단지·옵션 양식 재활용 · 📄 PDF: 고객 안내용 출력
        </p>

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
                <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div><span className="font-semibold text-gray-800">매물특징</span><span className="ml-2 hidden sm:inline text-xs text-gray-400">네이버 매물특징 입력란에 붙여넣기</span></div>
                    <CopyButton text={result.feature} />
                  </div>
                  <p className="text-sm text-blue-700 font-medium bg-blue-50 rounded-xl px-4 py-3">{result.feature}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div><span className="font-semibold text-gray-800">매물설명</span><span className="ml-2 hidden sm:inline text-xs text-gray-400">네이버 매물설명 입력란에 붙여넣기</span></div>
                    <CopyButton text={result.description} />
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result.description}</p>
                </div>
              </div>
            )}

            {/* 네이버 스타일 미리보기 */}
            {activeTab === "preview" && (
              <div ref={previewRef} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-sm">
                {/* 네이버 부동산 스타일 */}
                <div className="border-b border-gray-200 pb-4 mb-4">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <span>🟢 NAVER 부동산</span>
                    <span>·</span>
                    <span>{form.propertyType}</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                    {form.complexName || form.location}
                  </h2>
                  <div className="flex flex-wrap items-baseline gap-2 mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${form.dealType === "매매" ? "bg-red-100 text-red-600" : form.dealType === "전세" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"}`}>
                      {form.dealType}
                    </span>
                    <span className="text-xl sm:text-2xl font-bold text-gray-900">
                      {form.dealType === "매매"
                        ? (form.price ? `${(Number(form.price)/10000).toFixed(1)}억` : "협의")
                        : form.dealType === "전세"
                        ? (form.deposit ? `${(Number(form.deposit)/10000).toFixed(1)}억` : "협의")
                        : `${form.deposit || "?"}/${form.monthly || "?"}`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{form.location}</p>
                </div>

                {/* 사진 그리드 */}
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-1 mb-4 rounded-xl overflow-hidden">
                    {photos.slice(0, 6).map(p => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.id} src={p.preview} alt="" className="aspect-square object-cover" />
                    ))}
                  </div>
                )}

                {/* 핵심 정보 그리드 */}
                <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm mb-4">
                  {form.exclusiveArea && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-400">전용/계약면적</p>
                      <p className="font-medium text-gray-800">{form.exclusiveArea}㎡{form.contractArea ? ` / ${form.contractArea}㎡` : ""}</p>
                    </div>
                  )}
                  {(form.floor || form.totalFloor) && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-400">해당층 / 전체층</p>
                      <p className="font-medium text-gray-800">{form.floor || "?"}층 / {form.totalFloor || "?"}층{form.isDuplex ? " (복층)" : ""}</p>
                    </div>
                  )}
                  {(form.rooms || form.bathrooms) && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-400">방 / 욕실</p>
                      <p className="font-medium text-gray-800">{form.rooms || "?"} / {form.bathrooms || "?"}</p>
                    </div>
                  )}
                  {form.direction && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-400">방향</p>
                      <p className="font-medium text-gray-800">{form.direction}</p>
                    </div>
                  )}
                  {form.maintenanceFee && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-400">월 관리비</p>
                      <p className="font-medium text-gray-800">{form.maintenanceFee}만원</p>
                    </div>
                  )}
                  {form.heating && (
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-400">난방</p>
                      <p className="font-medium text-gray-800">{form.heating}</p>
                    </div>
                  )}
                </div>

                {/* 매물 특징 태그 */}
                <div className="mb-4">
                  <p className="text-xs font-bold text-gray-700 mb-2">매물 특징</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.feature.split(",").map((tag, i) => (
                      <span key={i} className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 매물 설명 */}
                <div className="mb-4">
                  <p className="text-xs font-bold text-gray-700 mb-2">매물 설명</p>
                  <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {result.description}
                  </div>
                </div>

                {/* 주변 인프라 */}
                {locationInfo && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-gray-700 mb-2">📍 주변 인프라</p>
                    <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                      {locationInfo.subway?.[0] && <p>🚇 {locationInfo.subway[0]}</p>}
                      {locationInfo.mart?.[0] && <p>🛒 {locationInfo.mart[0]}</p>}
                      {locationInfo.school?.[0] && <p>🏫 {locationInfo.school[0]}</p>}
                      {locationInfo.hospital?.[0] && <p>🏥 {locationInfo.hospital[0]}</p>}
                      {locationInfo.kids?.[0] && <p>👶 {locationInfo.kids[0]}</p>}
                      {locationInfo.academy?.[0] && <p>📚 {locationInfo.academy[0]}</p>}
                    </div>
                  </div>
                )}

                {/* 시세 비교 */}
                {priceInfo && (
                  <div className="mb-4 bg-green-50 rounded-xl p-3 sm:p-4 border border-green-100">
                    <p className="text-xs font-bold text-green-700 mb-2">💰 시세 비교</p>
                    <div className="text-xs sm:text-sm text-gray-700">
                      <p>실거래 평균: <span className="font-bold">{priceInfo.avgPrice.toLocaleString()}만원</span></p>
                      <p>현 매물: <span className="font-bold">{priceInfo.currentPrice.toLocaleString()}만원</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded ${priceInfo.pct > 0 ? "bg-green-600 text-white" : "bg-red-100 text-red-600"}`}>
                          {priceInfo.pct > 0 ? "▼" : "▲"} {Math.abs(priceInfo.pct)}%
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {/* 중개사 정보 */}
                {agencySaved && agency.name && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <p className="text-xs font-bold text-gray-700 mb-2">🏢 중개사무소</p>
                    <p className="text-sm font-semibold text-gray-800">{agency.name}</p>
                    {agency.rep && <p className="text-xs text-gray-500">대표 {agency.rep}</p>}
                    {agency.phone && <p className="text-xs text-blue-600 font-medium">📞 {agency.phone}</p>}
                    {agency.directions && <p className="text-xs text-gray-500 mt-1">{agency.directions}</p>}
                  </div>
                )}
              </div>
            )}

            {activeTab !== "naver" && activeTab !== "preview" && (() => {
              const t = TABS.find(t => t.key === activeTab)!;
              const content = result[activeTab as keyof Omit<Result, "feature" | "description">] as string;
              return (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm">
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

      {/* 매물 정보 가져오기 모달 */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setShowImport(false); resetImport(); }}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-bold text-gray-800">📥 매물 정보 가져오기</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">캡처·카톡·URL을 AI가 읽어서 자동 입력</p>
              </div>
              <button onClick={() => { setShowImport(false); resetImport(); }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="overflow-y-auto p-5 flex-1">
              {!importExtracted ? (
                <>
                  {/* 입력 영역 */}
                  <div className="space-y-4">
                    {/* A. 이미지 업로드 */}
                    <div>
                      <Label>📸 이미지 (스크린샷 · 매물장 · 광고)</Label>
                      <p className="text-[11px] text-gray-400 mb-2">
                        파일 선택 또는 <span className="font-semibold text-blue-600">Ctrl+V로 캡처 바로 붙여넣기</span> — 최대 5장
                      </p>
                      <input
                        ref={importInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={onImportImagePick}
                        className="hidden"
                      />
                      {importImages.length === 0 ? (
                        <button
                          onClick={() => importInputRef.current?.click()}
                          className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-6 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors"
                        >
                          <div className="text-2xl mb-1">📷</div>
                          <p className="text-sm font-medium text-gray-700">이미지 선택 또는 Ctrl+V 붙여넣기</p>
                          <p className="text-[11px] text-gray-400 mt-1">캡처 후 그대로 붙여넣기 가능</p>
                        </button>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {importImages.map(p => (
                            <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.preview} alt="" className="w-full h-full object-cover" />
                              <button
                                onClick={() => removeImportImage(p.id)}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-red-500"
                              >✕</button>
                            </div>
                          ))}
                          {importImages.length < 5 && (
                            <button
                              onClick={() => importInputRef.current?.click()}
                              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-xl text-gray-400 hover:border-blue-400"
                            >+</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* B. 텍스트 붙여넣기 */}
                    <div>
                      <Label>💬 텍스트 (카톡 매물정보 · 이메일 · 메모)</Label>
                      <p className="text-[11px] text-gray-400 mb-2">공동중개로 받은 매물 정보, 메모, 광고 텍스트 등을 그대로 붙여넣기</p>
                      <textarea
                        value={importText}
                        onChange={e => setImportText(e.target.value)}
                        rows={5}
                        placeholder={`예:\n[힐스테이트 에코미사 39B] 매매 2억9600\n13층/20층 복층, 서향, 관리비 15만원\n미사역 도보 1분, 463세대, 26년12월 만기 임차인 있음`}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>

                    {/* D. URL */}
                    <div>
                      <Label>🔗 URL (네이버 부동산 등 매물 페이지)</Label>
                      <p className="text-[11px] text-gray-400 mb-2">⚠️ 네이버는 자동수집을 차단할 수 있음 — 차단 시 스크린샷 권장</p>
                      <input
                        value={importUrl}
                        onChange={e => setImportUrl(e.target.value)}
                        placeholder="https://land.naver.com/article/..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {importError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-red-600 text-xs whitespace-pre-wrap break-all">{importError}</p>
                    </div>
                  )}

                  <button
                    onClick={runImport}
                    disabled={importLoading || (importImages.length === 0 && !importText.trim() && !importUrl.trim())}
                    className="w-full mt-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-2xl text-sm transition-colors"
                  >
                    {importLoading ? "🤖 AI가 정보 추출 중..." : "✨ AI 추출 시작"}
                  </button>
                </>
              ) : (
                <>
                  {/* 추출 결과 미리보기 */}
                  <p className="text-xs font-bold text-green-700 mb-3">✅ 추출된 정보 — 확인 후 양식에 적용</p>
                  <div className="space-y-1.5">
                    {([
                      ["매물분류", importExtracted.propertyType],
                      ["거래종류", importExtracted.dealType],
                      ["소재지", importExtracted.location],
                      ["단지명", importExtracted.complexName],
                      ["매매가", importExtracted.price ? `${importExtracted.price}만원` : null],
                      ["보증금", importExtracted.deposit ? `${importExtracted.deposit}만원` : null],
                      ["월세",   importExtracted.monthly ? `${importExtracted.monthly}만원` : null],
                      ["전용면적", importExtracted.exclusiveArea ? `${importExtracted.exclusiveArea}㎡` : null],
                      ["계약면적", importExtracted.contractArea ? `${importExtracted.contractArea}㎡` : null],
                      ["층수",   importExtracted.floor ? `${importExtracted.floor}층 / ${importExtracted.totalFloor || "?"}층` : null],
                      ["방/욕실", importExtracted.rooms ? `${importExtracted.rooms} / ${importExtracted.bathrooms || "?"}` : null],
                      ["방향",   importExtracted.direction],
                      ["복층",   importExtracted.isDuplex === true ? "복층" : null],
                      ["관리비", importExtracted.maintenanceFee ? `${importExtracted.maintenanceFee}만원` : null],
                      ["난방",   importExtracted.heating],
                      ["옵션",   importExtracted.options],
                      ["장점",   importExtracted.highlights],
                      ["특이사항", importExtracted.notes],
                      ["세대수", importExtracted.complexUnits ? `${importExtracted.complexUnits}세대` : null],
                    ] as [string, string | number | null | undefined][])
                      .filter(([, v]) => v !== null && v !== undefined && v !== "")
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-3 text-sm bg-gray-50 rounded-xl px-3 py-2">
                          <span className="text-gray-500 w-16 sm:w-20 shrink-0 text-xs">{k}</span>
                          <span className="text-gray-800 font-medium flex-1">{String(v)}</span>
                        </div>
                      ))
                    }
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-5">
                    <button
                      onClick={() => setImportExtracted(null)}
                      className="py-3 rounded-2xl text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      ← 다시 입력
                    </button>
                    <button
                      onClick={applyImport}
                      className="py-3 rounded-2xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      ✓ 양식에 적용
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 히스토리 모달 */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowHistory(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">📂 매물 히스토리 ({history.length})</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              {history.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">저장된 매물이 없습니다.<br/>매물 생성 후 &ldquo;💾 매물 저장&rdquo; 버튼을 눌러주세요.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-200 hover:border-blue-400 transition-colors">
                      {h.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.thumbnail} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">🏠</div>
                      )}
                      <button onClick={() => loadHistory(h)} className="flex-1 text-left min-w-0">
                        <p className="font-medium text-sm text-gray-800 truncate">{h.form.complexName || h.form.location || "(이름 없음)"}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {h.form.dealType} · {h.form.propertyType}
                          {h.form.exclusiveArea && ` · 전용 ${h.form.exclusiveArea}㎡`}
                          {h.form.floor && ` · ${h.form.floor}층`}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{new Date(h.savedAt).toLocaleString("ko-KR")}</p>
                      </button>
                      <button onClick={() => deleteHistory(h.id)} className="text-gray-300 hover:text-red-500 text-sm px-2 shrink-0">🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 템플릿 모달 */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowTemplates(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">📋 템플릿 ({templates.length})</h3>
              <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              {templates.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">저장된 템플릿이 없습니다.<br/>자주 쓰는 매물 양식을 템플릿으로 저장해보세요.</p>
              ) : (
                <div className="space-y-2">
                  {templates.map(t => (
                    <div key={t.id} className="flex items-center gap-2 p-3 rounded-2xl border border-gray-200 hover:border-blue-400 transition-colors">
                      <button onClick={() => loadTemplate(t)} className="flex-1 text-left min-w-0">
                        <p className="font-medium text-sm text-gray-800 truncate">{t.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {t.form.dealType} · {t.form.propertyType}
                          {t.form.complexName && ` · ${t.form.complexName}`}
                        </p>
                      </button>
                      <button onClick={() => deleteTemplate(t.id)} className="text-gray-300 hover:text-red-500 text-sm px-2 shrink-0">🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
