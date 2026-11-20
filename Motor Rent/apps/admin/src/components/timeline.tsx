import Link from "next/link";

/**
 * Odoo-style chatter for the console: newest first, grouped by day, messages and logged changes
 * (status arrows, field changes, payments, inspections…) on one timeline.
 */
export type TimelineEntry = {
  key: string;
  at: Date;
  who: { name: string; avatarUrl?: string | null; tag?: "Rider" | "Office" | "System" };
  kind: "message" | "status" | "log";
  body?: string;                                  // message text
  from?: string | null; to?: string;              // status change
  title?: string;                                 // log line
  tone?: "success" | "danger" | "warning" | "neutral";
  changes?: { field: string; from: string; to: string }[];
  note?: string | null;
  href?: string;                                  // link to a related record
  images?: { url: string; label: string }[];
};

const TZ = "Indian/Maldives";
const dayKey = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: TZ });
function dayLabel(d: Date) {
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return "Today";
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}
const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

const DOT = { success: "bg-emerald-500", danger: "bg-red-500", warning: "bg-amber-500", neutral: "bg-muted" } as const;
const TAG = {
  Rider: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Office: "bg-accent/15 text-accent",
  System: "bg-line text-muted",
} as const;

export function Timeline({ entries, empty = "No activity yet." }: { entries: TimelineEntry[]; empty?: string }) {
  const sorted = [...entries].sort((a, b) => b.at.getTime() - a.at.getTime());
  const groups: { day: string; items: TimelineEntry[] }[] = [];
  for (const e of sorted) {
    const d = dayLabel(e.at);
    if (groups.at(-1)?.day === d) groups.at(-1)!.items.push(e); else groups.push({ day: d, items: [e] });
  }
  if (!entries.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.day} className="space-y-4">
          <div className="flex items-center gap-3 text-xs font-semibold text-muted">
            <span className="h-px flex-1 bg-line" />{g.day}<span className="h-px flex-1 bg-line" />
          </div>
          {g.items.map((e) => <Row key={e.key} e={e} />)}
        </section>
      ))}
    </div>
  );
}

function Row({ e }: { e: TimelineEntry }) {
  return (
    <article className="flex gap-3">
      {e.who.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.who.avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
      ) : (
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${e.who.tag === "Rider" ? "bg-sky-600" : e.who.tag === "System" ? "bg-zinc-500" : "bg-accent"}`}>
          {e.who.tag === "System" ? "⚙" : initials(e.who.name)}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-semibold">{e.who.name}</span>
          {e.who.tag && <span className={`rounded px-1.5 text-[11px] font-semibold ${TAG[e.who.tag]}`}>{e.who.tag}</span>}
          <span className="text-xs text-muted">· {time(e.at)}</span>
        </div>

        {e.kind === "message" && (
          <p className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border border-line px-3 py-2 text-sm ${e.who.tag === "Office" ? "bg-accent/10" : "bg-panel"}`}>{e.body}</p>
        )}
        {e.kind === "status" && (
          <p className="flex items-center gap-2 text-sm">
            <span className="size-1.5 rounded-full bg-muted" />
            {e.from ? <><span className="text-muted">{e.from}</span> → <span className="font-semibold text-accent">{e.to}</span> <span className="text-muted">(Status)</span></>
              : <>Created · <span className="font-semibold text-accent">{e.to}</span></>}
          </p>
        )}
        {e.kind === "log" && (
          <p className="flex items-center gap-2 text-sm">
            <span className={`size-1.5 shrink-0 rounded-full ${DOT[e.tone ?? "neutral"]}`} />
            {e.href ? <Link href={e.href} className="hover:underline">{e.title}</Link> : e.title}
          </p>
        )}
        {!!e.changes?.length && (
          <ul className="space-y-0.5 pl-3.5 text-sm">
            {e.changes.map((c) => (
              <li key={c.field}><span className="text-muted">{c.from || "—"}</span> → <span className="font-medium">{c.to || "—"}</span> <span className="text-muted">({c.field})</span></li>
            ))}
          </ul>
        )}
        {e.note && <p className="pl-3.5 text-sm text-muted">“{e.note}”</p>}
        {!!e.images?.length && (
          <div className="flex flex-wrap gap-2 pl-3.5">
            {e.images.map((im) => (
              <a key={im.url} href={im.url} target="_blank" rel="noreferrer" title={im.label}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={im.label} className="h-16 w-20 rounded-lg border border-line object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** Turns an audit_log before/after pair into readable field changes. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null, labels: Record<string, string>,
  fmt: (field: string, v: unknown) => string = (_f, v) => (v == null ? "" : String(v))) {
  const out: { field: string; from: string; to: string }[] = [];
  for (const [k, label] of Object.entries(labels)) {
    const a = before?.[k]; const b = after?.[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push({ field: label, from: fmt(k, a), to: fmt(k, b) });
  }
  return out;
}

export const avatarPublicUrl = (path?: string | null) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}` : null;
