/**
 * 주소에서 동·호(층) 부분을 떼어낸 단지 이름.
 * 저장된 동/호 값이 있으면 그 글자 그대로 먼저 제거해서
 * "지하1호", "B1호", "302-2호" 처럼 숫자가 아닌 호수도 단지 이름이 잘리지 않게 한다.
 */
export function stripUnit(address: string, dong?: string, ho?: string): string {
  let s = address || "";
  const d = (dong || "").trim();
  const h = (ho || "").trim();
  if (d) s = s.replace(` ${d}동`, "").replace(`${d}동`, "");
  if (h) s = s.replace(` ${h}호`, "").replace(`${h}호`, "");
  return s
    .replace(/\s*\d+(?:[-.,·~]\d+)*동.*$/, "")
    .replace(/\s*제?\d+(?:[-.,·~]\d+)*호.*$/, "")
    .replace(/\s*제?\d+층.*$/, "")
    .trim();
}

/** 단지명 (주소에서 시·구·도로명과 동/호 부분을 걷어낸 이름) — 단지별 묶기·정렬용 */
export const complexShortName = (c: string): string => {
  const t = c.split(/\s+/);
  const isRegion = (w: string) =>
    /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)$/.test(w) ||
    /^[가-힣]+(특별시|광역시|특별자치시|특별자치도|도|시|군|구|읍|면|동|리|로|길|대로)$/.test(w) ||
    /^[가-힣]+\d+번?길$/.test(w) ||
    /^(산)?\d+(-\d+)?(번지|번길)?$/.test(w);
  while (t.length > 1 && isRegion(t[0])) t.shift();
  return t.join(" ").replace(/\s*제?\d+층.*$/, "") || c;
};
