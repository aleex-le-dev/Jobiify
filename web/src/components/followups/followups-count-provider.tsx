"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type FollowupsCountContextType = {
  dueCount: number;
  actionableCount: number;
  loading: boolean;
  refetch: () => void;
};

const FollowupsCountContext = createContext<FollowupsCountContextType>({
  dueCount: 0,
  actionableCount: 0,
  loading: false,
  refetch: () => {},
});

export function useFollowupsCount(): FollowupsCountContextType {
  return useContext(FollowupsCountContext);
}

export function FollowupsCountProvider({ children }: { children: React.ReactNode }) {
  const [dueCount, setDueCount] = useState<number>(0);
  const [actionableCount, setActionableCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const refetch = useCallback(() => {
    fetch("/api/followups")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.available === false) return;
        const due = (d.metadata?.overdue ?? 0) + (d.metadata?.urgent ?? 0);
        setDueCount(due);
        setActionableCount(d.metadata?.actionable ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const onFocus = () => refetch();
    const onFollowupsChanged = () => refetch();
    window.addEventListener("focus", onFocus);
    window.addEventListener("followups:changed", onFollowupsChanged);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("followups:changed", onFollowupsChanged);
    };
  }, [refetch]);

  return (
    <FollowupsCountContext.Provider value={{ dueCount, actionableCount, loading, refetch }}>
      {children}
    </FollowupsCountContext.Provider>
  );
}
