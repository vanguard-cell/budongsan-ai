/**
 * 건의함 자동 처리(Claude 루틴) 허용 사용자
 *
 * 여기 있는 uid 가 올린 건의·답글만 루틴을 깨운다. (그 외 사용자 글은 건의함에 쌓이기만 함)
 * scripts/read-feedback.js 도 같은 목록으로 '자동처리 제외' 표시를 붙인다 — 바꿀 때 같이 바꿀 것.
 */
export const AUTO_FIX_UIDS: readonly string[] = [
  "ZP0FIxYM5Lh8tvobeldoNfdgozX2", // 미사금빛TV (어머니)
];
