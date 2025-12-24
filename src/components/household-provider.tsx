"use client";

import { getDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { userDoc } from "@/lib/firebase/user";
import { useAuth } from "@/components/auth-provider";

type HouseholdContextValue = {
  householdId: string | null;
  loading: boolean;
};

const HouseholdContext = createContext<HouseholdContextValue>({
  householdId: null,
  loading: true,
});

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      setHouseholdId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    getDoc(userDoc(user.uid))
      .then((snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as { householdId?: string };
          setHouseholdId(data.householdId ?? null);
        } else {
          setHouseholdId(null);
        }
      })
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  const value = useMemo(
    () => ({ householdId, loading: authLoading || loading }),
    [authLoading, householdId, loading]
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
