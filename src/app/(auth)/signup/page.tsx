"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { signUpWithEmail } from "@/lib/firebase/auth";
import { createUserProfile } from "@/lib/firebase/user";
import { createHousehold } from "@/lib/household";
import { useAuth } from "@/components/auth-provider";

export default function SignupPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [router, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const householdName = String(formData.get("householdName") ?? "우리집");
    try {
      const credential = await signUpWithEmail(email, password);
      const householdId = await createHousehold(householdName, credential.user.uid);
      await createUserProfile(credential.user.uid, householdId);
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof FirebaseError) {
        if (err.code === "auth/email-already-in-use") {
          setError("이미 사용 중인 이메일입니다.");
        } else if (err.code === "auth/weak-password") {
          setError("비밀번호는 6자 이상이어야 합니다.");
        } else {
          setError(`회원가입 실패: ${err.code}`);
        }
      } else {
        setError("회원가입에 실패했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">회원가입</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          새 가계부를 만들어 시작하세요.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="text-sm font-medium">
          가계부 이름
          <input
            type="text"
            name="householdName"
            placeholder="우리집"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
          />
        </label>
        <label className="text-sm font-medium">
          이메일
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
          />
        </label>
        <label className="text-sm font-medium">
          비밀번호
          <input
            type="password"
            name="password"
            placeholder="••••••••"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-70"
          disabled={loading}
        >
          {loading ? "생성 중..." : "계정 만들기"}
        </button>
      </form>
      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}
      <div className="text-center text-sm">
        <Link className="text-[var(--accent)]" href="/login">
          이미 계정이 있나요? 로그인
        </Link>
      </div>
    </div>
  );
}
