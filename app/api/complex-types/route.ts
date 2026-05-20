import { NextRequest, NextResponse } from "next/server";

const MOLIT_KEY = process.env.MOLIT_API_KEY;

function getLawdCd(location: string): string {
  const map: Record<string, string> = {
    "서울": "11", "부산": "26", "대구": "27", "인천": "28", "광주": "29",
    "대전": "30", "울산": "31", "세종": "36",
    "경기": "41", "강원": "42", "충북": "43", "충남": "44",
    "전북": "45", "전남": "46", "경북": "47", "경남": "48", "제주": "50",
    "수원": "41110", "성남": "41130", "의정부": "41150", "안양": "41170",
    "부천": "41190", "광명": "41210", "평택": "41220", "동두천": "41250",
    "안산": "41270", "고양": "41280", "과천": "41290", "구리": "41310",
    "남양주": "41360", "오산": "41370", "시흥": "41390", "군포": "41410",
    "의왕": "41430", "하남": "41450", "용인": "41460", "파주": "41480",
    "이천": "41500", "안성": "41550", "김포": "41570", "화성": "41590",
    "광주시": "41610", "양주": "41630", "포천": "41650", "여주": "41670",
    "강남구": "11680", "서초구": "11650", "송파구": "11710", "마포구": "11440",
    "용산구": "11170", "성동구": "11200", "광진구": "11215", "동대문구": "11230",
    "중랑구": "11260", "성북구": "11290", "강북구": "11305", "도봉구": "11320",
    "노원구": "11350", "은평구": "11380", "서대문구": "11410", "강서구": "11500",
    "양천구": "11470", "구로구": "11530", "금천구": "11545", "영등포구": "11560",
    "동작구": "11590", "관악구": "11620", "강동구": "11740", "종로구": "11110",
  };
  const sorted = Object.entries(map).sort((a, b) =>
    b[1].length - a[1].length || b[0].length - a[0].length
  );
  for (const [key, code] of sorted) {
    if (location.includes(key)) return code;
  }
  return "41450";
}

// 매물종류별 매매 API
function getTradeApi(propertyType: string): string {
  if (propertyType === "오피스텔") return "RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade";
  if (propertyType === "빌라/다세대" || propertyType === "원룸/투룸") return "RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade";
  return "RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"; // 아파트 기본
}

function getTag(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`))?.[1]?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  const { complexName, location, propertyType } = await req.json();
  if (!complexName || complexName.length < 2) return NextResponse.json([]);
  if (!MOLIT_KEY || MOLIT_KEY === "여기에_공공데이터_키") return NextResponse.json([]);

  const lawdCd = getLawdCd(location || "");
  const apiPath = getTradeApi(propertyType || "아파트");
  const now = new Date();
  const areaCount = new Map<number, number>();
  const nameKey = complexName.replace(/\s/g, "").slice(0, 4);

  // 최근 12개월 조회
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    const url = `https://apis.data.go.kr/1613000/${apiPath}?LAWD_CD=${lawdCd}&DEAL_YMD=${ym}&serviceKey=${MOLIT_KEY}&numOfRows=100&pageNo=1`;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      const matches = text.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

      for (const m of matches) {
        const nm = getTag(m, "aptNm") || getTag(m, "offiNm") || getTag(m, "mhouseNm");
        if (!nm.includes(nameKey)) continue;
        const areaStr = getTag(m, "excluUseAr") || getTag(m, "totalFloorAr");
        const area = Math.round(parseFloat(areaStr) * 100) / 100;
        if (isNaN(area) || area <= 0) continue;
        areaCount.set(area, (areaCount.get(area) ?? 0) + 1);
      }
    } catch { continue; }
  }

  const types = Array.from(areaCount.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([area, count]) => ({ area, count }));

  return NextResponse.json(types);
}
