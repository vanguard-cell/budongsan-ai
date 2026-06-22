import { NextRequest, NextResponse } from "next/server";

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

/** 매물 유형 → 카카오 검색에 덧붙일 건물 키워드 (유형별 검색용) */
const TYPE_QUERY_WORD: Record<string, string> = {
  "아파트": "아파트",
  "오피스텔": "오피스텔",
  "빌라/다세대": "빌라",
  "원룸/투룸": "원룸",
  "상가": "상가",
  "사무실": "사무실",
};

/** 매물 유형 → 결과 category_name 매칭 (해당 유형만 추리기). 함수로 정확히 구분 */
function typeMatcher(type: string): ((cat: string) => boolean) | null {
  switch (type) {
    case "아파트":     return c => c.includes("아파트") && !c.includes("상가");
    case "오피스텔":   return c => c.includes("오피스텔");
    case "상가":       return c => c.includes("상가") || c.includes("아케이드");
    case "사무실":     return c => c.includes("사무") || (c.includes("오피스") && !c.includes("오피스텔"));
    case "빌라/다세대": return c => /빌라|연립|다세대|주택/.test(c);
    case "원룸/투룸":   return c => /원룸|투룸|다세대|주택/.test(c);
    default:           return null;   // 토지·기타 등은 유형 필터 없이 건물만
  }
}

/** 단지/건물로 볼 카테고리인지 (음식점·카페·병원 등 POI 잡음 제거) */
function isBuilding(cat: string): boolean {
  return /부동산|주거시설|아파트|오피스텔|오피스|빌라|연립|다세대|주택|상가|아케이드|사무|빌딩|지식산업|타워/.test(cat);
}

/** 단지명 끝의 유형 접미사 제거 — "…오피스텔" / "…아파트" → 빼기 (괄호는 보존) */
function cleanName(name: string): string {
  const cleaned = name.replace(/\s*(아파트|오피스텔)(\s*\([^)]*\))?\s*$/, "$2").trim();
  return cleaned || name;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const type = req.nextUrl.searchParams.get("type")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  if (!KAKAO_KEY || KAKAO_KEY === "여기에_카카오_키") {
    return NextResponse.json([
      { name: "힐스테이트 에코미사", address: "경기도 하남시 미사강변동", category: "오피스텔" },
      { name: "미사역파라곤", address: "경기도 하남시 망월동", category: "아파트" },
    ]);
  }

  try {
    const pages = Math.max(1, Math.min(3, parseInt(req.nextUrl.searchParams.get("pages") || "1", 10)));
    // 유형이 지정되면 검색어에 건물 키워드를 덧붙여 그 유형 위주로 조회 (네이버·선방처럼 단지 위주)
    const typeWord = TYPE_QUERY_WORD[type] || "";
    const query = typeWord && !q.includes(typeWord) ? `${q} ${typeWord}` : q;

    const allDocs: Array<{
      place_name: string; road_address_name: string; address_name: string;
      category_name: string; x: string; y: string;
    }> = [];

    for (let p = 1; p <= pages; p++) {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=15&page=${p}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, cache: "no-store" }
      );
      if (!res.ok) break;
      const data = await res.json();
      allDocs.push(...(data.documents ?? []));
      if (data.meta?.is_end) break;
    }

    const matcher = typeMatcher(type);
    const seen = new Set<string>();
    let docs = allDocs.filter(d => {
      const cat = d.category_name || "";
      if (!isBuilding(cat)) return false;            // 단지/건물만 (POI 잡음 제거)
      if (matcher && !matcher(cat)) return false;     // 선택 유형만
      const key = `${d.place_name}|${d.road_address_name || d.address_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 유형 필터로 결과가 0이면 — 건물 전체로 폴백(빈 화면 방지)
    if (docs.length === 0 && matcher) {
      const seen2 = new Set<string>();
      docs = allDocs.filter(d => {
        if (!isBuilding(d.category_name || "")) return false;
        const key = `${d.place_name}|${d.road_address_name || d.address_name}`;
        if (seen2.has(key)) return false;
        seen2.add(key);
        return true;
      });
    }

    const results = docs.map(d => ({
      name: cleanName(d.place_name),
      address: d.road_address_name || d.address_name,
      category: d.category_name?.split(">").pop()?.trim() ?? "",
      x: d.x,
      y: d.y,
    }));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
