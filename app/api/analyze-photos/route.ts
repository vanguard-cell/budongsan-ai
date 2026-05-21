import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const DEMO_MODE =
  !process.env.ANTHROPIC_API_KEY ||
  process.env.ANTHROPIC_API_KEY === "여기에_API_키_입력";

const client = DEMO_MODE ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PhotoInput {
  data: string;        // base64
  mediaType: string;   // "image/jpeg" | "image/png" | ...
}

export async function POST(req: NextRequest) {
  const { photos } = await req.json() as { photos: PhotoInput[] };

  if (!photos || photos.length === 0) {
    return NextResponse.json({ error: "사진을 1장 이상 업로드해주세요." }, { status: 400 });
  }
  if (photos.length > 8) {
    return NextResponse.json({ error: "사진은 최대 8장까지 분석 가능합니다." }, { status: 400 });
  }

  if (DEMO_MODE) {
    await new Promise(r => setTimeout(r, 1500));
    return NextResponse.json({
      highlights: "채광 우수, 깔끔한 인테리어, 넓은 거실, 신축급 상태, 모던한 주방",
      details: [
        "✅ 거실: 남향 채광, 통창으로 개방감 우수",
        "✅ 주방: ㄷ자형 구조, 충분한 수납 공간",
        "✅ 침실: 깔끔한 상태, 붙박이장 구비",
        "✅ 전반적으로 신축급 컨디션",
      ],
    });
  }

  try {
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: `당신은 부동산 매물 사진 분석 전문가입니다. 첨부된 매물 사진들을 보고 매물의 장점을 추출해주세요.

분석 지침:
- 채광, 인테리어 상태, 공간감, 구조적 특징 위주
- 사진에 보이지 않는 정보(층수, 가격, 위치 등)는 추측 금지
- 명확하게 보이는 시각적 특징만 언급

아래 형식으로 정확히 출력하세요:

===핵심키워드===
짧은 키워드 5~7개를 쉼표로 구분. 매물장점 입력란에 그대로 들어갈 형식.
예: 채광우수, 신축급, 넓은거실, ㄷ자주방, 통창

===상세분석===
✅로 시작하는 항목별 분석. 각 항목 한 줄. 부위별로 (거실/주방/침실/욕실/베란다 등).
예:
✅ 거실: 남향 채광, 통창으로 개방감
✅ 주방: ㄷ자형, 수납공간 충분`,
      },
      ...photos.map(p => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: p.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: p.data,
        },
      })),
    ];

    const message = await client!.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const parse = (tag: string) => {
      const regex = new RegExp(`===${tag}===\\n([\\s\\S]*?)(?====|$)`);
      const match = text.match(regex);
      return match ? match[1].trim() : "";
    };

    const highlights = parse("핵심키워드");
    const detailsText = parse("상세분석");
    const details = detailsText.split("\n").map(s => s.trim()).filter(Boolean);

    return NextResponse.json({ highlights, details });
  } catch (err) {
    console.error("photo analysis error:", err);
    return NextResponse.json({ error: "사진 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
