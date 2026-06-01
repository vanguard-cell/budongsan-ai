import { NextRequest, NextResponse } from "next/server";

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  if (!KAKAO_KEY || KAKAO_KEY === "여기에_카카오_키") {
    return NextResponse.json([
      { name: "힐스테이트 에코미사", address: "경기도 하남시 미사강변동" },
      { name: "미사역파라곤", address: "경기도 하남시 망월동" },
    ]);
  }

  try {
    // 카카오 키워드 검색 API — size 최대 15, page 1~45
    // 여러 페이지를 합쳐 최대 45건까지 반환 (실제로는 보통 10~30건)
    // pages 파라미터: ?pages=3 으로 호출 단지 조회 시 3페이지 합침 (자동완성은 1페이지)
    const pages = Math.max(1, Math.min(3, parseInt(req.nextUrl.searchParams.get("pages") || "1", 10)));
    const allDocs: unknown[] = [];

    for (let p = 1; p <= pages; p++) {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=15&page=${p}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, cache: "no-store" }
      );
      if (!res.ok) break;
      const data = await res.json();
      const docs = data.documents ?? [];
      allDocs.push(...docs);
      // is_end이면 더 가져올 게 없으므로 중단
      if (data.meta?.is_end) break;
    }

    // 중복 제거 (place_name + address_name 기준)
    const seen = new Set<string>();
    const results = (allDocs as Array<{
      place_name: string; road_address_name: string; address_name: string;
      category_name: string; x: string; y: string;
    }>).filter(d => {
      const key = `${d.place_name}|${d.road_address_name || d.address_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(d => ({
      name: d.place_name,
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
