"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { useNotifications } from "@/lib/notifications";

type NavItem = {
  href: string;
  label: string;
};

// /transactions/new, /transactions/[id] 처럼 하위 경로도 그 메뉴로 본다.
function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// 현재 페이지는 배경과 굵기로 고정 표시한다. 터치 기기에서는 hover가 탭한 뒤에도
// 남아 있다가 새로고침하면 사라지므로, hover만으로는 현재 위치를 보여줄 수 없다.
const ACTIVE_CLASS = "bg-[var(--border)] font-semibold";

/** 헤더 오른쪽의 "내 계정" 링크. 현재 경로를 알아야 해서 클라이언트에서 그린다. */
export function AccountLink() {
  const pathname = usePathname();
  const active =
    isActivePath(pathname, "/settings") || isActivePath(pathname, "/account");
  return (
    <Link
      className={`shrink-0 whitespace-nowrap rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--text)] ${
        active ? ACTIVE_CLASS : "hover:bg-[var(--border)]"
      }`}
      href="/settings"
      aria-current={active ? "page" : undefined}
    >
      내 계정
    </Link>
  );
}

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

  // 좁은 화면에서는 메뉴가 가로로 스크롤된다. 현재 메뉴가 보이는 영역 밖에
  // 있으면(예: 오른쪽 끝의 "알림") 그 항목이 보이도록 메뉴만 가로로 옮긴다.
  // 페이지 세로 스크롤은 건드리지 않는다.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) {
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    if (itemRect.left >= navRect.left && itemRect.right <= navRect.right) {
      return;
    }
    nav.scrollLeft += itemRect.left - navRect.left - (navRect.width - itemRect.width) / 2;
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      className="flex flex-1 flex-nowrap items-center gap-2 overflow-x-auto text-xs text-[var(--text)] sm:text-sm md:flex-none md:gap-4 hide-scrollbar min-w-0">
      {items.map((item) => {
        const showCount = item.href === "/notifications" && showBadge;
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-[var(--text)] ${
              active ? ACTIVE_CLASS : "hover:bg-[var(--border)]"
            }`}
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
