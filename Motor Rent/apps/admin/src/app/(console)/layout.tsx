import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { requireStaff } from "@/lib/auth";
import { SignOutButton } from "./sign-out";
import { SideNav, TabBar, type NavItem } from "./nav-links";

const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: "home", tab: true },
  { href: "/bookings", label: "Bookings", icon: "calendar", count: "messages", tab: true },
  { href: "/riders", label: "Riders", icon: "users", tab: true },
  { href: "/fleet", label: "Fleet", icon: "bike", tab: true },
  { href: "/verifications", label: "Verifications", icon: "badge", count: "kyc" },
  { href: "/transfers", label: "Transfers", icon: "bank", count: "slips" },
  { href: "/whatsapp", label: "WhatsApp", icon: "chat", count: "whatsapp" },
  { href: "/accounting", label: "Accounting", icon: "chart" },
  { href: "/blocklist", label: "Blocklist", icon: "ban" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 leading-tight">
      <span className="brand-mark text-sm" aria-hidden>ER</span>
      <span><span className="block font-extrabold">EasyRide</span><span className="block text-xs text-muted">Staff console</span></span>
    </Link>
  );
}

/** Sidebar (desktop), top bar and tab bar (phones), with counts of work waiting:
 *  unanswered rider messages, documents to check, slips to approve, WhatsApp to send by hand. */
async function Chrome() {
  const { db, user } = await requireStaff();
  const { data } = await db.rpc("staff_inbox_counts");
  const counts = (data ?? {}) as Partial<Record<"messages" | "kyc" | "slips" | "whatsapp", number>>;
  const name = user.name ?? "Staff";
  const waiting = (counts.messages ?? 0) + (counts.kyc ?? 0) + (counts.slips ?? 0);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-line bg-panel px-4 py-5 lg:flex">
        <Brand />
        <div className="min-h-0 flex-1 overflow-y-auto"><SideNav items={NAV} counts={counts} /></div>
        <div className="flex items-center gap-3 rounded-2xl bg-background p-3">
          <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft font-bold text-accent">{name.slice(0, 1)}</span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{name}</div><div className="text-xs capitalize text-muted">{user.role}</div></div>
        </div>
        <SignOutButton />
      </aside>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-background/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Brand />
        <Link href="/bookings" className="relative ml-auto grid size-10 place-items-center rounded-full border border-line bg-panel" aria-label={waiting ? `${waiting} things waiting` : "Bookings"}>
          <Icon name="bell" className="size-5" />
          {waiting > 0 && <span className="absolute right-2 top-2 size-2.5 rounded-full bg-accent ring-2 ring-panel" />}
        </Link>
        <span className="grid size-10 place-items-center rounded-full bg-accent-soft font-bold text-accent" title={`${name} (${user.role})`}>{name.slice(0, 1)}</span>
      </header>
      <TabBar items={NAV} counts={counts} user={{ name, role: user.role }} />
    </>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:pl-64">
      <Suspense fallback={<header className="flex items-center border-b border-line px-4 py-2.5 lg:hidden"><Brand /></header>}>
        <Chrome />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
    </div>
  );
}
