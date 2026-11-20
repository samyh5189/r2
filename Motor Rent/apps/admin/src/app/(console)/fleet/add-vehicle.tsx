"use client";

import { useState } from "react";
import { VehicleForm, type Option } from "./vehicle-form";

export function AddVehicle({ branches, plans }: { branches: Option[]; plans: Option[] }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  if (!open) {
    return (
      <div className="flex items-center gap-3">
        {added && <span className="rise text-sm text-emerald-600">Added ✓ — open it below to upload photos</span>}
        <button type="button" onClick={() => { setOpen(true); setAdded(false); }}
          className="rounded-xl bg-accent px-4 py-2 font-semibold text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] transition hover:-translate-y-0.5">
          ＋ Add vehicle
        </button>
      </div>
    );
  }
  return (
    <div className="rise w-full space-y-3 rounded-2xl border border-accent/40 bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">New vehicle</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-foreground">Cancel</button>
      </div>
      {!plans.length ? <p className="text-sm text-muted">Create a price plan first (Prices, below).</p> : (
        <VehicleForm branches={branches} plans={plans} onDone={() => { setOpen(false); setAdded(true); }} />
      )}
    </div>
  );
}
