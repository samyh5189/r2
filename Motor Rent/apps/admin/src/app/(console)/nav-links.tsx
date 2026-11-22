"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; count?: "messages" | "kyc" | "slips" | "whatsapp" };

/** Console nav: the current section is red; red counts show work waiting. */
export function NavLinks({ items, counts }: { items: NavItem[]; counts: Partial<Record<NonNullable<NavItem["count"]>, number>> }) {
  const path = usePathname();
  return (
    <nav aria-label="Console" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {items.map((n) => {
        const c = n.count ? counts[n.count] ?? 0 : 0;
        const active = n.href === "/" ? path === "/" : path === n.href || path.startsWith(n.href + "/");
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className="nav-link">
            {n.label}
            {c > 0 && <span className="nav-count min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-white" aria-label={`${c} waiting`}>{c}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
