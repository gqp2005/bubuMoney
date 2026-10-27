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

type Profile = {
  householdId: string | null;
  displayName: string | null;
  spouseRole: "husband" | "wife" | null;
};

const EMPTY_PROFILE: Profile = {
  householdId: null,
  displayName: null,
  spouseRole: null,
};

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [received, setReceived] = useState<
    { uid: string; profile: Profile } | null
  >(null);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (authLoading || !uid) {
      return;
    }
    const unsubscribe = onSnapshot(userDoc(uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as {
          householdId?: string;
          displayName?: string | null;
          spouseRole?: "husband" | "wife" | null;
        };
        setReceived({
          uid,
          profile: {
            householdId: data.householdId ?? null,
            displayName: data.displayName ?? null,
            spouseRole: data.spouseRole ?? null,
          },
        });
      } else {
        setReceived({ uid, profile: EMPTY_PROFILE });
      }
    });
    return () => unsubscribe();
  }, [authLoading, uid]);

  // 로그인 사용자가 바뀌면 이전 사용자의 프로필은 버린다.
  const fresh = received && received.uid === uid ? received.profile : null;
  const profile = fresh ?? EMPTY_PROFILE;
  const loading = authLoading || (uid !== null && fresh === null);

  const value = useMemo(
    () => ({
      householdId: profile.householdId,
      displayName: profile.displayName,
      spouseRole: profile.spouseRole,
      loading,
    }),
    [loading, profile]
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
