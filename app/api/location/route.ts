import { NextRequest, NextResponse } from "next/server";

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

interface KakaoPlace {
  place_name: string;
  category_group_name: string;
  distance: string;
}

async function kakaoFetch(url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("Kakao API error:", res.status, await res.text());
    return null;
  }
  return res.json();
}

async function addrCoords(q: string): Promise<{ x: string; y: string } | null> {
  const r = await kakaoFetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}`);
  if (!r?.documents?.[0]) return null;
  const d = r.documents[0];
  const x = d.x ?? d.road_address?.x ?? d.address?.x;
  const y = d.y ?? d.road_address?.y ?? d.address?.y;
  return x && y ? { x, y } : null;
}

async function kwCoords(q: string): Promise<{ x: string; y: string } | null> {
  const r = await kakaoFetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=1`);
  if (!r?.documents?.[0]) return null;
  return { x: r.documents[0].x, y: r.documents[0].y };
}

async function getBestCoords(location: string, complexName: string): Promise<{ x: string; y: string } | null> {
  // 1. 도로명/지번 주소로 정확한 좌표 (가장 신뢰도 높음)
  if (location) {
    const r = await addrCoords(location);
    if (r) return r;
  }

  // 2. 단지명 + 시/구 앞부분 (동명이인 단지 방지)
  if (complexName && location) {
    const city = location.split(" ")[0]; // "오산시", "하남시" 등
    const r = await kwCoords(`${complexName} ${city}`);
    if (r) return r;
  }

  // 3. 단지명만 (공백 제거)
  if (complexName) {
    const r = await kwCoords(complexName.replace(/\s+/g, ""));
    if (r) return r;
    const r2 = await kwCoords(complexName);
    if (r2) return r2;
  }

  // 4. 소재지 키워드 검색
  if (location) {
    const r = await kwCoords(location);
    if (r) return r;
  }

  return null;
}

async function searchNearby(x: string, y: string, category: string, radius = 1500) {
  const data = await kakaoFetch(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${category}&x=${x}&y=${y}&radius=${radius}&sort=distance&size=3`);
  return (data?.documents as KakaoPlace[]) ?? [];
}

function walkMin(distanceM: string) {
  const m = Number(distanceM);
  const min = Math.round(m / 67); // 도보 67m/분 기준
  return min < 1 ? 1 : min;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // { address } (구형) 또는 { location, complexName } (신형) 모두 지원
  const location: string = body.location || body.address || "";
  const complexName: string = body.complexName || "";
  const address = location || complexName;

  if (!address) return NextResponse.json({ error: "주소를 입력해주세요." }, { status: 400 });

  if (!KAKAO_KEY || KAKAO_KEY === "여기에_카카오_키") {
    return NextResponse.json({
      subway: ["미사역 (5호선) 도보 2분 (130m)", "하남풍산역 (5호선) 도보 12분 (820m)"],
      school: ["미사강변초등학교 도보 5분 (330m)", "미사중학교 도보 9분 (580m)"],
      mart: ["이마트 미사점 도보 6분 (400m)", "GS25 미사강변점 도보 2분 (100m)"],
      hospital: ["미사강변소아과 도보 4분 (260m)", "하남365의원 도보 8분 (510m)"],
      summary: "미사역(5호선) 도보 2분 초역세권. 이마트·학교·병원 모두 도보 10분 이내.",
    });
  }

  try {
    const coords = await getBestCoords(location, complexName);
    if (!coords) return NextResponse.json({ error: "위치를 찾을 수 없습니다." }, { status: 400 });

    const { x, y } = coords;

    const [subwayList, schoolList, martList, hospitalList] = await Promise.all([
      searchNearby(x, y, "SW8"), // 지하철역
      searchNearby(x, y, "SC4"), // 학교
      searchNearby(x, y, "MT1"), // 대형마트
      searchNearby(x, y, "HP8"), // 병원
    ]);

    const fmt = (places: KakaoPlace[]) =>
      places.map(p => `${p.place_name} 도보 ${walkMin(p.distance)}분 (${p.distance}m)`);

    const subway = fmt(subwayList);
    const school = fmt(schoolList);
    const mart = fmt(martList);
    const hospital = fmt(hospitalList);

    const summaryParts: string[] = [];
    if (subway[0]) summaryParts.push(subway[0]);
    if (mart[0]) summaryParts.push(mart[0]);
    if (school[0]) summaryParts.push(school[0]);

    return NextResponse.json({
      subway, school, mart, hospital,
      summary: summaryParts.join(". ") + ". 생활 인프라 우수.",
    });
  } catch (err) {
    console.error("location error:", err);
    return NextResponse.json({ error: "위치 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
