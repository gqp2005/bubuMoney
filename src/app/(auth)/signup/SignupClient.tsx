"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { signInWithEmail } from "@/lib/firebase/auth";
import { ApiError, requestSignup } from "@/lib/household";
import { useAuth } from "@/components/auth-provider";
import { ALLOW_OPEN_SIGNUP } from "@/lib/auth-policy";

export default function SignupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inviteCode = searchParams.get("invite")?.toUpperCase() ?? "";
  const partnerNameParam = searchParams.get("partnerName") ?? "";
  const inviterRole = searchParams.get("inviterRole") ?? "";
  const defaultRole =
    inviterRole === "husband"
      ? "wife"
      : inviterRole === "wife"
      ? "husband"
      : "husband";
  const [nickname, setNickname] = useState(partnerNameParam);
  const [spouseRole, setSpouseRole] = useState<"husband" | "wife">(
    defaultRole === "wife" ? "wife" : "husband"
  );

  // 초대코드가 없는 신규 가입은 기본적으로 차단한다. (NEXT_PUBLIC_ALLOW_OPEN_SIGNUP)
  const blocked = !inviteCode && !ALLOW_OPEN_SIGNUP;

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [router, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (blocked) {
      setError("초대코드가 필요합니다.");
      return;
    }
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const nicknameValue = nickname.trim();
    const rawRole = String(formData.get("spouseRole") ?? spouseRole);
    const resolvedRole = rawRole === "wife" ? "wife" : "husband";
    try {
      // 계정 생성 + 초대코드 검증 + 가계부 참여는 서버가 한 번에 처리한다.
      // 클라이언트는 성공을 확인한 뒤에만 로그인하고, 계정을 지우지 않는다.
      try {
        await requestSignup({
          email,
          password,
          nickname: nicknameValue,
          spouseRole: resolvedRole,
          inviteCode: inviteCode || undefined,
        });
      } catch (signupErr) {
        // 응답을 못 받았거나(서버는 성공했을 수 있음) 이미 가입된 이메일이면,
        // 같은 자격증명으로 로그인을 시도해 본다. 성공하면 그대로 진행한다.
        const recoverable =
          signupErr instanceof ApiError &&
          (signupErr.responseLost || signupErr.status === 409);
        if (recoverable) {
          try {
            await signInWithEmail(email, password);
            router.replace("/dashboard");
            return;
          } catch {
            // 로그인도 안 되면 원래 오류를 보여준다.
          }
        }
        setError(
          signupErr instanceof Error
            ? signupErr.message
            : "회원가입에 실패했습니다. 잠시 후 다시 시도해주세요."
        );
        return;
      }
      await signInWithEmail(email, password);
      router.replace("/dashboard");
    } catch {
      setError("가입은 완료됐지만 로그인에 실패했습니다. 로그인 화면에서 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  if (blocked) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold">초대가 필요합니다</h1>
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
            이 가계부는 초대받은 사람만 가입할 수 있습니다. 배우자에게 받은
            초대코드로 참여해주세요.
          </p>
        </div>
        <Link
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-center text-white"
          href="/invite"
        >
          초대코드 입력하기
        </Link>
        <div className="text-center text-sm">
          <Link className="text-[var(--accent)]" href="/login">
            이미 계정이 있나요? 로그인
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">회원가입</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          {inviteCode
            ? "초대코드로 가계부에 참여하세요."
            : "새 계정을 만들고 가계부를 시작하세요."}
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="text-sm font-medium">
          내 역할
          <div className="mt-2 flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="spouseRole"
                value="husband"
                checked={spouseRole === "husband"}
                onChange={() => setSpouseRole("husband")}
              />
              남편
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="spouseRole"
                value="wife"
                checked={spouseRole === "wife"}
                onChange={() => setSpouseRole("wife")}
              />
              아내
            </label>
          </div>
        </label>
        <label className="text-sm font-medium">
          닉네임
          <input
            type="text"
            name="nickname"
            placeholder="예) 민수"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
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
            placeholder="●●●●●●"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-70"
          disabled={loading}
        >
          {loading ? "가입 중.." : "계정 만들기"}
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
