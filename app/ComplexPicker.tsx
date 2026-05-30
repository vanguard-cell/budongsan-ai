"use client";

/**
 * 시/도 → 시/군/구 → 읍/면/동 → 건물유형 선택으로 단지 목록 조회
 * 만기 관리(계약 추가/수정) + 매물 도우미 공용 컴포넌트
 */

import { useState } from "react";

export interface ComplexResult {
  name: string;
  address: string;
  category?: string;
  x?: string;
  y?: string;
}

const BUILDING_TYPES = ["아파트", "오피스텔", "빌라", "원룸/투룸", "상가", "사무실"];

const REGION_DATA: Record<string, Record<string, string[]>> = {
  "경기도": {
    "하남시": ["미사강변동", "망월동", "풍산동", "덕풍동", "창우동", "신장동", "감북동", "초일동"],
    "성남시 분당구": ["정자동", "서현동", "야탑동", "판교동", "삼평동"],
    "성남시 수정구": ["수진동", "신흥동", "태평동"],
    "성남시 중원구": ["상대원동", "은행동", "금광동"],
    "광주시": ["오포읍", "곤지암읍", "초월읍", "태전동"],
    "구리시": ["인창동", "교문동", "갈매동", "수택동"],
    "남양주시": ["다산동", "별내동", "진접읍", "오남읍"],
    "용인시 수지구": ["죽전동", "풍덕천동", "동천동"],
    "화성시": ["동탄동", "봉담읍", "향남읍"],
  },
  "서울특별시": {
    "강동구": ["천호동", "길동", "성내동", "암사동", "고덕동", "둔촌동"],
    "송파구": ["잠실동", "가락동", "문정동", "방이동", "오금동"],
    "강남구": ["역삼동", "삼성동", "대치동", "개포동", "청담동"],
    "강서구": ["마곡동", "화곡동", "방화동"],
    "마포구": ["상암동", "공덕동", "망원동"],
    "성동구": ["성수동", "왕십리동", "금호동"],
  },
  "인천광역시": {
    "서구": ["검단동", "당하동", "마전동", "청라동"],
    "연수구": ["송도동", "연수동", "청학동", "옥련동"],
    "남동구": ["구월동", "간석동", "논현동"],
    "부평구": ["부평동", "산곡동", "청천동"],
  },
};

interface Props {
  onSelect: (item: ComplexResult) => void;
}

export default function ComplexPicker({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [sido, setSido] = useState("경기도");
  const [sigungu, setSigungu] = useState("하남시");
  const [dong, setDong] = useState("");
  const [buildingType, setBuildingType] = useState("");
  const [results, setResults] = useState<ComplexResult[]>([]);
  const [loading, setLoading] = useState(false);

  const sigunguList = Object.keys(REGION_DATA[sido] ?? {});
  const dongList = REGION_DATA[sido]?.[sigungu] ?? [];

  const search = async () => {
    const location = [sido, sigungu, dong].filter(Boolean).join(" ");
    if (!sigungu || !buildingType) return;
    setLoading(true);
    setResults([]);
    try {
      const q = `${location} ${buildingType}`;
      const res = await fetch(`/api/complex-search?q=${encodeURIComponent(q)}`);
      const data: ComplexResult[] = await res.json();
      setResults(data.slice(0, 12));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const pick = (item: ComplexResult) => {
    onSelect(item);
    setOpen(false);
    setResults([]);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-2 rounded-xl border border-dashed border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
      >
        🔍 시/도 · 시/군/구 · 동 선택으로 단지 검색
      </button>
    );
  }

  return (
    <div className="border border-blue-200 rounded-2xl p-3 bg-blue-50/40 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-700">🔍 단지 검색</span>
        <button
          type="button"
          onClick={() => { setOpen(false); setResults([]); }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          닫기
        </button>
      </div>

      {/* 시/도 → 시/군/구 → 읍/면/동 */}
      <div className="grid grid-cols-3 gap-1.5">
        <select
          value={sido}
          onChange={e => { setSido(e.target.value); setSigungu(""); setDong(""); setResults([]); }}
          className="border border-gray-200 rounded-xl px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.keys(REGION_DATA).map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={sigungu}
          onChange={e => { setSigungu(e.target.value); setDong(""); setResults([]); }}
          className="border border-gray-200 rounded-xl px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">시/군/구</option>
          {sigunguList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={dong}
          onChange={e => { setDong(e.target.value); setResults([]); }}
          className="border border-gray-200 rounded-xl px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">읍/면/동</option>
          {dongList.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* 건물 유형 */}
      <div className="grid grid-cols-3 gap-1.5">
        {BUILDING_TYPES.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setBuildingType(t); setResults([]); }}
            className={`py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              buildingType === t
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={search}
        disabled={loading || !sigungu || !buildingType}
        className="w-full py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "검색 중…" : "단지 목록 조회"}
      </button>

      {/* 결과 목록 */}
      {results.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto">
          {results.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(item)}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b last:border-0 border-gray-100 transition-colors"
            >
              <div className="text-sm font-medium text-gray-800">{item.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.address}</div>
            </button>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && sigungu && buildingType && (
        <p className="text-xs text-gray-400 text-center py-1">검색 버튼을 눌러 단지를 조회하세요</p>
      )}
    </div>
  );
}
