"use client";

import { getDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { userDoc } from "@/lib/firebase/user";
import { useAuth } from "@/components/auth-provider";

type HouseholdContextValue = {
  householdId: string | null;
  displayName: string | null;
  loading: boolean;
};

const HouseholdContext = createContext<HouseholdContextValue>({
  householdId: null,
  displayName: null,
  loading: true,
});

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      setHouseholdId(null);
      setDisplayName(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    getDoc(userDoc(user.uid))
      .then((snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as {
            householdId?: string;
            displayName?: string | null;
          };
          setHouseholdId(data.householdId ?? null);
          setDisplayName(data.displayName ?? null);
        } else {
          setHouseholdId(null);
          setDisplayName(null);
        }
      })
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  const value = useMemo(
    () => ({ householdId, displayName, loading: authLoading || loading }),
    [authLoading, displayName, householdId, loading]
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
