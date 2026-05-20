import { NextRequest, NextResponse } from "next/server";

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

interface KakaoPlace {
  place_name: string;
  category_group_name: string;
  distance: string;
  x: string; // 경도 (longitude)
  y: string; // 위도 (latitude)
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
  if (location) {
    const r = await addrCoords(location);
    if (r) return r;
  }
  if (complexName && location) {
    const city = location.split(" ")[0];
    const r = await kwCoords(`${complexName} ${city}`);
    if (r) return r;
  }
  if (complexName) {
    const r = await kwCoords(complexName.replace(/\s+/g, ""));
    if (r) return r;
    const r2 = await kwCoords(complexName);
    if (r2) return r2;
  }
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

// 아울렛/백화점은 카테고리 코드 없어서 키워드 검색 사용
async function searchOutlet(x: string, y: string, radius = 2000) {
  const [r1, r2] = await Promise.all([
    kakaoFetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=아울렛&x=${x}&y=${y}&radius=${radius}&sort=distance&size=3`),
    kakaoFetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=백화점&x=${x}&y=${y}&radius=${radius}&sort=distance&size=3`),
  ]);
  const list = [...((r1?.documents as KakaoPlace[]) ?? []), ...((r2?.documents as KakaoPlace[]) ?? [])];
  return list.sort((a, b) => Number(a.distance) - Number(b.distance)).slice(0, 3);
}

// OSRM 공개 서버로 실제 도보 경로 시간 조회 (초 → 분)
// 실패 시 null 반환 → 직선거리 추정값으로 폴백
async function getWalkRoute(fromX: string, fromY: string, toX: string, toY: string): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${fromX},${fromY};${toX},${toY}?overview=false`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000), // 3초 안에 응답 없으면 포기
    });
    if (!res.ok) return null;
    const data = await res.json();
    const sec = data?.routes?.[0]?.duration;
    return sec ? Math.ceil(sec / 60) : null;
  } catch {
    return null; // 타임아웃 또는 네트워크 오류 → 폴백
  }
}

// 직선거리 기반 추정 도보 시간 (폴백용)
function walkMinFallback(distanceM: string) {
  const m = Number(distanceM);
  const min = Math.round((m * 1.3) / 67); // 직선거리 × 1.3 보정 후 67m/분
  return min < 1 ? 1 : min;
}

// 장소 목록 포맷: 첫 번째 항목에 실제 도보 시간 적용, 나머지는 추정
function fmt(places: KakaoPlace[], firstRouteMin?: number | null) {
  return places.map((p, i) => {
    const min = (i === 0 && firstRouteMin != null) ? firstRouteMin : walkMinFallback(p.distance);
    return `${p.place_name} 도보 ${min}분 (${p.distance}m)`;
  });
}

// 첫 번째 결과가 있으면 OSRM 호출, 없으면 null
function routeFor(fromX: string, fromY: string, list: KakaoPlace[]): Promise<number | null> {
  return list[0] ? getWalkRoute(fromX, fromY, list[0].x, list[0].y) : Promise.resolve(null);
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
      school: ["미사강변초등학교 도보 5분 (330m)"],
      mart: ["GS25 미사강변점 도보 2분 (100m)"],
      hospital: ["미사강변소아과 도보 4분 (260m)"],
      kids: ["미사강변어린이집 도보 3분 (200m)"],
      publicOrg: [],
      academy: ["반경 1km 내 학원 8개"],
      summary: "미사역(5호선) 도보 2분 초역세권. 편의점·학교·병원 모두 도보 10분 이내.",
    });
  }

  try {
    const coords: { x: string; y: string } | null =
      body.x && body.y
        ? { x: body.x, y: body.y }
        : await getBestCoords(location, complexName);

    if (!coords) return NextResponse.json({ error: "위치를 찾을 수 없습니다." }, { status: 400 });

    const { x, y } = coords;

    // 1단계: 카카오 카테고리 검색 (병렬)
    const [subwayList, schoolList, martList, cvsList, outletList, hospitalList,
           kidsList, publicList, academyList] = await Promise.all([
      searchNearby(x, y, "SW8", 1000),     // 지하철역
      searchNearby(x, y, "SC4", 1500, 5),  // 학교 (반경 1.5km, 최대 5개)
      searchNearby(x, y, "MT1", 2000, 5),  // 대형마트 (반경 2km)
      searchNearby(x, y, "CS2", 500),       // 편의점
      searchOutlet(x, y, 2000),             // 아울렛/백화점
      searchNearby(x, y, "HP8", 1000),     // 병원
      searchNearby(x, y, "PS3", 500),      // 어린이집/유치원
      searchNearby(x, y, "PO3", 1000),     // 공공기관
      searchNearby(x, y, "AC5", 1000, 15), // 학원 (개수 파악용)
    ]);

    // 마트 실제 사용할 목록 결정 (대형마트 → 아울렛 → 편의점)
    const martBaseList = martList.length > 0 ? martList :
                         outletList.length > 0 ? outletList : cvsList;

    // 2단계: 각 카테고리 첫 번째 결과에 대해 OSRM 실제 도보 경로 조회 (병렬)
    const [subwayRoute, schoolRoute, martRoute, hospitalRoute, kidsRoute, publicRoute] =
      await Promise.all([
        routeFor(x, y, subwayList),
        routeFor(x, y, schoolList),
        routeFor(x, y, martBaseList),
        routeFor(x, y, hospitalList),
        routeFor(x, y, kidsList),
        routeFor(x, y, publicList),
      ]);

    // 3단계: 실제 도보 시간 적용해서 포맷
    const subway    = fmt(subwayList,   subwayRoute);
    const school    = fmt(schoolList,   schoolRoute);
    const mart      = fmt(martBaseList, martRoute);
    const hospital  = fmt(hospitalList, hospitalRoute);
    const kids      = fmt(kidsList,     kidsRoute);
    const publicOrg = fmt(publicList,   publicRoute);
    const academyCount = academyList.length;
    const academy = academyCount > 0 ? [`반경 1km 내 학원 ${academyCount}개`] : [];

    // summary
    const summaryParts: string[] = [];
    if (subway[0]) summaryParts.push(subway[0]);
    if (mart[0]) summaryParts.push(mart[0]);
    if (school[0]) summaryParts.push(school[0]);
    if (hospital[0]) summaryParts.push(hospital[0]);
    if (kids[0]) summaryParts.push(kids[0]);

    const summary = summaryParts.length > 0
      ? summaryParts.join(". ") + "."
      : "주변 인프라를 직접 확인해주세요.";

    return NextResponse.json({ subway, school, mart, hospital, kids, publicOrg, academy, summary });
  } catch (err) {
    console.error("location error:", err);
    return NextResponse.json({ error: "위치 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
