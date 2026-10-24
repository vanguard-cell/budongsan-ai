/** 검색어를 띄어쓰기로 나눠, 모든 단어가 (동·호·주소·이름·전화번호 중) 어딘가에 들어 있으면 찾아짐.
 *  "101동 1902호" → "101", "1902" 로 바꿔서 동/호 칸에서 각각 찾음. */
export function termTokens(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map(t => t.replace(/^(\d[\d-]*)(동|호|호수)$/, "$1"))
    .filter(Boolean);
}

/** 띄어쓰기·괄호 차이, "블록"/"블럭" 표기 차이를 무시하고 비교하기 위한 정리 */
function squash(s: string): string {
  return s.toLowerCase().replace(/블록/g, "블럭").replace(/[\s()]/g, "");
}

/** 숫자만(전화번호처럼) 입력한 검색어인지 — 이때만 하이픈·공백 무시하고 숫자끼리 비교 */
export function isDigitQuery(q: string): boolean {
  return /^[\d\s-]+$/.test(q.trim());
}

export function matchAllTokens(q: string, vals: (string | undefined)[]): boolean {
  const tokens = termTokens(q);
  if (!tokens.length) return false;
  const lows = vals.filter(Boolean).map(v => (v as string).toLowerCase());
  const squashed = lows.map(squash);
  return tokens.every(t => {
    const d = t.replace(/\D/g, "");
    const st = squash(t);
    return lows.some(v => v.includes(t))
      || squashed.some(v => v.includes(st))
      || (/^[\d-]+$/.test(t) && d.length >= 3 && lows.some(v => v.replace(/\D/g, "").includes(d)));
  });
}
