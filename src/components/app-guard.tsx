"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";

export default function AppGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { householdId, loading: householdLoading } = useHousehold();

  useEffect(() => {
    if (authLoading || householdLoading) {
      return;
    }
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!householdId) {
      router.replace("/onboarding");
    }
  }, [authLoading, householdId, householdLoading, router, user]);

  if (authLoading || householdLoading) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6 text-sm">
        로딩 중...
      </div>
    );
  }

  return <>{children}</>;
}
