"use client";

import { LICENCE_CATEGORIES, type LicenceCategory } from "@motor-rent/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** A verified rider's licence categories, editable by staff (e.g. the rider adds a car category). */
export function LicenceCategories({ rider, current }: { rider: string; current: string[] }) {
  const router = useRouter();
  const [cats, setCats] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = [...cats].sort().join() !== [...current].sort().join();
  async function save() {
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().rpc("set_licence_categories", { p_rider: rider, p_categories: cats });
    setBusy(false);
    if (error) setError(error.message); else router.refresh();
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {(Object.keys(LICENCE_CATEGORIES) as LicenceCategory[]).map((c) => {
        const on = cats.includes(c);
        return (
          <button key={c} type="button" aria-pressed={on} onClick={() => setCats(on ? cats.filter((x) => x !== c) : [...cats, c])}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition ${on ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line text-muted"}`}>
            {c} · {LICENCE_CATEGORIES[c].short}
          </button>
        );
      })}
      {dirty && <button type="button" disabled={busy} onClick={save} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Save"}</button>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
