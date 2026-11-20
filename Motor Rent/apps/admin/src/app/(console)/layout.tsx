import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { SignOutButton } from "./sign-out";

const NAV: { href: string; label: string; count?: "messages" | "kyc" | "slips" }[] = [
  { href: "/", label: "Today" },
  { href: "/bookings", label: "Bookings", count: "messages" },
  { href: "/verifications", label: "Verifications", count: "kyc" },
  { href: "/transfers", label: "Transfers", count: "slips" },
  { href: "/fleet", label: "Fleet" },
  { href: "/blocklist", label: "Blocklist" },
  { href: "/settings", label: "Settings" },
];

/** Nav with counts of work waiting: unanswered rider messages, documents to check, slips to approve. */
async function Nav() {
  const { db } = await requireStaff();
  const { data } = await db.rpc("staff_inbox_counts");
  const counts = (data ?? {}) as Partial<Record<"messages" | "kyc" | "slips", number>>;
  return <NavLinks counts={counts} />;
}

function NavLinks({ counts }: { counts: Partial<Record<"messages" | "kyc" | "slips", number>> }) {
  return (
    <nav aria-label="Console" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {NAV.map((n) => {
        const c = n.count ? counts[n.count] ?? 0 : 0;
        return (
          <Link key={n.href} href={n.href} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-panel">
            {n.label}
            {c > 0 && <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-white" aria-label={`${c} waiting`}>{c}</span>}
          </Link>
        );
      })}
    </nav>
  );
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
          <span className="plate text-sm">RM</span>
          <span><span className="block font-display font-extrabold">Rent a Motor</span><span className="hidden text-xs text-muted sm:block">Kulhudhuffushi Motor Rentals</span></span>
        </Link>
        <div className="order-2 w-full sm:order-none sm:w-auto">
          <Suspense fallback={<NavLinks counts={{}} />}>
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
