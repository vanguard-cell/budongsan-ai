import { NextRequest, NextResponse } from "next/server";

const MOLIT_KEY = process.env.MOLIT_API_KEY;

// 매물 종류 × 거래 종류 → API 엔드포인트
function getApi(propertyType: string, dealType: string): { svc: string; op: string; isRent: boolean } | null {
  const isRent = dealType === "전세" || dealType === "월세" || dealType === "단기임대";
  if (propertyType === "아파트") {
    return isRent
      ? { svc: "RTMSDataSvcAptRent",  op: "getRTMSDataSvcAptRent",  isRent: true  }
      : { svc: "RTMSDataSvcAptTradeDev", op: "getRTMSDataSvcAptTradeDev", isRent: false }; // 아파트 매매는 Dev 버전
  }
  if (propertyType === "오피스텔") {
    return isRent
      ? { svc: "RTMSDataSvcOffiRent",  op: "getRTMSDataSvcOffiRent",  isRent: true  }
      : { svc: "RTMSDataSvcOffiTrade", op: "getRTMSDataSvcOffiTrade", isRent: false };
  }
  if (propertyType === "빌라/다세대") {
    return isRent
      ? { svc: "RTMSDataSvcRHRent",  op: "getRTMSDataSvcRHRent",  isRent: true  }
      : { svc: "RTMSDataSvcRHTrade", op: "getRTMSDataSvcRHTrade", isRent: false };
  }
  if (propertyType === "원룸/투룸" || propertyType === "단독/다가구") {
    return isRent
      ? { svc: "RTMSDataSvcSHRent",  op: "getRTMSDataSvcSHRent",  isRent: true  }
      : { svc: "RTMSDataSvcSHTrade", op: "getRTMSDataSvcSHTrade", isRent: false };
  }
  return null;
}

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
  // 코드 자릿수(5자리 먼저) → 키 길이 순: "하남(41450)" > "경기(41)"
  const sorted = Object.entries(map).sort((a, b) =>
    b[1].length - a[1].length || b[0].length - a[0].length
  );
  for (const [key, code] of sorted) {
    if (location.includes(key)) return code;
  }
  return "41450";
}

function getTag(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`))?.[1]?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  const { location, complexName, exclusiveArea, currentPrice, propertyType, dealType, mode } = await req.json();

  // 데모 모드
  if (!MOLIT_KEY || MOLIT_KEY === "여기에_공공데이터_키") {
    const isRent = dealType === "전세" || dealType === "월세";
    const mockTrades = isRent
      ? [{ date: "2025.03", deposit: 28000, monthly: 0, area: 39.71, floor: "15층" },
         { date: "2025.01", deposit: 27000, monthly: 0, area: 39.71, floor: "10층" }]
      : [{ date: "2025.03", price: 31000, area: 39.71, floor: "15층" },
         { date: "2025.01", price: 29800, area: 39.71, floor: "10층" }];
    const current = Number(currentPrice) || 29600;
    const avgPrice = 30400;
    const diff = avgPrice - current;
    const pct = Math.round((diff / avgPrice) * 100);
    return NextResponse.json({
      trades: mockTrades, avgPrice, currentPrice: current, diff, pct, isRent,
      analysis: `동일 단지 동일 면적 최근 실거래 평균 ${avgPrice.toLocaleString()}만원 대비 현 매물 ${Math.abs(pct)}% ${pct > 0 ? "저렴" : "높은 가격"}`,
    });
  }

  try {
    const api = getApi(propertyType || "아파트", dealType || "매매");
    if (!api) {
      return NextResponse.json({ error: `${propertyType}은 현재 실거래 조회를 지원하지 않습니다. (아파트·오피스텔·빌라 가능)` });
    }

    const lawdCd = getLawdCd(location);
    const now = new Date();

    interface RawItem { nm: string; amount: string; deposit: string; monthly: string; area: string; floor: string; year: string; month: string; day: string; }
    const results: RawItem[] = [];

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      const url = `https://apis.data.go.kr/1613000/${api.svc}/${api.op}?LAWD_CD=${lawdCd}&DEAL_YMD=${ym}&serviceKey=${MOLIT_KEY}&numOfRows=100&pageNo=1`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        if (i === 0) {
          return NextResponse.json({ error: `${propertyType} ${api.isRent ? "전월세" : "매매"} 실거래 데이터가 아직 준비 중입니다. 잠시 후 다시 시도해주세요.` });
        }
        continue;
      }

      const text = await res.text();
      const matches = text.match(/<item>([\s\S]*?)<\/item>/g) || [];

      for (const m of matches) {
        // 타입별 단지명 필드 다름 (단독/다가구는 없음)
        const nm = getTag(m, "aptNm") || getTag(m, "offiNm") || getTag(m, "mhouseNm") || "";
        // 타입별 면적 필드 다름 (단독/다가구는 totalFloorAr)
        const area = getTag(m, "excluUseAr") || getTag(m, "totalFloorAr");
        // 층 (단독/다가구는 없음)
        const floor = getTag(m, "floor") || "-";
        const year = getTag(m, "dealYear");
        const month = getTag(m, "dealMonth");
        const amount = getTag(m, "dealAmount");   // 매매용
        const deposit = getTag(m, "deposit");      // 전월세용
        const monthly = getTag(m, "monthlyRent");  // 월세용

        // 단지명 필터: nm이 있을 때만 적용 (단독/다가구는 nm 없으므로 통과)
        if (complexName && nm) {
          const norm = (s: string) => s
            .replace(/[\s\-_()\[\]（）·]/g, "")
            .replace(/(아파트|오피스텔|빌라|주상복합|아이파크|더샵|자이)$/, "")
            .toLowerCase();
          const sn = norm(complexName);
          const dn = norm(nm);
          if (sn !== dn && !sn.includes(dn) && !dn.includes(sn)) continue;
        }

        // 면적 필터 (±10㎡로 완화, 면적 미입력 시 전체 조회)
        const areaNum = parseFloat(area);
        const targetArea = parseFloat(exclusiveArea);
        if (targetArea && !isNaN(areaNum) && Math.abs(areaNum - targetArea) > 10) continue;

        results.push({ nm, amount, deposit, monthly, area, floor, year, month, day: getTag(m, "dealDay") });
      }
    }

    if (!results.length) {
      return NextResponse.json({ error: "조건에 맞는 실거래 데이터가 없습니다. 단지명·면적을 확인하거나 비워두고 다시 시도해보세요." });
    }

    // ── 최고가 모드 — 최근 12개월 내 최고 거래 1건 (실거래 최고가 기록용) ──
    if (mode === "max") {
      const fmtDate = (t: RawItem) =>
        `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day || "1").padStart(2, "0")}`;
      if (api.isRent) {
        let best: RawItem | null = null;
        let bestDep = -1;
        for (const t of results) {
          const dep = parseInt((t.deposit || "0").replace(/,/g, ""), 10) || 0;
          if (dep > bestDep) { bestDep = dep; best = t; }
        }
        if (!best) return NextResponse.json({ error: "전월세 거래가 없습니다." });
        return NextResponse.json({
          high: { deposit: bestDep, monthly: parseInt(best.monthly) || 0, date: fmtDate(best), area: parseFloat(best.area), floor: best.floor, nm: best.nm },
          count: results.length, isRent: true,
        });
      } else {
        let best: RawItem | null = null;
        let bestAmt = -1;
        for (const t of results) {
          const amt = parseInt((t.amount || "0").replace(/,/g, ""), 10) || 0;
          if (amt > bestAmt) { bestAmt = amt; best = t; }
        }
        if (!best) return NextResponse.json({ error: "매매 거래가 없습니다." });
        return NextResponse.json({
          high: { price: bestAmt, date: fmtDate(best), area: parseFloat(best.area), floor: best.floor, nm: best.nm },
          count: results.length, isRent: false,
        });
      }
    }

    const recent = results.slice(0, 5);
    const current = Number(currentPrice);

    if (api.isRent) {
      // 전월세: 보증금 기준 비교
      const trades = recent.map(t => ({
        date: `${t.year}.${t.month}`,
        deposit: parseInt(t.deposit.replace(/,/g, "")) || 0,
        monthly: parseInt(t.monthly) || 0,
        area: parseFloat(t.area),
        floor: `${t.floor}층`,
      }));
      const avgDeposit = Math.round(trades.reduce((s, t) => s + t.deposit, 0) / trades.length);
      const diff = avgDeposit - current;
      const pct = avgDeposit > 0 ? Math.round((diff / avgDeposit) * 100) : 0;
      return NextResponse.json({
        trades, avgPrice: avgDeposit, currentPrice: current, diff, pct, isRent: true,
        analysis: pct > 0
          ? `동일 단지 동일 면적 최근 실거래 평균 보증금 ${avgDeposit.toLocaleString()}만원 대비 현 매물 ${Math.abs(pct)}% 저렴`
          : pct < 0
          ? `동일 단지 동일 면적 최근 실거래 평균 보증금 ${avgDeposit.toLocaleString()}만원 대비 현 매물 ${Math.abs(pct)}% 높은 가격`
          : `동일 단지 동일 면적 최근 실거래 평균과 동일한 시세`,
      });
    } else {
      // 매매: 거래금액 기준 비교
      const trades = recent.map(t => ({
        date: `${t.year}.${t.month}`,
        price: parseInt(t.amount.replace(/,/g, "")) || 0,
        area: parseFloat(t.area),
        floor: `${t.floor}층`,
      }));
      const avgPrice = Math.round(trades.reduce((s, t) => s + t.price, 0) / trades.length);
      const diff = avgPrice - current;
      const pct = Math.round((diff / avgPrice) * 100);
      return NextResponse.json({
        trades, avgPrice, currentPrice: current, diff, pct, isRent: false,
        analysis: pct > 0
          ? `동일 단지 동일 면적 최근 실거래 평균 ${avgPrice.toLocaleString()}만원 대비 현 매물 ${Math.abs(pct)}% 저렴`
          : pct < 0
          ? `동일 단지 동일 면적 최근 실거래 평균 ${avgPrice.toLocaleString()}만원 대비 현 매물 ${Math.abs(pct)}% 높은 가격`
          : `동일 단지 동일 면적 최근 실거래 평균과 동일한 시세`,
      });
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "시세 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
