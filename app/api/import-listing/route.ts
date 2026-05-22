import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const DEMO_MODE =
  !process.env.ANTHROPIC_API_KEY ||
  process.env.ANTHROPIC_API_KEY === "여기에_API_키_입력";

const client = DEMO_MODE ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PhotoInput { data: string; mediaType: string; }

const EXTRACTION_PROMPT = `당신은 부동산 매물 정보 파싱 전문가입니다.
첨부된 이미지(스크린샷·매물장·광고)와 텍스트에서 매물 정보를 추출하여 **JSON만** 반환하세요.

⚠️ 중요: 응답은 반드시 { 로 시작해서 } 로 끝나는 JSON 한 객체만. 인사·설명·코드블록·마크다운 절대 금지.

[추출 규칙]
- propertyType: "아파트" | "오피스텔" | "빌라/다세대" | "원룸/투룸" | "상가" | "사무실" | "토지"
- dealType: "매매" | "전세" | "월세" | "단기임대"
- 가격(price/deposit/monthly): 만원 단위 정수. "5억"→50000, "29,600만원"→29600, "3억5천"→35000, "보증금 1000 월 50"→deposit:1000, monthly:50
- 면적: ㎡ 단위 숫자. "25평"→82.64, "전용 39.71㎡"→39.71
- direction: "남향" | "동향" | "서향" | "북향" | "남동향" | "남서향" | "북동향" | "북서향"
- heating: "지역난방/열병합" | "개별난방/도시가스" | "중앙난방" | "개별난방/기름" | "전기난방" 중 가장 가까운 것
- isDuplex: 복층/메조넷 언급 있으면 true, 없으면 null
- floor/totalFloor/rooms/bathrooms/maintenanceFee/complexUnits: 정수
- location: 시도+시군구+동까지 (예: "경기 하남시 미사강변동")
- complexName: 단지·건물 이름만 (호수·층수 제외)
- options: 옵션들을 쉼표로 (예: "에어컨, 냉장고, 세탁기")
- highlights: 매물 장점 키워드 (쉼표 구분)
- notes: 특이사항 (임차인·계약만기·하자 등)
- 어떤 필드든 정보 없거나 불확실하면 반드시 null (추측 금지)

[출력 형식 — 이 구조 그대로, 다른 텍스트 없이]
{"propertyType":null,"dealType":null,"location":null,"complexName":null,"price":null,"deposit":null,"monthly":null,"contractArea":null,"exclusiveArea":null,"floor":null,"totalFloor":null,"rooms":null,"bathrooms":null,"direction":null,"isDuplex":null,"maintenanceFee":null,"heating":null,"options":null,"highlights":null,"notes":null,"complexUnits":null}`;

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
    console.log("[import-listing] Claude 응답 길이:", responseText.length);
    console.log("[import-listing] Claude 응답 미리보기:", responseText.slice(0, 300));

    // 다단계 JSON 추출
    let data: Record<string, unknown> | null = null;
    let parseError = "";

    // 1단계: 마크다운 코드블록 안의 JSON
    const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      try { data = JSON.parse(codeBlockMatch[1]); } catch (e) { parseError = "코드블록 JSON 파싱 실패: " + (e as Error).message; }
    }

    // 2단계: 원본 텍스트 전체 trim 후 JSON.parse 시도
    if (!data) {
      try { data = JSON.parse(responseText.trim()); } catch {}
    }

    // 3단계: 첫 { 부터 짝맞는 } 까지 균형있게 추출
    if (!data) {
      const startIdx = responseText.indexOf("{");
      if (startIdx >= 0) {
        let depth = 0, endIdx = -1;
        let inString = false, escape = false;
        for (let i = startIdx; i < responseText.length; i++) {
          const c = responseText[i];
          if (escape) { escape = false; continue; }
          if (c === "\\") { escape = true; continue; }
          if (c === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) { endIdx = i; break; }
          }
        }
        if (endIdx > startIdx) {
          try { data = JSON.parse(responseText.slice(startIdx, endIdx + 1)); }
          catch (e) { parseError = "균형 JSON 파싱 실패: " + (e as Error).message; }
        }
      }
    }

    if (!data) {
      console.error("[import-listing] JSON 추출 실패. 원본:", responseText);
      return NextResponse.json({
        error: `정보 추출 실패. ${parseError || "Claude가 JSON 형식으로 답하지 않음"}. 원본 응답: ${responseText.slice(0, 200)}...`,
      }, { status: 500 });
    }

    // 모든 필드가 null이면 알림
    const filledCount = Object.values(data).filter(v => v !== null && v !== undefined && v !== "").length;
    if (filledCount === 0) {
      return NextResponse.json({
        error: "매물 정보를 인식하지 못했습니다. 이미지가 흐리거나, 텍스트에 매물 정보가 부족할 수 있습니다.",
      }, { status: 422 });
    }

    return NextResponse.json({
      data,
      filledCount,
      sources: { images: !!hasImages, text: !!hasText, url: urlSource || null },
    });
  } catch (err) {
    console.error("[import-listing] error:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "파싱 중 오류가 발생했습니다.",
    }, { status: 500 });
  }
}
