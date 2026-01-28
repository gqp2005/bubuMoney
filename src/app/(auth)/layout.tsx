export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fdf7f1,_#f4e7db)]">
      <main className="flex min-h-screen w-full flex-col justify-center gap-6 px-0 py-12 ios-no-zoom">
        <div className="rounded-3xl border border-[var(--border)] bg-white/90 p-8 shadow-xl shadow-[rgba(59,47,47,0.12)]">
          {children}
        </div>
      </main>
    </div>
  );
}
