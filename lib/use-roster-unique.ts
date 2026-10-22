"use client";

/** 고객명단(엑셀)에 있는 고유번호를 매물·만기 호실에서 자동으로 찾아주는 도우미 — 저장된 데이터는 바꾸지 않고 보여주기만 함 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-context";
import { subscribeRoster, unitKey, complexOf, dongHoOf, type RosterUnit } from "./roster-db";

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
  return (address, dong, ho) => {
    if (!map.size) return "";
    const dh = dongHoOf(address || "", dong, ho);
    if (!dh.ho) return "";
    return map.get(unitKey(complexOf(address || "", dong, ho), dh.dong, dh.ho)) || "";
  };
}
