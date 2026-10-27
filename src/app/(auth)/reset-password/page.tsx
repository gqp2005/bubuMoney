"use client";

import Link from "next/link";
import { useState } from "react";
import { FirebaseError } from "firebase/app";
import { sendPasswordReset } from "@/lib/firebase/auth";

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    if (!email) {
      setError("이메일을 입력해주세요.");
      setLoading(false);
      return;
    }
    try {
      await sendPasswordReset(email);
      // 가입된 이메일인지 알려주지 않는다. 계정 존재 여부가 새어나가지 않도록
      // 성공과 실패 모두 같은 화면을 보여준다.
      setSent(true);
    } catch (err) {
      if (
        err instanceof FirebaseError &&
        (err.code === "auth/user-not-found" ||
          err.code === "auth/invalid-email")
      ) {
        setSent(true);
      } else if (
        err instanceof FirebaseError &&
        err.code === "auth/too-many-requests"
      ) {
        setError("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
      } else {
        setError("메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold">메일을 보냈습니다</h1>
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
            입력하신 주소로 가입된 계정이 있다면 비밀번호 재설정 메일이
            도착합니다. 메일이 보이지 않으면 스팸함도 확인해주세요.
          </p>
        </div>
        <div className="text-center text-sm">
          <Link className="text-[var(--accent)]" href="/login">
            로그인 화면으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">비밀번호 재설정</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          가입할 때 사용한 이메일로 재설정 링크를 보내드립니다.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="text-sm font-medium">
          이메일
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-70"
          disabled={loading}
        >
          {loading ? "보내는 중..." : "재설정 메일 받기"}
        </button>
      </form>
      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}
      <div className="text-center text-sm">
        <Link className="text-[var(--accent)]" href="/login">
          로그인 화면으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
