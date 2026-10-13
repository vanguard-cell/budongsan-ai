/** 검색어를 띄어쓰기로 나눠, 모든 단어가 (동·호·주소·이름·전화번호 중) 어딘가에 들어 있으면 찾아짐.
 *  "101동 1902호" → "101", "1902" 로 바꿔서 동/호 칸에서 각각 찾음. */
export function termTokens(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map(t => t.replace(/^(\d[\d-]*)(동|호|호수)$/, "$1"))
    .filter(Boolean);
}

export function matchAllTokens(q: string, vals: (string | undefined)[]): boolean {
  const tokens = termTokens(q);
  if (!tokens.length) return false;
  const lows = vals.filter(Boolean).map(v => (v as string).toLowerCase());
  return tokens.every(t => {
    const d = t.replace(/\D/g, "");
    return lows.some(v => v.includes(t) || (d.length >= 3 && v.replace(/\D/g, "").includes(d)));
  });
}
