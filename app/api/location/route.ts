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

async function searchNearby(x: string, y: string, category: string, radius = 1000, size = 3) {
  const data = await kakaoFetch(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${category}&x=${x}&y=${y}&radius=${radius}&sort=distance&size=${size}`);
  return (data?.documents as KakaoPlace[]) ?? [];
}

function walkMin(distanceM: string) {
  const m = Number(distanceM);
  const min = Math.round(m / 67); // 도보 67m/분 기준
  return min < 1 ? 1 : min;
}

function fmt(places: KakaoPlace[]) {
  return places.map(p => `${p.place_name} 도보 ${walkMin(p.distance)}분 (${p.distance}m)`);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const location: string = body.location || body.address || "";
  const complexName: string = body.complexName || "";
  const address = location || complexName;

  if (!address) return NextResponse.json({ error: "주소를 입력해주세요." }, { status: 400 });

  if (!KAKAO_KEY || KAKAO_KEY === "여기에_카카오_키") {
    return NextResponse.json({
      subway: ["미사역 (5호선) 도보 2분 (130m)"],
      bus: ["미사강변중앙광장 정류장 도보 1분 (70m)"],
      school: ["미사강변초등학교 도보 5분 (330m)"],
      mart: ["GS25 미사강변점 도보 2분 (100m)"],
      hospital: ["미사강변소아과 도보 4분 (260m)"],
      summary: "미사역(5호선) 도보 2분 초역세권. 편의점·학교·병원 모두 도보 10분 이내.",
    });
  }

  try {
    // 자동완성으로 선택된 경우 카카오가 준 정확한 좌표 직접 사용
    const coords: { x: string; y: string } | null =
      body.x && body.y
        ? { x: body.x, y: body.y }
        : await getBestCoords(location, complexName);

    if (!coords) return NextResponse.json({ error: "위치를 찾을 수 없습니다." }, { status: 400 });

    const { x, y } = coords;

    // 병렬 조회: 지하철(1000m), 버스정류장(500m), 학교(1000m), 대형마트(1500m), 편의점(500m), 병원(1000m)
    const [subwayList, busList, schoolList, martList, cvsList, hospitalList] = await Promise.all([
      searchNearby(x, y, "SW8", 1000), // 지하철역
      searchNearby(x, y, "BS8", 1000), // 버스정류장
      searchNearby(x, y, "SC4", 1000), // 학교
      searchNearby(x, y, "MT1", 1500), // 대형마트 (반경 넓게)
      searchNearby(x, y, "CS2", 500),  // 편의점 (대형마트 없을 때 대체)
      searchNearby(x, y, "HP8", 1000), // 병원
    ]);

    const subway = fmt(subwayList);
    const bus = fmt(busList);
    const school = fmt(schoolList);
    // 대형마트 있으면 우선, 없으면 편의점으로 대체
    const mart = martList.length > 0 ? fmt(martList) : fmt(cvsList);
    const hospital = fmt(hospitalList);

    // summary: 실제 있는 것만 포함
    const summaryParts: string[] = [];
    if (subway[0]) summaryParts.push(subway[0]);
    else if (bus[0]) summaryParts.push(`버스 ${bus[0]}`);
    if (mart[0]) summaryParts.push(mart[0]);
    if (school[0]) summaryParts.push(school[0]);
    if (hospital[0]) summaryParts.push(hospital[0]);

    const summary = summaryParts.length > 0
      ? summaryParts.join(". ") + "."
      : "주변 인프라를 직접 확인해주세요.";

    return NextResponse.json({ subway, bus, school, mart, hospital, summary });
  } catch (err) {
    console.error("location error:", err);
    return NextResponse.json({ error: "위치 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
