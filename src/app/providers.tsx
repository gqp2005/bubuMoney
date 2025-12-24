"use client";

import { AuthProvider } from "@/components/auth-provider";
import { HouseholdProvider } from "@/components/household-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <HouseholdProvider>{children}</HouseholdProvider>
    </AuthProvider>
  );
}
