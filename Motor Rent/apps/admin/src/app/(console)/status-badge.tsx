const TONE: Record<string, string> = {
  held: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  confirmed: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  returned: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  closed: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
  overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  damage_claim: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

/** Soft pill for booking and verification states. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TONE[status] ?? "bg-slate-500/10 text-muted"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
