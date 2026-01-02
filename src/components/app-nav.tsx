"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { useNotifications } from "@/lib/notifications";

type NavItem = {
  href: string;
  label: string;
};

export default function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const { notifications } = useNotifications(householdId, user?.uid);

  const unreadCount = useMemo(() => {
    if (!user) {
      return 0;
    }
    return notifications.filter((item) => !item.readBy?.[user.uid]).length;
  }, [notifications, user]);

  const showBadge =
    unreadCount > 0 && !pathname.startsWith("/notifications");

  return (
    <nav className="flex flex-1 flex-wrap items-center gap-2 text-xs sm:text-sm md:flex-none md:gap-4">
      {items.map((item) => {
        const showCount = item.href === "/notifications" && showBadge;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-full px-3 py-1 hover:bg-[var(--border)]"
          >
            <span className="inline-flex items-center gap-1">
              {item.label}
              {showCount ? (
                <>
                  <span
                    className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white"
                    aria-label={`${unreadCount} unread notifications`}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                </>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
