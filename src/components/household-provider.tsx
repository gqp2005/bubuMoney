"use client";

import { onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { userDoc } from "@/lib/firebase/user";
import { useAuth } from "@/components/auth-provider";

type HouseholdContextValue = {
  householdId: string | null;
  displayName: string | null;
  spouseRole: "husband" | "wife" | null;
  loading: boolean;
};

const HouseholdContext = createContext<HouseholdContextValue>({
  householdId: null,
  displayName: null,
  spouseRole: null,
  loading: true,
});

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [spouseRole, setSpouseRole] = useState<"husband" | "wife" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      setHouseholdId(null);
      setDisplayName(null);
      setSpouseRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(userDoc(user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as {
          householdId?: string;
          displayName?: string | null;
          spouseRole?: "husband" | "wife" | null;
        };
        setHouseholdId(data.householdId ?? null);
        setDisplayName(data.displayName ?? null);
        setSpouseRole(data.spouseRole ?? null);
      } else {
        setHouseholdId(null);
        setDisplayName(null);
        setSpouseRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [authLoading, user]);

  const value = useMemo(
    () => ({
      householdId,
      displayName,
      spouseRole,
      loading: authLoading || loading,
    }),
    [authLoading, displayName, householdId, loading, spouseRole]
  );

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return useContext(HouseholdContext);
}
