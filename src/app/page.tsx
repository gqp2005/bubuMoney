import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fdf7f1,_#f4e7db)]">
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-start justify-center gap-10 px-6 py-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/80 px-4 py-1 text-sm">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          <span>부부 공동 가계부 PWA</span>
        </div>
        <h1 className="text-4xl font-bold leading-tight text-[var(--foreground)] md:text-5xl">
          함께 쓰고, 한눈에 보는
          <br />
          커플 가계부
        </h1>
        <p className="max-w-xl text-lg text-[color:rgba(45,38,34,0.75)]">
          수입과 지출을 월별로 정리하고, 예산과 통계를 한 화면에서
          공유하세요.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-[var(--accent)] px-6 py-3 text-white shadow-lg shadow-[rgba(59,47,47,0.25)]"
            href="/login"
          >
            시작하기
          </Link>
          <Link
            className="rounded-full border border-[var(--border)] bg-white px-6 py-3 text-[var(--foreground)]"
            href="/signup"
          >
            계정 만들기
          </Link>
        </div>
      </main>
    </div>
  );
}
