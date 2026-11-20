import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { money } from "@/lib/format";
import { VehiclePhotos, type Kind } from "./vehicle-photos";

export const metadata = { title: "Fleet" };

export default function FleetPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Fleet</h1>
        <p className="text-sm text-muted">Set each vehicle&apos;s type and upload real photos. The first photo is what riders see on the listing.</p>
      </div>
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <FleetList />
      </Suspense>
      {/* TODO: add/retire vehicle, maintenance blocks, price plan editor (manager+ only, via Edge Functions) */}
    </div>
  );
}

const STOCK: Record<Kind, string> = { scooter: "/stock/scooter.jpg", motorbike: "/stock/motorbike.jpg", car: "/stock/car.jpg" };

async function FleetList() {
  const { db, user } = await requireStaff();
  const canEdit = user.role === "manager" || user.role === "owner";
  const { data, error } = await db
    .from("vehicles")
    .select("id, kind, photos, plate, make, model, engine_cc, status, odometer_km, branches(name), price_plans(name, hourly, daily, currency)")
    .order("plate");
  if (error) return <p role="alert" className="text-red-600">Could not load fleet.</p>;
  type Row = {
    id: string; kind: Kind; photos: string[]; plate: string; make: string; model: string; engine_cc: number | null;
    status: string; odometer_km: number; branches: { name: string } | null;
    price_plans: { name: string; hourly: number; daily: number; currency: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return <p className="text-muted">No vehicles yet.</p>;

  return (
    <ul className="space-y-3">
      {rows.map((v) => {
        const cover = v.photos[0] ?? STOCK[v.kind];
        return (
          <li key={v.id} className="overflow-hidden rounded-2xl border border-line bg-panel">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-4 p-3 hover:bg-background/60 [&::-webkit-details-marker]:hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="" className={`h-16 w-24 flex-none rounded-lg object-cover ${v.photos.length ? "" : "opacity-60 grayscale"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{v.make} {v.model}</span>
                    <span className="font-mono text-sm text-muted">{v.plate}</span>
                  </div>
                  <div className="text-sm text-muted">
                    <span className="capitalize">{v.kind}</span>
                    {v.engine_cc ? ` · ${v.engine_cc} cc` : ""} · {v.branches?.name}
                    {v.price_plans ? ` · ${money(v.price_plans.hourly, v.price_plans.currency)}/h · ${money(v.price_plans.daily, v.price_plans.currency)}/day` : ""}
                    {` · ${v.odometer_km.toLocaleString()} km`}
                  </div>
                </div>
                <span className={`hidden rounded-full px-2 py-0.5 text-xs font-semibold sm:inline ${v.photos.length ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
                  {v.photos.length ? `${v.photos.length} photo${v.photos.length > 1 ? "s" : ""}` : "No photos"}
                </span>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs capitalize">{v.status}</span>
                <span className="text-muted transition group-open:rotate-90">›</span>
              </summary>
              <div className="border-t border-line p-4">
                <VehiclePhotos vehicleId={v.id} label={`${v.make} ${v.model}`} kind={v.kind} photos={v.photos} canEdit={canEdit} />
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
