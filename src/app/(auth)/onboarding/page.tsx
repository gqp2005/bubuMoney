"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { createHousehold } from "@/lib/household";
import { setUserHousehold } from "@/lib/firebase/user";

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
      const household = await createHousehold(
        name,
        user.uid,
        displayName ?? undefined,
        partnerNickname
      );
      await setUserHousehold(user.uid, household);
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(`생성 오류: ${err.code}`);
      } else {
        setError("가계부 생성에 실패했습니다.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">가계부 시작</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          새 가계부를 만들거나 초대 코드로 참여하세요.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold">새 가계부 만들기</h2>
        <label className="mt-3 block text-sm font-medium">
          가계부 이름
          <input
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm font-medium">
          상대방 닉네임
          <input
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            value={partnerNickname}
            onChange={(event) => setPartnerNickname(event.target.value)}
            placeholder="예) 궁디"
          />
        </label>
        <button
          className="mt-4 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-70"
          onClick={handleCreate}
          disabled={submitting}
        >
          {submitting ? "생성 중..." : "가계부 만들기"}
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold">초대 코드로 참여</h2>
        <p className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
          배우자가 보낸 초대 코드를 입력해 기존 가계부에 참여할 수 있어요.
        </p>
        <Link
          className="mt-4 block w-full rounded-xl border border-[var(--border)] px-4 py-3 text-center text-sm"
          href="/invite"
        >
          초대 코드 입력하기
        </Link>
      </div>

      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
