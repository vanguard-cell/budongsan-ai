import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const DEMO_MODE =
  !process.env.ANTHROPIC_API_KEY ||
  process.env.ANTHROPIC_API_KEY === "여기에_API_키_입력";

const client = DEMO_MODE ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { form, agency, locationInfo } = await req.json();

  const dealInfo =
    form.dealType === "월세" || form.dealType === "단기임대"
      ? `보증금 ${form.deposit || "협의"}만원 / 월세 ${form.monthly || "협의"}만원`
      : form.dealType === "전세"
      ? `전세 ${form.deposit || "협의"}만원`
      : form.price
      ? `매매가 ${form.price}만원`
      : form.deposit
      ? `매매가 ${form.deposit}만원`
      : "가격 협의";

  const agencyBlock = agency?.name
    ? `\n[중개사무소] ${agency.name} | 대표 ${agency.rep} | ${agency.phone} | ${agency.directions}\n소개: ${agency.intro}`
    : "";

  // 인프라 데이터 구조화 (locationInfo가 있으면 구조화, 없으면 form.transport 사용)
  const infraBlock = locationInfo ? [
    locationInfo.subway?.[0]    ? `  교통(지하철): ${locationInfo.subway.slice(0,2).join(" / ")}` : null,
    locationInfo.mart?.[0]      ? `  쇼핑(마트/아울렛): ${locationInfo.mart[0]}` : null,
    locationInfo.school?.[0]    ? `  학교: ${locationInfo.school.slice(0,3).join(", ")}` : null,
    locationInfo.hospital?.[0]  ? `  병원: ${locationInfo.hospital[0]}` : null,
    locationInfo.kids?.[0]      ? `  어린이집/유치원: ${locationInfo.kids.slice(0,2).join(", ")}` : null,
    locationInfo.academy?.[0]   ? `  학원: ${locationInfo.academy[0]}` : null,
    locationInfo.publicOrg?.[0] ? `  공공기관: ${locationInfo.publicOrg[0]}` : null,
  ].filter(Boolean).join("\n") : (form.transport ? `  ${form.transport}` : null);

  // 값이 있는 필드만 포함
  const fields = [
    `- 매물분류: ${form.propertyType}`,
    `- 거래종류: ${form.dealType} / ${dealInfo}`,
    `- 소재지: ${form.location}${form.complexName ? ` (${form.complexName})` : ""}`,
    form.exclusiveArea ? `- 전용면적: ${form.exclusiveArea}㎡${form.contractArea ? ` / 계약 ${form.contractArea}㎡` : ""}` : null,
    (form.floor || form.totalFloor) ? `- 층수: ${form.floor || "?"}층 / 전체 ${form.totalFloor || "?"}층${form.isDuplex ? " (복층)" : ""}` : null,
    (form.rooms || form.bathrooms) ? `- 방/욕실: ${form.rooms || "?"}개 / ${form.bathrooms || "?"}개` : null,
    form.direction ? `- 방향: ${form.direction}` : null,
    form.maintenanceFee ? `- 관리비: ${form.maintenanceFee}만원` : null,
    form.heating ? `- 난방: ${form.heating}` : null,
    infraBlock ? `- 주변 인프라:\n${infraBlock}` : (form.transport ? `- 교통/역세권: ${form.transport}` : null),
    form.investPoint ? `- 투자 포인트: ${form.investPoint}` : null,
    form.options ? `- 옵션: ${form.options}` : null,
    form.highlights ? `- 매물 장점: ${form.highlights}` : null,
    form.notes ? `- 특이사항: ${form.notes}` : null,
    form.complexUnits ? `- 단지 세대수: ${form.complexUnits}세대` : null,
  ].filter(Boolean).join("\n");

  const prompt = `당신은 대한민국 부동산 중개사무소 전문 마케팅 작가입니다.
아래 매물 정보 하나로 7가지 콘텐츠를 생성해주세요. 단순 정보 나열이 아닌, 각 독자에게 설득력 있는 언어로 써주세요.
⚠️ 중요: 제공된 정보에 없는 내용은 추측하거나 작성하지 마세요. 값이 없는 항목은 완전히 생략하세요.${agencyBlock}

[매물 정보]
${fields}

아래 형식으로 정확히 출력하세요:

===매물특징===
네이버 매물특징 입력란용. 짧은 키워드 5~7개, 쉼표 구분, 반드시 한 줄.
- 지하철: "OO역세권" 또는 "OO역도보N분" 형태로 압축
- 쇼핑/학교/병원: "현대아울렛인근", "초등학교도보5분" 형태로 압축
- 거리(m), 괄호, 긴 주소 절대 금지
✅ 좋은 예: 8호선다산역세권, 현대아울렛인근, 초중학교도보, 지역난방, 대단지500세대

===매물설명===
네이버 매물설명 입력란용. ✅섹션 + *- 불릿. 깔끔하고 읽기 쉽게.
- 주변 인프라는 항목별로 각각 *- 한 줄씩 (예: *- 🚇 다산역(8호선) 도보 16분)
- 괄호 안 미터 수치는 생략해도 됨
- 입력된 정보만 사용 / 값 없는 항목 생략 / 400자 내외

===블로그===
네이버/티스토리 블로그 포스팅. 제목 포함. ## 소제목과 이모지 활용. SEO 키워드 자연스럽게 포함. 800자 이상.

===인스타===
인스타그램 캡션. 핵심을 임팩트 있게. 이모지 활용. 해시태그 10개 이상.

===실거주===
실거주 목적 고객에게 보내는 카카오톡. 생활 편의·공간감 중심. 친근한 말투. 300자 내외.

===투자===
투자 목적 고객에게 보내는 메시지. 수익률·입지·갭 포인트 중심. 숫자와 근거 위주. 300자 내외.

===문의답변===
이 매물에 자주 올 법한 고객 문의 5가지와 모범 답변. "Q: / A:" 형식.`;

  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 1800));
    const af = agency?.name ? `\n\n📍 ${agency.name} | 대표 ${agency.rep} | ${agency.phone}\n${agency.directions}` : "";
    return NextResponse.json({
      feature: `${form.dealType}, ${form.transport || "역세권"}, ${form.isDuplex ? "복층" : form.propertyType}, ${form.investPoint ? "수익형" : "실거주"}, 즉시상담`,
      description: `✅ 현 매물 특징\n*- ${dealInfo}\n*- ${form.transport || "교통 편리"}\n*- ${form.isDuplex ? "복층 구조" : form.propertyType} ${form.floor || ""}층\n${form.investPoint ? `*- ${form.investPoint}\n` : ""}\n✅ ${form.complexName || "단지"} 정보\n*- 총 ${form.totalFloor || ""}층 ${form.complexUnits ? form.complexUnits + "세대" : ""}\n*- 관리비 ${form.maintenanceFee || "별도"}만원 / 난방 ${form.heating || "개별"}\n*- 주차 1대 무료${af}`,
      blog: `# 🏠 ${form.complexName || form.location} ${form.propertyType} — ${form.investPoint ? "수익형 투자 매물 분석" : "실거주 추천 매물"}\n\n안녕하세요, ${agency?.name || "부동산 전문 중개사"}입니다.\n\n오늘은 **${form.location}**에 위치한 ${form.propertyType} 매물을 소개해드립니다.\n\n## 📊 기본 정보\n- 거래: ${dealInfo}\n- 면적: 계약 ${form.contractArea || "-"}㎡ / 전용 ${form.exclusiveArea || "-"}㎡\n- 층수: ${form.floor || "-"}층 / 전체 ${form.totalFloor || "-"}층 ${form.isDuplex ? "(복층)" : ""}\n- 관리비: ${form.maintenanceFee || "별도"}만원 / ${form.heating || "개별"} 난방\n\n## 🚇 입지\n${form.transport || "대중교통 편리한 위치"}\n\n## ✨ 이 매물을 추천하는 이유\n${form.highlights || "채광 우수, 관리 상태 양호"}\n\n${form.investPoint ? `## 💡 투자 포인트\n${form.investPoint}\n\n` : ""}${af ? af + "\n" : ""}#${(form.location || "").replace(/\s/g, "")} #${form.propertyType} #부동산`,
      insta: `📍 ${form.complexName || form.location} ${form.propertyType}\n\n💰 ${dealInfo}\n🏢 ${form.floor || ""}층 ${form.isDuplex ? "(복층) " : ""}/ 전용 ${form.exclusiveArea || ""}㎡\n${form.transport ? `🚇 ${form.transport}\n` : ""}${form.investPoint ? `💡 ${form.investPoint}\n` : ""}✅ 문의 환영합니다!\n\n#${(form.location || "").replace(/\s/g, "")}부동산 #${form.propertyType}매매 #${form.dealType}`,
      resident: `안녕하세요! ${form.complexName || form.location} ${form.propertyType} 안내드립니다 🏠\n\n${form.transport || "교통이 편리한 위치"} 좋고요, ${form.isDuplex ? "복층 구조라 공간 분리가 잘 돼있어서 실거주하기 정말 좋아요." : "깔끔하고 관리 잘 된 물건이에요."}\n\n${form.highlights || "채광도 좋고 조용한 환경이에요."}\n\n한번 보러 오실래요? 편한 시간에 맞춰드릴게요 😊`,
      investor: `[투자 매물 안내]\n\n📌 핵심 요약\n- ${dealInfo}\n- ${form.transport || "역세권 위치"} → 공실 리스크 낮음\n${form.investPoint ? `- ${form.investPoint}\n` : ""}\n📊 투자 포인트\n${form.investPoint || "입지 우수, 안정적 임차 수요"}\n\n📋 상세\n- ${form.complexUnits ? form.complexUnits + "세대 대단지" : "단지 정보 문의"}\n- 관리비 ${form.maintenanceFee || "별도"}만원 / ${form.heating || "개별"} 난방\n\n상세 수익률 계산 → 연락 주세요`,
      qna: `Q: "이 매물 아직 있나요?"\nA: "네, 현재 나와 있습니다! 언제 방문 가능하실까요? 미리 예약해드릴게요 😊"\n\nQ: "가격 조정 되나요?"\nA: "시세 대비 합리적으로 나온 물건이라 조정이 쉽지 않지만, 직접 보시고 말씀해주시면 최대한 협의해볼게요!"\n\nQ: "대출은 얼마나 나오나요?"\nA: "개인 조건에 따라 달라서 연계 전문가 연결해드릴 수 있어요. 연락처 남겨주시면 안내해드릴게요!"\n\nQ: "언제 입주 가능한가요?"\nA: "${form.notes?.includes("즉시") ? "즉시 입주 가능합니다!" : "입주 시기는 협의 가능합니다. 자세한 내용은 직접 문의 주세요."}"\n\nQ: "직접 보러 갈 수 있나요?"\nA: "물론이죠! 편하신 시간 말씀해 주시면 일정 잡아드릴게요 📅"`,
    });
  }

  try {
    const message = await client!.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const parse = (tag: string) => {
      const regex = new RegExp(`===${tag}===\\n([\\s\\S]*?)(?====|$)`);
      const match = text.match(regex);
      return match ? match[1].trim() : "";
    };

    return NextResponse.json({
      feature: parse("매물특징"),
      description: parse("매물설명"),
      blog: parse("블로그"),
      insta: parse("인스타"),
      resident: parse("실거주"),
      investor: parse("투자"),
      qna: parse("문의답변"),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
