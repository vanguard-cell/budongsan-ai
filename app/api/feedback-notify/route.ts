import { NextRequest, NextResponse } from "next/server";

/**
 * 건의함 새 글/새 답글 알림 → Claude 루틴(건의함 자동 처리) 실행
 *
 * - 로그인한 사용자의 Firebase ID 토큰을 확인한 요청만 받음 (외부에서 아무나 실행 못 하게)
 * - 루틴 주소·토큰은 서버 환경 변수에만 둠 (FEEDBACK_ROUTINE_URL / FEEDBACK_ROUTINE_TOKEN)
 * - 환경 변수가 없으면 아무것도 안 함 (건의 등록 자체에는 영향 없음)
 */

const ROUTINE_URL = process.env.FEEDBACK_ROUTINE_URL;
const ROUTINE_TOKEN = process.env.FEEDBACK_ROUTINE_TOKEN;
const ROUTINE_BETA = process.env.FEEDBACK_ROUTINE_BETA || "experimental-cc-routine-2026-04-01";

// 같은 사용자가 연달아 보내면 짧은 간격 안에서는 한 번만 실행 (인스턴스 단위, 최선 노력)
const COOLDOWN_MS = 60_000;
const lastFired = new Map<string, number>();

/** Firebase ID 토큰 확인 — Auth REST(accounts:lookup)로 조회해 유효하면 uid 반환 */
async function verifyUser(idToken: string): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.users?.[0]?.localId || null;
}

export async function POST(req: NextRequest) {
  if (!ROUTINE_URL || !ROUTINE_TOKEN) {
    return NextResponse.json({ ok: false, reason: "not-configured" });
  }

  const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!idToken) return NextResponse.json({ ok: false }, { status: 401 });

  const uid = await verifyUser(idToken).catch(() => null);
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });

  const now = Date.now();
  if (now - (lastFired.get(uid) || 0) < COOLDOWN_MS) {
    return NextResponse.json({ ok: true, skipped: "cooldown" });
  }
  lastFired.set(uid, now);

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind === "reply" ? "새 답글" : "새 건의";

  try {
    const res = await fetch(ROUTINE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ROUTINE_TOKEN}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": ROUTINE_BETA,
      },
      body: JSON.stringify({ text: `건의함에 ${kind}이 올라왔습니다. 지침대로 처리해주세요.` }),
    });
    if (!res.ok) {
      console.error("[feedback-notify] 루틴 실행 실패:", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ ok: false }, { status: 502 });
    }
  } catch (e) {
    console.error("[feedback-notify] 루틴 호출 오류:", e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
