/**
 * 건의함 조회 공용 — 읽기 횟수 절약용
 *
 * 건의 번호 = createdAt 오름차순 순위(#1이 가장 오래된 글). 전체를 읽지 않고
 *  - 번호 → 글: 전체 개수(count) 후 최신순으로 필요한 만큼만 읽고, 순위를 count 쿼리로 검증
 *  - 글 → 번호: createdAt보다 이전 글 수(count)로 계산
 * 검증이 안 맞거나 오류가 나면 기존처럼 전체를 읽는 방식으로 되돌아감.
 * (createdAt은 숫자·Timestamp 두 종류가 섞여 있어 두 쪽을 모두 센다.)
 */
const { Timestamp } = require("firebase-admin/firestore");

const toMs = v => (v && v.toMillis ? v.toMillis() : v || 0);

async function countWhere(col, ...args) {
  const q = args.length ? col.where(...args) : col;
  const s = await q.count().get();
  return s.data().count;
}

/** 글의 번호 = 이 글보다 먼저 등록된 글 수 + 1 */
async function rankOf(col, ms) {
  const [a, b] = await Promise.all([
    countWhere(col, "createdAt", "<", ms),
    countWhere(col, "createdAt", "<", Timestamp.fromMillis(ms)),
  ]);
  return a + b + 1;
}

/** 전체 읽기 (예전 방식) — 번호를 붙여 반환 */
async function loadAll(db) {
  const snap = await db.collection("feedback").get();
  const items = snap.docs.map(d => ({ doc: d, createdAt: toMs(d.data().createdAt) }));
  items.sort((x, y) => x.createdAt - y.createdAt).forEach((it, i) => (it.no = i + 1));
  return { items, total: items.length };
}

/** 번호로 글 하나 찾기 → { doc, no, total } 또는 null */
async function findByNo(db, no, { full = false } = {}) {
  if (!full) {
    try {
      const col = db.collection("feedback");
      const total = await countWhere(col);
      if (no < 1 || no > total) return null;
      const n = total - no + 1; // 최신 n개 안에 있음
      const snap = await col.orderBy("createdAt", "desc").limit(n).get();
      const doc = snap.docs[snap.docs.length - 1];
      if (doc && (await rankOf(col, toMs(doc.data().createdAt))) === no) {
        return { doc, no, total };
      }
      console.error("(순위 검증 불일치 → 전체 읽기로 전환)");
    } catch (e) {
      console.error("(빠른 조회 실패 → 전체 읽기로 전환):", e.message);
    }
  }
  const { items, total } = await loadAll(db);
  const it = items.find(x => x.no === no);
  return it ? { doc: it.doc, no, total } : null;
}

/** 처리 대상 후보(🆕 문의 + 사용자가 마지막으로 쓴 글) → [{doc, no}], total */
async function findPending(db, { full = false } = {}) {
  if (!full) {
    try {
      const col = db.collection("feedback");
      const [a, b, total] = await Promise.all([
        col.where("status", "==", "pending").get(),
        col.where("lastReplyBy", "==", "user").get(),
        countWhere(col),
      ]);
      const map = new Map();
      [...a.docs, ...b.docs].forEach(d => map.set(d.id, d));
      const items = [];
      for (const d of map.values()) {
        const ms = toMs(d.data().createdAt);
        items.push({ doc: d, createdAt: ms, no: await rankOf(col, ms) });
      }
      return { items, total };
    } catch (e) {
      console.error("(빠른 조회 실패 → 전체 읽기로 전환):", e.message);
    }
  }
  const { items, total } = await loadAll(db);
  return {
    items: items.filter(it => {
      const x = it.doc.data();
      return (x.status || "pending") === "pending" || x.lastReplyBy === "user";
    }),
    total,
  };
}

module.exports = { toMs, loadAll, findByNo, findPending };
