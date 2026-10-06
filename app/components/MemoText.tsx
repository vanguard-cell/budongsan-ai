/**
 * 메모 보기 (건의 #76)
 *
 * 날짜("26.10.02 ")로 시작하는 줄마다 새 칸으로 나누고, 칸 사이에 가는 실선을 그어 보여줌.
 * 날짜가 없는 옛 메모는 선 없이 그대로 보임.
 */
const DATE_LINE = /^\d{2}\.\d{2}\.\d{2}(\s|$)/;

export function splitMemo(memo: string): string[] {
  const entries: string[] = [];
  for (const line of memo.split("\n")) {
    if (entries.length === 0 || DATE_LINE.test(line)) entries.push(line);
    else entries[entries.length - 1] += "\n" + line;
  }
  return entries;
}

export default function MemoText({ memo }: { memo: string }) {
  const entries = splitMemo(memo);
  return (
    <>
      {entries.map((e, i) => (
        <div
          key={i}
          className={`whitespace-pre-wrap ${i > 0 ? "border-t border-gray-300 dark:border-slate-600 mt-1 pt-1" : ""}`}
        >
          {e}
        </div>
      ))}
    </>
  );
}
