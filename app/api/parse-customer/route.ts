import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const DEMO_MODE =
  !process.env.ANTHROPIC_API_KEY ||
  process.env.ANTHROPIC_API_KEY === "여기에_API_키_입력";

const client = DEMO_MODE ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * 카톡 대화/문자 내용 → 손님 정보 자동 추출
 *
 * 입력: text (카톡/문자 원문)
 * 출력: 손님 정보 JSON (name, phone, side, dealKind, budget, preferredArea, moveInDate, memo)
 */
export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text || typeof text !== "string" || text.trim().length < 5) {
    return NextResponse.json({ error: "텍스트가 너무 짧습니다" }, { status: 400 });
  }

  // DEMO 모드 — 데모용 가짜 데이터
  if (DEMO_MODE || !client) {
    return NextResponse.json({
      name: "(데모) 김지영",
      phone: "010-1234-5678",
      side: "tenant",
      dealKind: "live",
      budget: "보증금 1억 / 월세 80만원 이하",
      preferredArea: "미사강변동, 3룸 이상",
      moveInDate: "",
      memo: "[데모 모드] Anthropic API 키 미설정",
    });
  }

  try {
    const systemPrompt = `당신은 한국 부동산 중개사무소의 손님 관리 어시스턴트입니다. 카카오톡 대화나 문자 내용에서 손님 정보를 추출해 JSON으로 정리하세요.

다음 필드만 JSON으로 반환:
- name: 손님 이름 (모르면 "")
- phone: 연락처 (010-XXXX-XXXX 형식, 모르면 "")
- side: "buyer"(매수) | "seller"(매도) | "tenant"(임차) | "landlord"(임대인) | "etc" 중 하나
- dealKind: "live"(실거주) | "invest"(투자) | "etc" 중 하나
- budget: 예산 자유 텍스트 (예: "5억 이하", "보증금 1억 / 월세 100 이하")
- preferredArea: 희망 단지·지역 (예: "미사강변동, 미사역 인근")
- moveInDate: 입주 가능일 (YYYY-MM-DD, 모르면 "")
- memo: 기타 특이사항 한국어로 정리 (예: "남편과 같이 의사결정, 주말 임장 선호")

규칙:
- 추측하지 말 것. 명시적으로 언급된 정보만 추출
- 전화번호는 숫자만 추출 후 010-XXXX-XXXX 형식
- 날짜는 "7월 15일" → "2026-07-15" (현재 연도 2026 기준)
- 텍스트만 반환 — 마크다운/설명 금지, 순수 JSON만`;

    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "응답 형식 오류" }, { status: 500 });
    }

    // JSON 추출 (마크다운 코드블록 제거 안전장치)
    let raw = content.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(raw);

    // 기본값 보장
    return NextResponse.json({
      name:          parsed.name          || "",
      phone:         parsed.phone         || "",
      side:          parsed.side          || "buyer",
      dealKind:      parsed.dealKind      || "live",
      budget:        parsed.budget        || "",
      preferredArea: parsed.preferredArea || "",
      moveInDate:    parsed.moveInDate    || "",
      memo:          parsed.memo          || "",
    });
  } catch (e) {
    console.error("[parse-customer] 실패:", e);
    return NextResponse.json({
      error: e instanceof Error ? e.message : "파싱 실패",
    }, { status: 500 });
  }
}
