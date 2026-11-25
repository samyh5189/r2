"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { SignOutButton } from "./sign-out";

export type CountKey = "messages" | "kyc" | "slips" | "whatsapp";
export type NavItem = { href: string; label: string; icon: IconName; count?: CountKey; tab?: boolean };
type Counts = Partial<Record<CountKey, number>>;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
const countOf = (n: NavItem, counts: Counts) => (n.count ? counts[n.count] ?? 0 : 0);

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="nav-count ml-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-white" aria-label={`${n} waiting`}>{n}</span> : null;
}

/** Desktop sidebar: every section, with counts of work waiting. */
export function SideNav({ items, counts }: { items: NavItem[]; counts: Counts }) {
  const path = usePathname();
  return (
    <nav aria-label="Console" className="flex flex-col gap-1">
      {items.map((n) => (
        <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined} className="nav-link">
          <Icon name={n.icon} />{n.label}<Count n={countOf(n, counts)} />
        </Link>
      ))}
    </nav>
  );
}

/** Phones: four main tabs and a More sheet with the other sections and sign out. */
export function TabBar({ items, counts, user }: { items: NavItem[]; counts: Counts; user: { name: string; role: string } }) {
  const path = usePathname();
  // Remember the page the sheet was opened on: navigating anywhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenOn((typeof v === "function" ? v(open) : v) ? path : null);
  const tabs = items.filter((n) => n.tab);
  const rest = items.filter((n) => !n.tab);
  const restWaiting = rest.reduce((a, n) => a + countOf(n, counts), 0);
  const restActive = rest.some((n) => isActive(path, n.href));
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <button className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
            <div className="mb-3 flex items-center gap-3 px-1">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft font-bold text-accent">{user.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{user.name}</div><div className="text-xs capitalize text-muted">{user.role}</div></div>
              <SignOutButton />
            </div>
            <nav aria-label="More" className="grid grid-cols-3 gap-2">
              {rest.map((n) => {
                const c = countOf(n, counts);
                return (
                  <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}
                    className="relative flex flex-col items-center gap-2 rounded-2xl border border-line p-3 text-center text-xs font-semibold aria-[current=page]:border-accent aria-[current=page]:text-accent">
                    <span className="icon-chip bg-accent-soft text-accent"><Icon name={n.icon} /></span>{n.label}
                    {c > 0 && <span className="absolute right-2 top-2 min-w-5 rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-white">{c}</span>}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
      <nav aria-label="Console" className="tabbar flex lg:hidden">
        {tabs.map((n) => {
          const c = countOf(n, counts);
          return (
            <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined} className="tab">
              <Icon name={n.icon} />{n.label}{c > 0 && <span className="dot" aria-label={`${c} waiting`}>{c}</span>}
            </Link>
          );
        })}
        <button type="button" className="tab" aria-current={restActive ? "page" : undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="grid" />More{restWaiting > 0 && <span className="dot">{restWaiting}</span>}
        </button>
      </nav>
    </>
  );
}
