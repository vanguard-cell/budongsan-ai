/**
 * 실시간 구독 공유 — 같은 데이터(사무소+컬렉션)는 앱 전체에서 리스너 하나만 유지
 *
 * 화면마다 subscribeContracts·subscribeProperties … 를 따로 열면, 화면을 옮길 때마다
 * 리스너가 닫혔다 다시 열려 수백 건을 다시 읽음(Firebase 무료 한도 초과 원인).
 * 여기서 리스너를 공유하고, 마지막 화면이 닫힌 뒤에도 KEEP_MS 동안 유지해서
 * 다른 화면으로 옮겨도 다시 읽지 않게 함. (바뀐 문서만 받음)
 */
import type { Unsubscribe } from "firebase/firestore";

const KEEP_MS = 20 * 60 * 1000;

interface Entry {
  unsub: Unsubscribe | null;
  listeners: Set<(v: unknown) => void>;
  last?: unknown;
  timer?: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, Entry>();

/** 배열은 받는 화면마다 복사본 — 한 화면이 정렬(in-place)해도 다른 화면에 영향 없게 */
const copy = <T,>(v: T): T => (Array.isArray(v) ? (v.slice() as T) : v);

export function sharedSubscribe<T>(
  key: string,
  start: (emit: (v: T) => void, failed: () => void) => Unsubscribe,
  onChange: (v: T) => void,
): Unsubscribe {
  let e = entries.get(key);
  if (!e) {
    e = { unsub: null, listeners: new Set() };
    entries.set(key, e);
  }
  const entry = e;
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }

  const listener = onChange as (v: unknown) => void;
  entry.listeners.add(listener);

  if (entry.last !== undefined) {
    // 이미 받은 데이터가 있으면 바로 전달 (구독 함수가 동기로 콜백하지 않던 기존 동작과 맞춰 비동기로)
    const last = entry.last;
    queueMicrotask(() => { if (entry.listeners.has(listener)) listener(copy(last)); });
  }
  if (!entry.unsub) {
    entry.unsub = start(
      v => {
        entry.last = v;
        entry.listeners.forEach(l => l(copy(v)));
      },
      // 구독 실패(권한·한도 초과 등) — 끊긴 리스너는 버리고, 다음에 여는 화면이 새로 연결하게
      () => {
        entry.unsub = null;
        entry.last = undefined;
        if (entries.get(key) === entry) entries.delete(key);
      },
    );
  }

  let done = false;
  return () => {
    if (done) return;
    done = true;
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0 && !entry.timer) {
      entry.timer = setTimeout(() => {
        entry.timer = undefined;
        if (entry.listeners.size > 0) return;
        entry.unsub?.();
        entries.delete(key);
      }, KEEP_MS);
    }
  };
}
