"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { createInvite } from "@/lib/household";
import { signOutUser } from "@/lib/firebase/auth";

export default function SettingsPage() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    if (!user || !householdId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const invite = await createInvite(householdId, user.uid);
      setInviteCode(invite.code);
    } catch (err) {
      setError("초대코드 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await signOutUser();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">설정</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          초대 코드 및 계정 정보를 관리하세요.
        </p>
      </div>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">초대코드</h2>
            <p className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
              배우자에게 공유할 코드를 생성하세요.
            </p>
            {inviteCode ? (
              <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-center text-lg tracking-widest">
                {inviteCode}
              </div>
            ) : null}
            <button
              className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-70"
              onClick={handleInvite}
              disabled={!user || !householdId || loading}
            >
              {loading ? "생성 중..." : "코드 생성"}
            </button>
            {error ? (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">로그아웃</h2>
            <p className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
              다른 계정으로 로그인할 수 있습니다.
            </p>
            <button
              className="mt-4 rounded-full border border-[var(--border)] px-4 py-2 text-sm"
              onClick={handleLogout}
            >
              로그아웃
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
