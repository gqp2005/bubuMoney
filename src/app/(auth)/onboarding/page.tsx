"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { ALLOW_OPEN_SIGNUP } from "@/lib/auth-policy";
import { createHouseholdViaApi } from "@/lib/household";

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { householdId, loading, displayName } = useHousehold();
  const [name, setName] = useState("우리집");
  const [partnerNickname, setPartnerNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!loading && householdId) {
      router.replace("/dashboard");
    }
  }, [householdId, loading, router, user]);

  async function handleCreate() {
    if (!user) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // 가계부 생성은 서버만 할 수 있다. (Firestore 규칙이 클라이언트 생성을 막음)
      await createHouseholdViaApi({
        user,
        name,
        displayName: displayName ?? undefined,
        partnerDisplayName: partnerNickname,
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "가계부 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">가계부 시작</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          {ALLOW_OPEN_SIGNUP
            ? "새 가계부를 만들거나 초대 코드로 참여하세요."
            : "배우자에게 받은 초대 코드로 가계부에 참여하세요."}
        </p>
      </div>

      {ALLOW_OPEN_SIGNUP ? (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">새 가계부 만들기</h2>
          <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
            가계부 이름과 상대방 닉네임을 입력해주세요.
          </p>
        </div>
        <label className="mt-4 block text-sm font-medium">
          가계부 이름
          <input
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="우리집"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          상대방 닉네임
          <input
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            value={partnerNickname}
            onChange={(event) => setPartnerNickname(event.target.value)}
            placeholder="예) 궁디"
          />
        </label>
        <button
          className="mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-70"
          onClick={handleCreate}
          disabled={submitting}
        >
          {submitting ? "생성 중..." : "가계부 만들기"}
        </button>
      </section>
      ) : null}

      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">초대 코드로 참여</h2>
          <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
            배우자가 보낸 초대 코드를 입력해 기존 가계부에 참여하세요.
          </p>
        </div>
        <Link
          className="mt-4 block w-full rounded-xl border border-[var(--border)] px-4 py-3 text-center text-sm"
          href="/invite"
        >
          초대 코드 입력하기
        </Link>
      </section>

      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
