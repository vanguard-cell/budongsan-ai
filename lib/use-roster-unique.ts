"use client";

/** 고객명단(엑셀)에 있는 고유번호를 매물·만기 호실에서 자동으로 찾아주는 도우미 — 저장된 데이터는 바꾸지 않고 보여주기만 함 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-context";
import { subscribeRoster, unitKey, complexKey, complexOf, dongHoOf, type RosterUnit } from "./roster-db";

export function useRosterUniqueNo(): (address?: string, dong?: string, ho?: string) => string {
  const { user } = useAuth();
  const [roster, setRoster] = useState<RosterUnit[]>([]);
  useEffect(() => {
    if (!user?.agencyId) return;
    return subscribeRoster(user.agencyId, setRoster);
  }, [user?.agencyId]);
  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of roster) if (u.uniqueNo) m.set(unitKey(u.complex, u.dong, u.ho), u.uniqueNo);
    return m;
  }, [roster]);
  // 단지 이름이 조금 달라도(주소 전체 vs 짧은 이름) 동·호가 같고 후보가 하나뿐이면 찾아줌
  const byDongHo = useMemo(() => {
    const m = new Map<string, { complex: string; no: string }[]>();
    for (const u of roster) {
      if (!u.uniqueNo) continue;
      const k = `${(u.dong || "").replace(/\D/g, "")}|${(u.ho || "").trim()}`;
      m.set(k, [...(m.get(k) || []), { complex: complexKey(u.complex), no: u.uniqueNo }]);
    }
    return m;
  }, [roster]);
  return (address, dong, ho) => {
    if (!map.size) return "";
    const dh = dongHoOf(address || "", dong, ho);
    if (!dh.ho) return "";
    const complex = complexOf(address || "", dong, ho);
    const exact = map.get(unitKey(complex, dh.dong, dh.ho));
    if (exact) return exact;
    const ck = complexKey(complex);
    const near = (byDongHo.get(`${dh.dong}|${dh.ho}`) || []).filter(c => !c.complex || !ck || ck.includes(c.complex) || c.complex.includes(ck));
    return near.length === 1 ? near[0].no : "";
  };
}
