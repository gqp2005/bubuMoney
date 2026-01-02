import Link from "next/link";
import AppGuard from "@/components/app-guard";

const navItems = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/transactions", label: "내역" },
  { href: "/stats", label: "통계" },
  { href: "/budget", label: "예산" },
  { href: "/notifications", label: "알림" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white/90 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-0 py-4">
          <Link className="hidden text-lg font-semibold md:block" href="/dashboard">
            Couple Ledger
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-2 text-xs sm:text-sm md:flex-none md:gap-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-full px-3 py-1 hover:bg-[var(--border)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            className="rounded-full border border-[var(--border)] px-3 py-1 text-sm"
            href="/settings"
          >
            내 계정
          </Link>
        </div>
      </header>
      <main className="flex w-full flex-col gap-6 px-0 py-8">
        <AppGuard>{children}</AppGuard>
      </main>
    </div>
  );
}
