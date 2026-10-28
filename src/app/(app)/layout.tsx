import Link from "next/link";
import AppGuard from "@/components/app-guard";
import AppNav, { AccountLink } from "@/components/app-nav";

const navItems = [
  { href: "/dashboard", label: "메인" },
  { href: "/transactions", label: "내역" },
  { href: "/stats", label: "통계" },
  { href: "/budget", label: "예산" },
  { href: "/assets", label: "자산" },
  { href: "/notifications", label: "알림" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]/90 text-[var(--text)] backdrop-blur">
        {/* 좌우 여백: 모바일에서 카드·버튼이 화면 가장자리에 붙거나 잘리지 않도록 */}
        <div className="flex w-full items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link className="hidden text-lg font-semibold md:block" href="/dashboard">
            Couple Ledger
          </Link>
          <AppNav items={navItems} />
          <AccountLink />
        </div>
      </header>
      <main className="flex w-full flex-col gap-6 px-4 py-6 ios-no-zoom sm:px-6 md:py-8">
        <AppGuard>{children}</AppGuard>
      </main>
    </div>
  );
}
