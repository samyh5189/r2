"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AGREEMENT_SECTIONS, AGREEMENT_SUMMARY, AGREEMENT_VERSION } from "@motor-rent/shared";
import { SignatureCanvas } from "@/components/signature-canvas";
import { openAgreement } from "./agreement-card";
import { money } from "@/lib/format";
import { CAR_CHECKS } from "./checks";
import { supabaseBrowser } from "@/lib/supabase/client";

const ANGLES = [
  { key: "front", label: "Front" }, { key: "back", label: "Back" }, { key: "left", label: "Left side" },
  { key: "right", label: "Right side" }, { key: "dashboard", label: "Dashboard (odometer)" }, { key: "close-ups", label: "Scratches / damage" },
] as const;
type Angle = (typeof ANGLES)[number]["key"];
type Check = "ok" | "issue";
const field = "w-full rounded-xl border border-line bg-panel px-3 py-2 outline-none focus:border-accent";

/** Shrink phone photos to ≤1600px JPEG before upload. */
async function compress(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not read photo"))), "image/jpeg", 0.82));
}

/**
 * Vehicle handover (pickup) and collection (return) at the counter: 6 photos, odometer, engine running hours,
 * fuel, notes, rider + staff signatures. Same server checks as the staff app (submit-inspection).
 */
export function Handover({ bookingId, phase, currency, lastOdometer, lastEngineHours, riderName, isCar = false, licenceProblem = null }: {
  bookingId: string; phase: "pickup" | "return"; currency: string;
  lastOdometer: number | null; lastEngineHours: number | null; riderName: string;
  /** Cars get the extra checklist. */ isCar?: boolean;
  /** Set when the rider's licence doesn't cover this vehicle: handover is blocked. */ licenceProblem?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<Partial<Record<Angle, { file: File; url: string }>>>({});
  const [odometer, setOdometer] = useState("");
  const [hours, setHours] = useState("");
  const [noMeter, setNoMeter] = useState(false);
  const [fuel, setFuel] = useState(8);
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<Partial<Record<string, Check>>>({});
  const [riderSig, setRiderSig] = useState<string | null>(null);
  const [staffSig, setStaffSig] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [contract, setContract] = useState<{ path?: string; error?: string } | null>(null);

  const isPickup = phase === "pickup";
  const odo = Number(odometer);
  const hrs = Number(hours);
  const problems = [
    ANGLES.some((a) => !photos[a.key]) && "all 6 photos",
    (!odometer || !Number.isInteger(odo) || odo < 0) && "odometer",
    lastOdometer != null && odometer && odo < lastOdometer && `odometer of at least ${lastOdometer} km`,
    !noMeter && (!hours || Number.isNaN(hrs) || hrs < 0) && "engine hours",
    !noMeter && lastEngineHours != null && hours && hrs < lastEngineHours && `engine hours of at least ${lastEngineHours}`,
    isPickup && !accepted && "the rider accepting the agreement",
    !riderSig && "rider signature",
    !staffSig && "staff signature",
    isCar && CAR_CHECKS.some((c) => !checks[c.key]) && "the car checklist",
    isCar && CAR_CHECKS.some((c) => checks[c.key] === "issue") && !notes.trim() && "a note about the checklist issues",
  ].filter(Boolean) as string[];

  async function submit() {
    setError(null);
    const db = supabaseBrowser();
    try {
      const stamp = Date.now();
      setBusy("Uploading photos…");
      const photoPaths = await Promise.all(ANGLES.map(async (a) => {
        const path = `${bookingId}/${phase}/${a.key}-${stamp}.jpg`;
        const { error } = await db.storage.from("inspections").upload(path, await compress(photos[a.key]!.file), { contentType: "image/jpeg" });
        if (error) throw new Error(`Uploading the ${a.label.toLowerCase()} photo failed.`);
        return path;
      }));
      setBusy("Saving signatures…");
      const sig = async (who: "rider" | "staff", svg: string) => {
        const path = `${bookingId}/${phase}/${who}-signature-${stamp}.svg`;
        const { error } = await db.storage.from("inspections").upload(path, new Blob([svg], { type: "image/svg+xml" }), { contentType: "image/svg+xml" });
        if (error) throw new Error(`Saving the ${who} signature failed.`);
        return path;
      };
      const [riderSignaturePath, staffSignaturePath] = await Promise.all([sig("rider", riderSig!), sig("staff", staffSig!)]);
      setBusy(isPickup ? "Handing over…" : "Closing the rental…");
      const { data, error } = await db.functions.invoke<{ status: string; lateFee?: number; contractPath?: string; contractError?: string }>("submit-inspection", {
        body: { bookingId, phase, photoPaths, fuelLevel: fuel, odometerKm: odo, engineHours: noMeter ? null : hrs,
          riderSignaturePath, staffSignaturePath, notes: notes.trim() || undefined,
          checklist: isCar ? checks : undefined, agreementAccepted: isPickup ? accepted : undefined },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(body?.error?.message ?? body?.message ?? "The server refused this inspection.");
      }
      if (isPickup) setContract({ path: data?.contractPath, error: data?.contractError });
      setDone(isPickup ? "Handed over. The rental is now on the road."
        : data?.lateFee ? `Collected. Returned late: collect a late fee of ${money(data.lateFee, currency)}.` : "Collected. Rental closed for inspection.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(null); }
  }

  if (isPickup && licenceProblem) {
    return (
      <div role="alert" className="space-y-1 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
        <p className="font-semibold">Can’t hand over: licence category missing</p>
        <p className="text-muted">{licenceProblem}</p>
      </div>
    );
  }
  if (done) return (
    <div role="status" className="space-y-3 rounded-2xl bg-emerald-500/10 p-4 text-sm">
      <p className="font-medium text-emerald-700 dark:text-emerald-400">{done}</p>
      {contract?.path && (
        <div className="grid gap-2 sm:flex">
          <button type="button" className="btn btn-primary" onClick={() => openAgreement(contract.path!)}>Open the signed agreement</button>
          <button type="button" className="btn btn-secondary" onClick={() => openAgreement(contract.path!, true)}>Download PDF</button>
        </div>
      )}
      {contract?.error && <p className="text-amber-700">{contract.error}</p>}
    </div>
  );
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-lg w-full">
        {isPickup ? `Hand over the vehicle to ${riderName}` : `Collect the vehicle from ${riderName}`}
      </button>
    );
  }

  return (
    <section id="handover" className="space-y-5 rounded-2xl border border-line bg-panel p-3 sm:p-4">
      <div>
        <h2 className="text-lg font-semibold">{isPickup ? "Hand over" : "Collect"}</h2>
        <p className="text-sm text-muted">{isPickup ? "Check the rider's licence matches their profile, walk round the vehicle with them, then both sign." : "Walk round the vehicle with the rider, note any new damage, then both sign."}</p>
      </div>

      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Photos</h3>
        <span className={`text-xs font-semibold ${ANGLES.every((a) => photos[a.key]) ? "text-emerald-600" : "text-muted"}`}>{ANGLES.filter((a) => photos[a.key]).length} of {ANGLES.length}</span>
      </div>
      <div className="-mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {ANGLES.map((a) => {
          const p = photos[a.key];
          return (
            <label key={a.key} className="group relative block cursor-pointer overflow-hidden rounded-xl border-[1.5px] border-dashed border-line">
              {p ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={a.label} className="aspect-[4/3] w-full object-cover" />
              ) : <span className="flex aspect-[4/3] flex-col items-center justify-center gap-1 p-2 text-center text-sm text-muted"><span aria-hidden className="text-2xl leading-none">＋</span>Take photo</span>}
              <span className="block border-t border-line px-2 py-1 text-xs font-medium">{a.label}{p ? " (tap to retake)" : ""}</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotos((s) => ({ ...s, [a.key]: { file: f, url: URL.createObjectURL(f) } })); }} />
            </label>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="col-span-2 space-y-1 sm:col-span-1"><span className="text-xs font-medium text-muted">Odometer (km){lastOdometer != null ? `, last ${lastOdometer}` : ""}</span>
          <input className={field} inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Engine running hours{lastEngineHours != null ? `, last ${lastEngineHours}` : ""}</span>
          <input className={field} inputMode="decimal" value={hours} disabled={noMeter} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} />
          <span className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={noMeter} onChange={(e) => setNoMeter(e.target.checked)} /> No hour meter</span></label>
        <label className="space-y-1"><span className="text-xs font-medium text-muted">Fuel</span>
          <select className={field} value={fuel} onChange={(e) => setFuel(Number(e.target.value))}>
            {[8, 7, 6, 5, 4, 3, 2, 1, 0].map((n) => <option key={n} value={n}>{n === 8 ? "Full" : n === 0 ? "Empty" : n === 4 ? "Half" : `${n}/8`}</option>)}
          </select></label>
      </div>
      {isCar && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Car checklist</legend>
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {CAR_CHECKS.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{c.label}</span>
                <span className="flex gap-1">
                  {(["ok", "issue"] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={checks[c.key] === v} onClick={() => setChecks((x) => ({ ...x, [c.key]: v }))}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${checks[c.key] === v
                        ? (v === "ok" ? "border-emerald-600 bg-emerald-600 text-white" : "border-red-600 bg-red-600 text-white") : "border-line text-muted"}`}>
                      {v === "ok" ? "OK" : "Issue"}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {CAR_CHECKS.some((c) => checks[c.key] === "issue") && <p className="text-xs text-amber-700">Describe each issue in the notes below.</p>}
        </fieldset>
      )}
      <label className="block space-y-1"><span className="text-xs font-medium text-muted">Notes (existing scratches, helmet count, anything agreed)</span>
        <textarea className={field} rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

      {isPickup && (
        <fieldset className="space-y-3 rounded-xl border border-line bg-panel p-3">
          <legend className="px-1 text-sm font-semibold">Rental agreement</legend>
          <p className="text-sm text-muted">Show the rider these points (or read them out), then let them read the full agreement. Their signature below signs it, and a PDF copy is made.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{AGREEMENT_SUMMARY.map((s) => <li key={s}>{s}</li>)}</ul>
          <details className="rounded-lg bg-black/[.03] p-3 text-sm dark:bg-white/[.04]">
            <summary className="cursor-pointer font-semibold">Read the full agreement</summary>
            <div className="mt-3 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {AGREEMENT_SECTIONS.map((s) => (
                <div key={s.title}><p className="font-semibold">{s.title}</p>
                  <ol className="mt-1 space-y-1">{s.clauses.map((c, i) => <li key={i} className="flex gap-2"><span className="text-muted">{s.title.split(".")[0]}.{i + 1}</span><span>{c}</span></li>)}</ol></div>
              ))}
              <p className="text-xs text-muted">Version {AGREEMENT_VERSION}</p>
            </div>
          </details>
          <label className="flex min-h-11 items-start gap-3 text-sm font-medium">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            {riderName} has read the rental agreement and accepts it, including being responsible for any fines, offences and criminal acts during the rental.
          </label>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <SignatureCanvas label={`Rider: ${riderName}`} onChange={setRiderSig} />
        <SignatureCanvas label="Staff" onChange={setStaffSig} />
      </div>
      <p className="text-xs text-muted">{isPickup
        ? "By signing, the rider signs the rental agreement and confirms the vehicle condition, readings and fuel above."
        : "By signing, the rider confirms the vehicle condition, readings and fuel above."}</p>

      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="sticky bottom-0 -mx-3 -mb-3 space-y-2 rounded-b-2xl border-t border-line bg-panel/95 p-3 backdrop-blur sm:static sm:m-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:space-y-0 sm:border-0 sm:bg-transparent sm:p-0">
        {!!problems.length && <p className="text-xs text-muted sm:order-last">Still needed: {problems.join(", ")}</p>}
        <div className="flex items-center gap-3">
          <button type="button" disabled={!!problems.length || !!busy} onClick={submit}
            className="btn btn-primary btn-lg flex-1 sm:flex-none">
            {busy ?? (isPickup ? "Confirm handover" : "Confirm collection")}</button>
          <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-muted">Cancel</button>
        </div>
      </div>
    </section>
  );
}
