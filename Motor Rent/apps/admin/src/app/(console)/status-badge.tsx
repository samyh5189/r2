const TONE: Record<string, string> = {
  held: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  confirmed: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  active: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  overdue: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  damage_claim: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONE[status] ?? "bg-panel text-muted"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
