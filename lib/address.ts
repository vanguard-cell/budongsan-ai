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
    .replace(/\s*\d+(?:-\d+)?동.*$/, "")
    .replace(/\s*제?\d+(?:-\d+)?호.*$/, "")
    .replace(/\s*제?\d+층.*$/, "")
    .trim();
}
