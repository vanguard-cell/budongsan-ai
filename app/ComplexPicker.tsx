"use client";

/**
 * 시/도 → 시/군/구 → 읍/면/동 → 건물유형 선택으로 단지 목록 조회
 * 만기 관리(계약 추가/수정) + 매물 도우미 공용 컴포넌트
 */

import { useState, useEffect } from "react";

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
    "하남시": ["미사강변동", "망월동", "풍산동", "덕풍동", "창우동", "신장동", "감북동", "초일동", "하산곡동", "항동", "학암동", "상산곡동", "춘궁동", "광암동", "교산동", "천현동", "배알미동", "왕산동"],
    "성남시 분당구": ["정자동", "서현동", "야탑동", "판교동", "삼평동", "백현동", "분당동", "수내동", "구미동", "금곡동", "운중동"],
    "성남시 수정구": ["수진동", "신흥동", "태평동", "단대동", "산성동", "복정동", "창곡동"],
    "성남시 중원구": ["상대원동", "은행동", "금광동", "중앙동", "갈현동", "하대원동"],
    "광주시": ["오포읍", "곤지암읍", "초월읍", "태전동", "역동", "송정동", "탄벌동", "쌍령동"],
    "구리시": ["인창동", "교문동", "갈매동", "수택동", "토평동", "아천동", "사노동"],
    "남양주시": ["다산동", "별내동", "진접읍", "오남읍", "화도읍", "퇴계원읍", "와부읍", "양정동", "지금동"],
    "용인시 수지구": ["죽전동", "풍덕천동", "동천동", "신봉동", "상현동", "고기동"],
    "용인시 기흥구": ["구성동", "보정동", "신갈동", "영덕동", "언남동"],
    "화성시": ["동탄동", "봉담읍", "향남읍", "남양읍", "비봉면"],
    "수원시 영통구": ["영통동", "매탄동", "원천동", "망포동", "이의동"],
    "수원시 팔달구": ["우만동", "인계동", "화서동"],
    "안양시 동안구": ["평촌동", "호계동", "관양동", "비산동"],
    "부천시": ["상동", "중동", "여월동", "원미동"],
    "고양시 일산동구": ["장항동", "마두동", "백석동", "식사동"],
    "고양시 일산서구": ["주엽동", "일산동", "탄현동"],
  },
  "서울특별시": {
    "강동구": ["천호동", "길동", "성내동", "암사동", "고덕동", "둔촌동", "강일동", "상일동", "명일동"],
    "송파구": ["잠실동", "가락동", "문정동", "방이동", "오금동", "석촌동", "삼전동", "풍납동", "거여동", "마천동"],
    "강남구": ["역삼동", "삼성동", "대치동", "개포동", "청담동", "도곡동", "압구정동", "논현동"],
    "강서구": ["마곡동", "화곡동", "방화동", "등촌동", "가양동", "염창동"],
    "마포구": ["상암동", "공덕동", "망원동", "합정동", "서교동"],
    "성동구": ["성수동", "왕십리동", "금호동", "옥수동", "행당동"],
    "노원구": ["상계동", "중계동", "하계동", "공릉동"],
    "도봉구": ["창동", "방학동", "도봉동"],
    "중랑구": ["면목동", "신내동", "상봉동"],
    "광진구": ["광장동", "구의동", "자양동", "중곡동"],
  },
  "인천광역시": {
    "서구": ["검단동", "당하동", "마전동", "청라동", "원당동", "불로동", "오류동"],
    "연수구": ["송도동", "연수동", "청학동", "옥련동", "동춘동", "선학동"],
    "남동구": ["구월동", "간석동", "논현동", "만수동", "서창동"],
    "부평구": ["부평동", "산곡동", "청천동", "십정동", "갈산동"],
    "계양구": ["계산동", "작전동", "귤현동"],
    "미추홀구": ["주안동", "용현동", "학익동"],
  },
};

interface Props {
  onSelect: (item: ComplexResult) => void;
  /** 외부 폼에서 이미 선택한 매물 유형 — 전달 시 내부 건물유형 선택 UI 숨김 */
  externalBuildingType?: string;
}

/** 매물 유형(8종) → 단지 검색에 쓰는 건물유형(6종) 매핑 */
function mapPropertyTypeToBuilding(t: string | undefined): string {
  if (!t) return "";
  if (BUILDING_TYPES.includes(t)) return t;       // 아파트·오피스텔·상가·사무실
  if (t === "빌라/다세대") return "빌라";
  if (t === "원룸/투룸")  return "원룸/투룸";
  if (t === "토지")       return "";              // 토지는 단지 검색 불가
  return "";
}

export default function ComplexPicker({ onSelect, externalBuildingType }: Props) {
  const mappedExternal = mapPropertyTypeToBuilding(externalBuildingType);
  const hideTypeUI = !!mappedExternal;

  const [open, setOpen] = useState(false);
  const [sido, setSido] = useState("경기도");
  const [sigungu, setSigungu] = useState("하남시");
  const [dong, setDong] = useState("");
  const [buildingType, setBuildingType] = useState(mappedExternal || "");
  const [results, setResults] = useState<ComplexResult[]>([]);
  const [loading, setLoading] = useState(false);

  const sigunguList = Object.keys(REGION_DATA[sido] ?? {});
  const dongList = REGION_DATA[sido]?.[sigungu] ?? [];

  // 부모의 buildingType이 바뀌면 내부 state 동기화
  useEffect(() => {
    if (mappedExternal && buildingType !== mappedExternal) {
      setBuildingType(mappedExternal);
      setResults([]);  // 유형 바뀌면 이전 결과 초기화
    }
  }, [mappedExternal, buildingType]);

  const search = async () => {
    const effectiveBT = mappedExternal || buildingType;
    const location = [sido, sigungu, dong].filter(Boolean).join(" ");
    if (!sigungu || !effectiveBT) return;
    setLoading(true);
    setResults([]);
    try {
      const q = `${location} ${effectiveBT}`;
      // pages=3으로 최대 45건 조회 (자동완성은 기본 1페이지)
      const res = await fetch(`/api/complex-search?q=${encodeURIComponent(q)}&pages=3`);
      const data: ComplexResult[] = await res.json();
      setResults(data);
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

      {/* 건물 유형 — 외부에서 받았으면 UI 완전 숨김 (자동 사용) */}
      {!hideTypeUI && (
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
      )}

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
        <>
          <div className="text-[10px] text-gray-500 text-right -mb-1">총 {results.length}건</div>
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white max-h-80 overflow-y-auto">
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
        </>
      )}

      {!loading && results.length === 0 && sigungu && buildingType && (
        <p className="text-xs text-gray-400 text-center py-1">검색 버튼을 눌러 단지를 조회하세요</p>
      )}
    </div>
  );
}
