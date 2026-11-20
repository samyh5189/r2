import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { SignOutButton } from "./sign-out";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/bookings", label: "Bookings" },
  { href: "/fleet", label: "Fleet" },
];

async function CurrentUser() {
  const { user } = await requireStaff();
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted">{user.name ?? "Staff"} · {user.role}</span>
      <SignOutButton />
    </div>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3 sm:px-6">
        <span className="font-semibold">Motor Rent</span>
        <nav className="flex gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-sm hover:bg-panel">{n.label}</Link>
          ))}
        </nav>
        <div className="ml-auto">
          <Suspense fallback={<span className="text-sm text-muted">…</span>}>
            <CurrentUser />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
