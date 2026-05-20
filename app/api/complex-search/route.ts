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
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=8`,
      { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();

    const results = (data.documents ?? []).map((d: {
      place_name: string; road_address_name: string; address_name: string;
      category_name: string; x: string; y: string;
    }) => ({
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
