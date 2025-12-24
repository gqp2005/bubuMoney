"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signInWithEmail } from "@/lib/firebase/auth";
import { useAuth } from "@/components/auth-provider";

export default function LoginPage() {
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
    try {
      await signInWithEmail(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError("로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">로그인</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          부부 공동 가계부에 접속하세요.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}
      <div className="flex flex-col gap-2 text-center text-sm">
        <Link className="text-[var(--accent)]" href="/signup">
          계정이 없나요? 회원가입
        </Link>
        <Link className="text-[var(--accent)]" href="/invite">
          초대코드로 참여하기
        </Link>
      </div>
    </div>
  );
}
