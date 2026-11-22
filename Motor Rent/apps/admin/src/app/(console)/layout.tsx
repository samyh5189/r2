import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { SignOutButton } from "./sign-out";
import { NavLinks, type NavItem } from "./nav-links";

const NAV: NavItem[] = [
  { href: "/", label: "Today" },
  { href: "/bookings", label: "Bookings", count: "messages" },
  { href: "/riders", label: "Riders" },
  { href: "/verifications", label: "Verifications", count: "kyc" },
  { href: "/transfers", label: "Transfers", count: "slips" },
  { href: "/whatsapp", label: "WhatsApp", count: "whatsapp" },
  { href: "/accounting", label: "Accounting" },
  { href: "/fleet", label: "Fleet" },
  { href: "/blocklist", label: "Blocklist" },
  { href: "/settings", label: "Settings" },
];

/** Nav with counts of work waiting: unanswered rider messages, documents to check, slips to approve. */
async function Nav() {
  const { db } = await requireStaff();
  const { data } = await db.rpc("staff_inbox_counts");
  const counts = (data ?? {}) as Partial<Record<"messages" | "kyc" | "slips" | "whatsapp", number>>;
  return <NavLinks items={NAV} counts={counts} />;
}

async function CurrentUser() {
  const { user } = await requireStaff();
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted sm:inline">{user.name ?? "Staff"} ({user.role})</span>
      <SignOutButton />
    </div>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-background/95 px-4 py-2 backdrop-blur sm:static sm:px-6 sm:py-3">
        <Link href="/" className="flex items-center gap-2 leading-tight">
          <span className="brand-mark text-sm" aria-hidden>RM</span>
          <span><span className="block font-display font-extrabold">Rent a Motor</span><span className="hidden text-xs text-muted sm:block">Kulhudhuffushi Motor Rentals</span></span>
        </Link>
        <div className="order-2 w-full sm:order-none sm:w-auto">
          <Suspense fallback={<nav aria-label="Console" className="flex gap-1 overflow-x-auto">{NAV.map((n) => <Link key={n.href} href={n.href} className="nav-link">{n.label}</Link>)}</nav>}>
            <Nav />
          </Suspense>
        </div>
        <div className="ml-auto">
          <Suspense fallback={<span className="text-sm text-muted">…</span>}>
            <CurrentUser />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:p-6">{children}</main>
    </div>
  );
}
