import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const DEMO_MODE =
  !process.env.ANTHROPIC_API_KEY ||
  process.env.ANTHROPIC_API_KEY === "여기에_API_키_입력";

const client = DEMO_MODE ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PhotoInput { data: string; mediaType: string; }

const EXTRACTION_PROMPT = `당신은 부동산 매물 정보 파싱 전문가입니다.
첨부된 이미지(스크린샷·매물장 사진·광고 이미지)와 텍스트에서 매물 정보를 추출하여 JSON으로 반환하세요.

[추출 규칙]
- 매물분류: "아파트" | "오피스텔" | "빌라/다세대" | "원룸/투룸" | "상가" | "사무실" | "토지" 중 1개
- 거래종류: "매매" | "전세" | "월세" | "단기임대" 중 1개
- 가격(price/deposit/monthly): 만원 단위 숫자만 (예: "5억" → 50000, "29,600만원" → 29600, "3억5천" → 35000)
- 면적(contractArea/exclusiveArea): ㎡ 단위 숫자 (소수점 둘째까지). "25평" → 82.64 변환
- 방향: "남향" | "동향" | "서향" | "북향" | "남동향" | "남서향" | "북동향" | "북서향" 중 1개
- 난방: "지역난방/열병합" | "개별난방/도시가스" | "중앙난방" | "개별난방/기름" | "전기난방" 중 가장 가까운 것
- isDuplex: 복층 언급 있으면 true
- 정보 없거나 불확실하면 반드시 null로

[출력 — JSON 한 객체만, 다른 설명 없이 출력]
{
  "propertyType": null,
  "dealType": null,
  "location": null,
  "complexName": null,
  "price": null,
  "deposit": null,
  "monthly": null,
  "contractArea": null,
  "exclusiveArea": null,
  "floor": null,
  "totalFloor": null,
  "rooms": null,
  "bathrooms": null,
  "direction": null,
  "isDuplex": null,
  "maintenanceFee": null,
  "heating": null,
  "options": null,
  "highlights": null,
  "notes": null,
  "complexUnits": null
}`;

export async function POST(req: NextRequest) {
  const { images, text, url } = await req.json() as {
    images?: PhotoInput[];
    text?: string;
    url?: string;
  };

  const hasImages = images && images.length > 0;
  const hasText = !!text?.trim();
  const hasUrl = !!url?.trim();

  if (!hasImages && !hasText && !hasUrl) {
    return NextResponse.json({ error: "이미지·텍스트·URL 중 하나는 제공해야 합니다." }, { status: 400 });
  }

  // ── URL 모드: 서버에서 가져와 HTML→텍스트 변환 ──
  let urlText = "";
  let urlSource = "";
  if (hasUrl) {
    try {
      const res = await fetch(url!, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return NextResponse.json({
          error: `URL 가져오기 실패 (HTTP ${res.status}). 네이버 부동산은 자동 수집을 막을 수 있으니 스크린샷을 사용해주세요.`,
        }, { status: 400 });
      }
      const html = await res.text();
      urlSource = url!;
      // 간단한 HTML → 텍스트 (script/style/주석 제거)
      urlText = html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 25000);
    } catch (e) {
      return NextResponse.json({
        error: "URL 가져오기 오류: " + (e instanceof Error ? e.message : "알 수 없는 오류"),
      }, { status: 400 });
    }
  }

  if (DEMO_MODE) {
    await new Promise(r => setTimeout(r, 1500));
    return NextResponse.json({
      data: {
        propertyType: "아파트",
        dealType: "매매",
        location: "경기 하남시 미사강변동",
        complexName: "힐스테이트 에코미사",
        price: 50000,
        deposit: null,
        monthly: null,
        contractArea: 102.2,
        exclusiveArea: 39.71,
        floor: 13,
        totalFloor: 20,
        rooms: 1,
        bathrooms: 1,
        direction: "서향",
        isDuplex: true,
        maintenanceFee: 15,
        heating: "지역난방/열병합",
        options: "에어컨, 냉장고, 세탁기, 주차 1대",
        highlights: "미사역 초역세권, 복층 구조, 채광 우수",
        notes: "현 임차인 있음 (26년 12월 만기)",
        complexUnits: 463,
      },
      sources: { images: !!hasImages, text: !!hasText, url: urlSource || null },
    });
  }

  try {
    const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: EXTRACTION_PROMPT }];

    if (hasText) {
      content.push({ type: "text", text: `\n\n[붙여넣은 텍스트]\n${text!.slice(0, 10000)}` });
    }
    if (urlText) {
      content.push({ type: "text", text: `\n\n[URL 내용 - ${urlSource}]\n${urlText}` });
    }
    if (hasImages) {
      content.push({ type: "text", text: "\n\n[첨부 이미지에서도 정보 추출:]" });
      images!.forEach(img => {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: img.data,
          },
        });
      });
    }

    const message = await client!.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    // JSON 추출 (```json``` 또는 raw JSON)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        error: "정보 추출 실패: 매물 정보를 인식할 수 없습니다. 다른 자료로 시도해주세요.",
      }, { status: 500 });
    }
    const data = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      data,
      sources: { images: !!hasImages, text: !!hasText, url: urlSource || null },
    });
  } catch (err) {
    console.error("import error:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "파싱 중 오류가 발생했습니다.",
    }, { status: 500 });
  }
}
